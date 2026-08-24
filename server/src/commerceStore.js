import { Pool } from "pg";

export function createCommerceStore(databaseUrl) {
  if (!databaseUrl) {
    return {
      available: false,
      async getAccount() { return null; },
      async getStripeCustomerId() { return null; },
      async listLedger() { return []; },
      async processStripeEvent() { return { processed: false, reason: "unavailable" }; },
      async consumeEnergy() { return { ok: false, error: "unavailable" }; },
      async adminAdjustEnergy() { return { ok: false, error: "unavailable" }; },
      async close() {},
    };
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 5 });
  let schemaPromise = null;

  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = pool.query(`
        CREATE TABLE IF NOT EXISTS academy_commerce_accounts (
          google_sub TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          purchased_energy BIGINT NOT NULL DEFAULT 0 CHECK (purchased_energy >= 0),
          plus_active BOOLEAN NOT NULL DEFAULT FALSE,
          stripe_customer_id TEXT,
          stripe_subscription_id TEXT,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS academy_commerce_events (
          stripe_event_id TEXT PRIMARY KEY,
          event_type TEXT NOT NULL,
          processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS academy_energy_ledger (
          id BIGSERIAL PRIMARY KEY,
          google_sub TEXT NOT NULL,
          delta BIGINT NOT NULL,
          source TEXT NOT NULL,
          external_id TEXT UNIQUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `).catch((error) => {
        schemaPromise = null;
        throw error;
      });
    }
    return schemaPromise;
  }

  async function ensureAccount(client, userSub, email = null) {
    await client.query(`
      INSERT INTO academy_commerce_accounts (google_sub, email)
      VALUES ($1, COALESCE($2, 'unknown@invalid.local'))
      ON CONFLICT (google_sub) DO UPDATE
      SET email = COALESCE($2, academy_commerce_accounts.email), updated_at = NOW()
    `, [userSub, email]);
  }

  return {
    available: true,

    async getAccount(user) {
      await ensureSchema();
      const client = await pool.connect();
      try {
        await ensureAccount(client, user.sub, user.email);
        const result = await client.query(`
          SELECT purchased_energy, plus_active, updated_at
          FROM academy_commerce_accounts WHERE google_sub = $1
        `, [user.sub]);
        return {
          purchasedEnergy: Number(result.rows[0].purchased_energy),
          plusActive: result.rows[0].plus_active,
          updatedAt: result.rows[0].updated_at,
        };
      } finally {
        client.release();
      }
    },

    async getStripeCustomerId(user) {
      await ensureSchema();
      const result = await pool.query(`
        SELECT stripe_customer_id FROM academy_commerce_accounts WHERE google_sub = $1
      `, [user.sub]);
      return result.rows[0]?.stripe_customer_id || null;
    },

    async listLedger(user, limit = 30) {
      await ensureSchema();
      const result = await pool.query(`
        SELECT id, delta, source, external_id, created_at
        FROM academy_energy_ledger
        WHERE google_sub = $1
        ORDER BY created_at DESC
        LIMIT $2
      `, [user.sub, Math.min(100, Math.max(1, Number(limit) || 30))]);
      return result.rows.map((row) => ({
        id: String(row.id),
        delta: Number(row.delta),
        source: row.source,
        externalId: row.external_id || null,
        createdAt: row.created_at,
      }));
    },

    async processStripeEvent(event) {
      await ensureSchema();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const eventInsert = await client.query(`
          INSERT INTO academy_commerce_events (stripe_event_id, event_type)
          VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING stripe_event_id
        `, [event.id, event.type]);
        if (eventInsert.rowCount === 0) {
          await client.query("ROLLBACK");
          return { processed: false, reason: "duplicate" };
        }

        const object = event.data.object;
        const invoiceMetadata = object.parent?.subscription_details?.metadata
          || object.subscription_details?.metadata
          || {};
        let userSub = object.metadata?.user_sub || invoiceMetadata.user_sub || object.client_reference_id || "";
        if (!userSub && object.customer) {
          const ownerResult = await client.query(`
            SELECT google_sub FROM academy_commerce_accounts
            WHERE stripe_customer_id = $1 LIMIT 1
          `, [String(object.customer)]);
          userSub = ownerResult.rows[0]?.google_sub || "";
        }
        const accountEvent = [
          "checkout.session.completed",
          "checkout.session.async_payment_succeeded",
          "customer.subscription.created",
          "customer.subscription.updated",
          "customer.subscription.deleted",
          "invoice.paid",
          "invoice.payment_failed",
          "charge.refunded",
          "charge.dispute.created",
        ].includes(event.type);
        if (accountEvent && !userSub) {
          throw new Error(`StripeAccountOwnerNotFound:${event.type}`);
        }
        if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type) && userSub) {
          await ensureAccount(client, userSub, object.customer_details?.email || null);
          if (object.metadata?.product_type === "energy" && object.payment_status === "paid") {
            const energy = Number.parseInt(object.metadata.energy || "0", 10);
            if (Number.isInteger(energy) && energy > 0) {
              await client.query(`
                INSERT INTO academy_energy_ledger (google_sub, delta, source, external_id)
                VALUES ($1, $2, 'stripe_checkout', $3)
              `, [userSub, energy, event.id]);
              await client.query(`
                UPDATE academy_commerce_accounts
                SET purchased_energy = purchased_energy + $2, stripe_customer_id = $3, updated_at = NOW()
                WHERE google_sub = $1
              `, [userSub, energy, String(object.customer || "") || null]);
            }
          } else if (object.metadata?.product_type === "subscription" && object.payment_status !== "unpaid") {
            await client.query(`
              UPDATE academy_commerce_accounts
              SET plus_active = TRUE, stripe_customer_id = $2, stripe_subscription_id = $3, updated_at = NOW()
              WHERE google_sub = $1
            `, [userSub, String(object.customer || "") || null, String(object.subscription || "") || null]);
          }
        }

        if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type) && userSub) {
          await ensureAccount(client, userSub);
          const plusActive = event.type !== "customer.subscription.deleted"
            && ["active", "trialing"].includes(object.status);
          await client.query(`
            UPDATE academy_commerce_accounts
            SET plus_active = $2, stripe_customer_id = $3, stripe_subscription_id = $4, updated_at = NOW()
            WHERE google_sub = $1
          `, [userSub, plusActive, String(object.customer || "") || null, String(object.id || "") || null]);
        }

        if (["invoice.paid", "invoice.payment_failed"].includes(event.type) && userSub) {
          await ensureAccount(client, userSub);
          const plusActive = event.type === "invoice.paid";
          const subscriptionId = object.parent?.subscription_details?.subscription
            || object.subscription
            || null;
          await client.query(`
            UPDATE academy_commerce_accounts
            SET plus_active = $2,
                stripe_customer_id = COALESCE(NULLIF($3, ''), stripe_customer_id),
                stripe_subscription_id = COALESCE(NULLIF($4, ''), stripe_subscription_id),
                updated_at = NOW()
            WHERE google_sub = $1
          `, [userSub, plusActive, String(object.customer || ""), String(subscriptionId || "")]);
        }

        const reversesEnergy = event.type === "charge.dispute.created"
          || (event.type === "charge.refunded" && (object.refunded === true || object.amount_refunded >= object.amount));
        if (reversesEnergy && userSub && object.metadata?.product_type === "energy") {
          await ensureAccount(client, userSub, object.billing_details?.email || null);
          const requestedEnergy = Number.parseInt(object.metadata.energy || "0", 10);
          if (Number.isInteger(requestedEnergy) && requestedEnergy > 0) {
            const balanceResult = await client.query(`
              SELECT purchased_energy FROM academy_commerce_accounts
              WHERE google_sub = $1 FOR UPDATE
            `, [userSub]);
            const reversedEnergy = Math.min(Number(balanceResult.rows[0]?.purchased_energy || 0), requestedEnergy);
            if (reversedEnergy > 0) {
              await client.query(`
                UPDATE academy_commerce_accounts
                SET purchased_energy = purchased_energy - $2, updated_at = NOW()
                WHERE google_sub = $1
              `, [userSub, reversedEnergy]);
              await client.query(`
                INSERT INTO academy_energy_ledger (google_sub, delta, source, external_id)
                VALUES ($1, $2, $3, $4)
              `, [userSub, -reversedEnergy, event.type, event.id]);
            }
          }
        }

        await client.query("COMMIT");
        return { processed: true };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async consumeEnergy(user, amount, reason) {
      await ensureSchema();
      if (!Number.isInteger(amount) || amount < 1 || amount > 20) {
        return { ok: false, error: "invalid_amount" };
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await ensureAccount(client, user.sub, user.email);
        const result = await client.query(`
          UPDATE academy_commerce_accounts
          SET purchased_energy = purchased_energy - $2, updated_at = NOW()
          WHERE google_sub = $1 AND purchased_energy >= $2
          RETURNING purchased_energy
        `, [user.sub, amount]);
        if (result.rowCount === 0) {
          await client.query("ROLLBACK");
          return { ok: false, error: "insufficient_energy" };
        }
        await client.query(`
          INSERT INTO academy_energy_ledger (google_sub, delta, source)
          VALUES ($1, $2, $3)
        `, [user.sub, -amount, reason]);
        await client.query("COMMIT");
        return { ok: true, purchasedEnergy: Number(result.rows[0].purchased_energy) };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async adminAdjustEnergy(targetUser, delta, actorSub) {
      await ensureSchema();
      if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 1_000_000) {
        return { ok: false, error: "invalid_amount" };
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await ensureAccount(client, targetUser.sub, targetUser.email);
        const balanceResult = await client.query(`
          SELECT purchased_energy FROM academy_commerce_accounts
          WHERE google_sub = $1 FOR UPDATE
        `, [targetUser.sub]);
        const current = Number(balanceResult.rows[0]?.purchased_energy || 0);
        const next = current + delta;
        if (next < 0) {
          await client.query("ROLLBACK");
          return { ok: false, error: "insufficient_energy", purchasedEnergy: current };
        }
        await client.query(`
          UPDATE academy_commerce_accounts SET purchased_energy = $2, updated_at = NOW()
          WHERE google_sub = $1
        `, [targetUser.sub, next]);
        await client.query(`
          INSERT INTO academy_energy_ledger (google_sub, delta, source)
          VALUES ($1, $2, $3)
        `, [targetUser.sub, delta, `admin_adjustment:${String(actorSub).slice(0, 120)}`]);
        await client.query("COMMIT");
        return { ok: true, purchasedEnergy: next };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async close() {
      await pool.end();
    },
  };
}
