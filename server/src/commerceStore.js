import { Pool } from "pg";

import { findCommerceProduct } from "./commerceCatalog.js";

const CHECKOUT_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);

const SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

const INVOICE_EVENTS = new Set(["invoice.paid", "invoice.payment_failed"]);
const REFUND_EVENTS = new Set(["charge.refunded", "refund.created", "refund.updated", "refund.failed"]);
const DISPUTE_EVENTS = new Set(["charge.dispute.created", "charge.dispute.closed"]);

function stripeId(value) {
  if (typeof value === "string") return value;
  return typeof value?.id === "string" ? value.id : "";
}

function positiveInteger(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

export function calculateRefundEnergyTarget(energy, refundedAmount, purchaseAmount) {
  const safeEnergy = positiveInteger(energy);
  const safeRefund = Math.max(0, Number(refundedAmount) || 0);
  const safeAmount = Math.max(0, Number(purchaseAmount) || 0);
  if (!safeEnergy || !safeRefund || !safeAmount) return 0;
  if (safeRefund >= safeAmount) return safeEnergy;
  return Math.min(safeEnergy, Math.ceil((safeEnergy * safeRefund) / safeAmount));
}

export function createCommerceStore(databaseUrl, options = {}) {
  const suppliedPool = options.pool ?? null;
  if (!databaseUrl && !suppliedPool) {
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

  const pool = suppliedPool || new Pool({ connectionString: databaseUrl, max: 5 });
  let schemaPromise = null;

  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = pool.query(`
        CREATE TABLE IF NOT EXISTS academy_commerce_accounts (
          google_sub TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          purchased_energy BIGINT NOT NULL DEFAULT 0 CHECK (purchased_energy >= 0),
          energy_debt BIGINT NOT NULL DEFAULT 0 CHECK (energy_debt >= 0),
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
        CREATE TABLE IF NOT EXISTS academy_commerce_purchases (
          purchase_key TEXT PRIMARY KEY,
          stripe_checkout_session_id TEXT UNIQUE,
          stripe_payment_intent_id TEXT UNIQUE,
          stripe_charge_id TEXT UNIQUE,
          google_sub TEXT NOT NULL,
          product_id TEXT NOT NULL,
          product_type TEXT NOT NULL,
          energy BIGINT NOT NULL DEFAULT 0,
          amount_cents BIGINT NOT NULL DEFAULT 0,
          currency TEXT NOT NULL DEFAULT 'brl',
          credited_energy BIGINT NOT NULL DEFAULT 0,
          refund_reversed_energy BIGINT NOT NULL DEFAULT 0,
          reversed_energy BIGINT NOT NULL DEFAULT 0,
          debt_energy BIGINT NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'pending',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS academy_commerce_disputes (
          stripe_dispute_id TEXT PRIMARY KEY,
          purchase_key TEXT NOT NULL REFERENCES academy_commerce_purchases(purchase_key),
          active_reversal BOOLEAN NOT NULL DEFAULT TRUE,
          status TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        ALTER TABLE academy_commerce_accounts
          ADD COLUMN IF NOT EXISTS energy_debt BIGINT NOT NULL DEFAULT 0 CHECK (energy_debt >= 0);
        ALTER TABLE academy_commerce_purchases
          ADD COLUMN IF NOT EXISTS debt_energy BIGINT NOT NULL DEFAULT 0 CHECK (debt_energy >= 0);
        UPDATE academy_commerce_accounts
        SET plus_active = FALSE, updated_at = NOW()
        WHERE plus_active = TRUE AND stripe_subscription_id IS NULL;
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

  async function upsertEnergyPurchase(client, context) {
    const purchaseKey = context.paymentIntentId
      || (context.checkoutSessionId ? `checkout:${context.checkoutSessionId}` : "")
      || (context.chargeId ? `charge:${context.chargeId}` : "");
    if (!purchaseKey) {
      throw new Error("StripePurchaseReferenceMissing");
    }
    const result = await client.query(`
      INSERT INTO academy_commerce_purchases (
        purchase_key, stripe_checkout_session_id, stripe_payment_intent_id, stripe_charge_id,
        google_sub, product_id, product_type, energy, amount_cents, currency, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (purchase_key) DO UPDATE SET
        stripe_checkout_session_id = COALESCE(EXCLUDED.stripe_checkout_session_id, academy_commerce_purchases.stripe_checkout_session_id),
        stripe_payment_intent_id = COALESCE(EXCLUDED.stripe_payment_intent_id, academy_commerce_purchases.stripe_payment_intent_id),
        stripe_charge_id = COALESCE(EXCLUDED.stripe_charge_id, academy_commerce_purchases.stripe_charge_id),
        google_sub = EXCLUDED.google_sub,
        product_id = EXCLUDED.product_id,
        product_type = EXCLUDED.product_type,
        energy = GREATEST(EXCLUDED.energy, academy_commerce_purchases.energy),
        amount_cents = GREATEST(EXCLUDED.amount_cents, academy_commerce_purchases.amount_cents),
        currency = EXCLUDED.currency,
        status = EXCLUDED.status,
        updated_at = NOW()
      RETURNING *
    `, [
      purchaseKey,
      context.checkoutSessionId || null,
      context.paymentIntentId || null,
      context.chargeId || null,
      context.userSub,
      context.productId,
      context.productType,
      context.energy,
      context.amountCents,
      context.currency,
      context.status,
    ]);
    return result.rows[0];
  }

  async function creditEnergyPurchase(client, purchase, customerId, email) {
    const energy = positiveInteger(purchase.energy);
    const alreadyCredited = positiveInteger(purchase.credited_energy);
    const nominalCredit = Math.max(0, energy - alreadyCredited);
    await ensureAccount(client, purchase.google_sub, email);
    if (!nominalCredit) return;

    const accountResult = await client.query(`
      SELECT purchased_energy, energy_debt FROM academy_commerce_accounts
      WHERE google_sub = $1 FOR UPDATE
    `, [purchase.google_sub]);
    const currentDebt = Number(accountResult.rows[0]?.energy_debt || 0);
    const currentBalance = Number(accountResult.rows[0]?.purchased_energy || 0);
    const debtOffset = Math.min(currentDebt, nominalCredit);
    const balanceCredit = nominalCredit - debtOffset;
    let remainingDebtOffset = debtOffset;
    if (remainingDebtOffset > 0) {
      const debtPurchases = await client.query(`
        SELECT purchase_key, debt_energy FROM academy_commerce_purchases
        WHERE google_sub = $1 AND debt_energy > 0
        ORDER BY updated_at, purchase_key
        FOR UPDATE
      `, [purchase.google_sub]);
      for (const debtPurchase of debtPurchases.rows) {
        if (remainingDebtOffset <= 0) break;
        const reduction = Math.min(Number(debtPurchase.debt_energy), remainingDebtOffset);
        await client.query(`
          UPDATE academy_commerce_purchases
          SET debt_energy = debt_energy - $2, updated_at = NOW()
          WHERE purchase_key = $1
        `, [debtPurchase.purchase_key, reduction]);
        remainingDebtOffset -= reduction;
      }
      if (remainingDebtOffset !== 0) {
        throw new Error("CommerceDebtAllocationMismatch");
      }
    }
    await client.query(`
      UPDATE academy_commerce_accounts
      SET purchased_energy = $2,
          energy_debt = $3,
          stripe_customer_id = COALESCE($4, stripe_customer_id),
          updated_at = NOW()
      WHERE google_sub = $1
    `, [purchase.google_sub, currentBalance + balanceCredit, currentDebt - debtOffset, customerId || null]);
    if (balanceCredit > 0) {
      await client.query(`
        INSERT INTO academy_energy_ledger (google_sub, delta, source, external_id)
        VALUES ($1, $2, 'stripe_checkout', $3)
        ON CONFLICT (external_id) DO NOTHING
      `, [purchase.google_sub, balanceCredit, `purchase:${purchase.purchase_key}`]);
    }
    await client.query(`
      UPDATE academy_commerce_purchases
      SET credited_energy = $2, status = 'paid', updated_at = NOW()
      WHERE purchase_key = $1
    `, [purchase.purchase_key, energy]);
  }

  async function applyEnergyReversalTarget(client, purchase, target, event) {
    const currentTarget = Number(purchase.reversed_energy || 0);
    const nextTarget = Math.max(0, Math.min(Number(purchase.energy || 0), Number(target) || 0));
    const nominalChange = nextTarget - currentTarget;
    if (nominalChange === 0) return;

    const accountResult = await client.query(`
      SELECT purchased_energy, energy_debt FROM academy_commerce_accounts
      WHERE google_sub = $1 FOR UPDATE
    `, [purchase.google_sub]);
    const balance = Number(accountResult.rows[0]?.purchased_energy || 0);
    const accountDebt = Number(accountResult.rows[0]?.energy_debt || 0);
    const purchaseDebt = Number(purchase.debt_energy || 0);
    let balanceDelta = 0;
    let debtDelta = 0;

    if (nominalChange > 0) {
      const deducted = Math.min(balance, nominalChange);
      balanceDelta = -deducted;
      debtDelta = nominalChange - deducted;
    } else {
      const restoration = Math.abs(nominalChange);
      const debtReduction = Math.min(purchaseDebt, restoration);
      debtDelta = -debtReduction;
      balanceDelta = restoration - debtReduction;
    }

    await client.query(`
      UPDATE academy_commerce_accounts
      SET purchased_energy = $2,
          energy_debt = $3,
          updated_at = NOW()
      WHERE google_sub = $1
    `, [purchase.google_sub, balance + balanceDelta, accountDebt + debtDelta]);
    if (balanceDelta !== 0) {
      await client.query(`
        INSERT INTO academy_energy_ledger (google_sub, delta, source, external_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (external_id) DO NOTHING
      `, [purchase.google_sub, balanceDelta, event.type, event.id]);
    }
    await client.query(`
      UPDATE academy_commerce_purchases
      SET reversed_energy = $2,
          debt_energy = debt_energy + $3,
          updated_at = NOW()
      WHERE purchase_key = $1
    `, [purchase.purchase_key, nextTarget, debtDelta]);
  }

  return {
    available: true,

    async getAccount(user) {
      await ensureSchema();
      const client = await pool.connect();
      try {
        await ensureAccount(client, user.sub, user.email);
        const result = await client.query(`
          SELECT purchased_energy, energy_debt, plus_active, updated_at
          FROM academy_commerce_accounts WHERE google_sub = $1
        `, [user.sub]);
        return {
          purchasedEnergy: Number(result.rows[0].purchased_energy),
          energyDebt: Number(result.rows[0].energy_debt),
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
        const duplicateEvent = eventInsert.rowCount === 0;
        if (duplicateEvent && !CHECKOUT_EVENTS.has(event.type)) {
          await client.query("ROLLBACK");
          return { processed: false, reason: "duplicate" };
        }

        const object = event.data.object;
        const relatedCharge = event.commerceRelatedCharge
          || (event.type === "charge.refunded" ? object : null);
        const invoiceMetadata = object.parent?.subscription_details?.metadata
          || object.subscription_details?.metadata
          || {};
        const metadata = {
          ...(relatedCharge?.metadata || {}),
          ...invoiceMetadata,
          ...(object.metadata || {}),
        };
        const customerId = stripeId(object.customer) || stripeId(relatedCharge?.customer);
        let userSub = metadata.user_sub || object.client_reference_id || "";
        if (!userSub && customerId) {
          const ownerResult = await client.query(`
            SELECT google_sub FROM academy_commerce_accounts
            WHERE stripe_customer_id = $1 LIMIT 1
          `, [customerId]);
          userSub = ownerResult.rows[0]?.google_sub || "";
        }

        const accountEvent = CHECKOUT_EVENTS.has(event.type)
          || SUBSCRIPTION_EVENTS.has(event.type)
          || INVOICE_EVENTS.has(event.type)
          || REFUND_EVENTS.has(event.type)
          || DISPUTE_EVENTS.has(event.type);
        if (accountEvent && !userSub) {
          throw new Error(`StripeAccountOwnerNotFound:${event.type}`);
        }

        if (CHECKOUT_EVENTS.has(event.type) && userSub) {
          await ensureAccount(client, userSub, object.customer_details?.email || null);
          const product = findCommerceProduct(metadata.product_id);
          if (!product || product.type !== metadata.product_type) {
            throw new Error(`StripeProductMetadataInvalid:${metadata.product_id || "missing"}`);
          }
          if (product.type === "energy") {
            const paymentIntentId = stripeId(object.payment_intent);
            const purchase = await upsertEnergyPurchase(client, {
              checkoutSessionId: stripeId(object.id),
              paymentIntentId,
              chargeId: "",
              userSub,
              productId: product.id,
              productType: "energy",
              energy: product.energy,
              amountCents: positiveInteger(object.amount_total),
              currency: String(object.currency || "brl"),
              status: object.payment_status === "paid" ? "paid" : "pending",
            });
            if (object.payment_status === "paid") {
              await creditEnergyPurchase(client, purchase, customerId, object.customer_details?.email || null);
            }
          } else if (product.id === "plus-monthly" && object.payment_status !== "unpaid") {
            await client.query(`
              UPDATE academy_commerce_accounts
              SET plus_active = TRUE,
                  stripe_customer_id = COALESCE($2, stripe_customer_id),
                  stripe_subscription_id = COALESCE($3, stripe_subscription_id),
                  updated_at = NOW()
              WHERE google_sub = $1
            `, [userSub, customerId || null, stripeId(object.subscription) || null]);
          }
        }

        if (SUBSCRIPTION_EVENTS.has(event.type) && userSub) {
          if (metadata.product_type !== "subscription" || metadata.product_id !== "plus-monthly") {
            throw new Error("StripeSubscriptionMetadataInvalid");
          }
          await ensureAccount(client, userSub);
          const plusActive = event.type !== "customer.subscription.deleted"
            && ["active", "trialing"].includes(object.status);
          await client.query(`
            UPDATE academy_commerce_accounts
            SET plus_active = $2,
                stripe_customer_id = COALESCE($3, stripe_customer_id),
                stripe_subscription_id = COALESCE($4, stripe_subscription_id),
                updated_at = NOW()
            WHERE google_sub = $1
          `, [userSub, plusActive, customerId || null, stripeId(object.id) || null]);
        }

        if (INVOICE_EVENTS.has(event.type) && userSub) {
          if (metadata.product_type !== "subscription" || metadata.product_id !== "plus-monthly") {
            throw new Error("StripeInvoiceMetadataInvalid");
          }
          await ensureAccount(client, userSub);
          const plusActive = event.type === "invoice.paid";
          const subscriptionId = stripeId(object.parent?.subscription_details?.subscription)
            || stripeId(object.subscription);
          await client.query(`
            UPDATE academy_commerce_accounts
            SET plus_active = $2,
                stripe_customer_id = COALESCE($3, stripe_customer_id),
                stripe_subscription_id = COALESCE($4, stripe_subscription_id),
                updated_at = NOW()
            WHERE google_sub = $1
          `, [userSub, plusActive, customerId || null, subscriptionId || null]);
        }

        if ((REFUND_EVENTS.has(event.type) || DISPUTE_EVENTS.has(event.type)) && userSub && relatedCharge) {
          const chargeMetadata = relatedCharge.metadata || metadata;
          const productType = chargeMetadata.product_type
            || (relatedCharge.invoice ? "subscription" : "");
          if (productType === "energy") {
            await ensureAccount(client, userSub, relatedCharge.billing_details?.email || null);
            const purchase = await upsertEnergyPurchase(client, {
              checkoutSessionId: "",
              paymentIntentId: stripeId(relatedCharge.payment_intent) || stripeId(object.payment_intent),
              chargeId: stripeId(relatedCharge.id) || stripeId(object.charge),
              userSub,
              productId: chargeMetadata.product_id || "unknown-energy",
              productType: "energy",
              energy: positiveInteger(chargeMetadata.energy),
              amountCents: positiveInteger(relatedCharge.amount),
              currency: String(relatedCharge.currency || "brl"),
              status: event.type,
            });
            let refundTarget = Number(purchase.refund_reversed_energy || 0);
            if (REFUND_EVENTS.has(event.type)) {
              refundTarget = calculateRefundEnergyTarget(
                purchase.energy,
                relatedCharge.amount_refunded,
                purchase.amount_cents || relatedCharge.amount
              );
              await client.query(`
                UPDATE academy_commerce_purchases
                SET refund_reversed_energy = $2, status = $3, updated_at = NOW()
                WHERE purchase_key = $1
              `, [purchase.purchase_key, refundTarget, event.type]);
            }
            if (DISPUTE_EVENTS.has(event.type)) {
              const disputeStatus = String(object.status || (event.type.endsWith("created") ? "needs_response" : "unknown"));
              const activeReversal = event.type === "charge.dispute.created" || disputeStatus !== "won";
              await client.query(`
                INSERT INTO academy_commerce_disputes (
                  stripe_dispute_id, purchase_key, active_reversal, status
                ) VALUES ($1, $2, $3, $4)
                ON CONFLICT (stripe_dispute_id) DO UPDATE SET
                  purchase_key = EXCLUDED.purchase_key,
                  active_reversal = EXCLUDED.active_reversal,
                  status = EXCLUDED.status,
                  updated_at = NOW()
              `, [stripeId(object.id), purchase.purchase_key, activeReversal, disputeStatus]);
            }
            const activeDisputes = await client.query(`
              SELECT COUNT(*) AS count FROM academy_commerce_disputes
              WHERE purchase_key = $1 AND active_reversal = TRUE
            `, [purchase.purchase_key]);
            const disputeTarget = Number(activeDisputes.rows[0]?.count || 0) > 0
              ? Number(purchase.energy)
              : 0;
            const refreshedPurchase = await client.query(`
              SELECT * FROM academy_commerce_purchases
              WHERE purchase_key = $1 FOR UPDATE
            `, [purchase.purchase_key]);
            await applyEnergyReversalTarget(
              client,
              refreshedPurchase.rows[0],
              Math.max(refundTarget, disputeTarget),
              event
            );
          } else if (productType === "subscription") {
            const revokePlus = DISPUTE_EVENTS.has(event.type)
              ? event.type === "charge.dispute.created" || String(object.status || "") !== "won"
              : Number(relatedCharge.amount_refunded || 0) >= Number(relatedCharge.amount || 0);
            if (revokePlus) {
              await client.query(`
                UPDATE academy_commerce_accounts
                SET plus_active = FALSE, updated_at = NOW()
                WHERE google_sub = $1
              `, [userSub]);
            } else if (event.commerceSubscriptionActive === true) {
              await client.query(`
                UPDATE academy_commerce_accounts
                SET plus_active = TRUE, updated_at = NOW()
                WHERE google_sub = $1
              `, [userSub]);
            }
          }
        }

        await client.query("COMMIT");
        return duplicateEvent
          ? { processed: false, reason: "duplicate" }
          : { processed: true };
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
