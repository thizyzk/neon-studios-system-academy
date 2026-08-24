import { Pool } from "pg";

export const ADMIN_ROLES = Object.freeze(["user", "support", "moderator", "administrator", "owner"]);

const ROLE_RANK = Object.freeze({ user: 0, support: 1, moderator: 2, administrator: 3, owner: 4 });
const PERMISSIONS = Object.freeze({
  "users.read": "support",
  "users.revoke": "support",
  "users.ban": "moderator",
  "energy.adjust": "administrator",
  "audit.read": "administrator",
  "integrations.manage": "owner",
  "roles.manage": "owner",
});

export function normalizeAdminRole(role) {
  return ADMIN_ROLES.includes(role) ? role : "user";
}

export function hasAdminPermission(role, permission) {
  const minimumRole = PERMISSIONS[permission];
  if (!minimumRole) return false;
  return ROLE_RANK[normalizeAdminRole(role)] >= ROLE_RANK[minimumRole];
}

function normalizeUserRow(row, bootstrapEmails) {
  if (!row) return null;
  const bootstrapOwner = bootstrapEmails.includes(String(row.email || "").toLowerCase());
  const role = bootstrapOwner ? "owner" : normalizeAdminRole(row.role);
  return {
    sub: row.google_sub,
    email: row.email,
    name: row.name || row.email,
    role,
    isAdmin: ROLE_RANK[role] >= ROLE_RANK.support,
    sessionVersion: Number(row.session_version || 0),
    bannedUntil: row.banned_until || null,
    bannedReason: row.banned_reason || "",
    lastLoginAt: row.last_login_at || null,
    createdAt: row.created_at || null,
    purchasedEnergy: Number(row.purchased_energy || 0),
    plusActive: row.plus_active === true,
  };
}

export function createAdminStore(databaseUrl, bootstrapEmails = []) {
  const normalizedBootstrapEmails = [...new Set(bootstrapEmails.map((email) => String(email).trim().toLowerCase()).filter(Boolean))];
  if (!databaseUrl) {
    return {
      available: false,
      async recordLogin(user) {
        const role = normalizedBootstrapEmails.includes(user.email.toLowerCase()) ? "owner" : "user";
        return { ...user, role, isAdmin: role === "owner", sessionVersion: 0, bannedUntil: null, bannedReason: "" };
      },
      async getAccessState(user) {
        const role = normalizedBootstrapEmails.includes(user.email.toLowerCase()) ? "owner" : "user";
        return { ...user, role, isAdmin: role === "owner", sessionVersion: 0, bannedUntil: null, bannedReason: "" };
      },
      async listUsers() { return { users: [], total: 0 }; },
      async getUser() { return null; },
      async setRole() { return null; },
      async setBan() { return null; },
      async revokeSessions() { return null; },
      async writeAudit() {},
      async listAudit() { return []; },
      async close() {},
    };
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 3 });
  let schemaPromise = null;

  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = pool.query(`
        CREATE TABLE IF NOT EXISTS academy_admin_users (
          google_sub TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          name TEXT NOT NULL DEFAULT '',
          role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'support', 'moderator', 'administrator', 'owner')),
          session_version BIGINT NOT NULL DEFAULT 0,
          banned_until TIMESTAMPTZ,
          banned_reason TEXT NOT NULL DEFAULT '',
          last_login_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS academy_admin_users_email_lower_idx
          ON academy_admin_users (LOWER(email));
        CREATE TABLE IF NOT EXISTS academy_admin_audit (
          id BIGSERIAL PRIMARY KEY,
          actor_sub TEXT NOT NULL,
          actor_email TEXT NOT NULL,
          action TEXT NOT NULL,
          target_sub TEXT,
          details JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS academy_admin_audit_created_idx
          ON academy_admin_audit (created_at DESC);
      `).catch((error) => {
        schemaPromise = null;
        throw error;
      });
    }
    return schemaPromise;
  }

  async function ensureUser(user, login = false) {
    await ensureSchema();
    const bootstrapOwner = normalizedBootstrapEmails.includes(user.email.toLowerCase());
    const result = await pool.query(`
      INSERT INTO academy_admin_users (google_sub, email, name, role, last_login_at)
      VALUES ($1, $2, $3, $4, ${login ? "NOW()" : "NULL"})
      ON CONFLICT (google_sub) DO UPDATE SET
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        role = CASE WHEN $4 = 'owner' THEN 'owner' ELSE academy_admin_users.role END,
        last_login_at = CASE WHEN $5 THEN NOW() ELSE academy_admin_users.last_login_at END,
        updated_at = NOW()
      RETURNING *
    `, [user.sub, user.email.toLowerCase(), String(user.name || user.email).slice(0, 160), bootstrapOwner ? "owner" : "user", login]);
    return normalizeUserRow(result.rows[0], normalizedBootstrapEmails);
  }

  return {
    available: true,

    async recordLogin(user) {
      return ensureUser(user, true);
    },

    async getAccessState(user) {
      await ensureSchema();
      const result = await pool.query("SELECT * FROM academy_admin_users WHERE google_sub = $1", [user.sub]);
      if (!result.rows[0]) return ensureUser(user, false);
      return normalizeUserRow(result.rows[0], normalizedBootstrapEmails);
    },

    async listUsers({ query = "", limit = 50, offset = 0 } = {}) {
      await ensureSchema();
      const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
      const safeOffset = Math.max(0, Number(offset) || 0);
      const search = String(query).trim().slice(0, 80);
      const result = await pool.query(`
        SELECT users.*, commerce.purchased_energy, commerce.plus_active,
          COUNT(*) OVER() AS total_count
        FROM academy_admin_users users
        LEFT JOIN academy_commerce_accounts commerce ON commerce.google_sub = users.google_sub
        WHERE ($1 = '' OR users.email ILIKE '%' || $1 || '%' OR users.name ILIKE '%' || $1 || '%')
        ORDER BY users.last_login_at DESC NULLS LAST, users.created_at DESC
        LIMIT $2 OFFSET $3
      `, [search, safeLimit, safeOffset]);
      return {
        users: result.rows.map((row) => normalizeUserRow(row, normalizedBootstrapEmails)),
        total: Number(result.rows[0]?.total_count || 0),
      };
    },

    async getUser(targetSub) {
      await ensureSchema();
      const result = await pool.query(`
        SELECT users.*, commerce.purchased_energy, commerce.plus_active
        FROM academy_admin_users users
        LEFT JOIN academy_commerce_accounts commerce ON commerce.google_sub = users.google_sub
        WHERE users.google_sub = $1
      `, [targetSub]);
      return normalizeUserRow(result.rows[0], normalizedBootstrapEmails);
    },

    async setRole(targetSub, role) {
      await ensureSchema();
      const normalizedRole = normalizeAdminRole(role);
      const result = await pool.query(`
        UPDATE academy_admin_users
        SET role = $2, session_version = session_version + 1, updated_at = NOW()
        WHERE google_sub = $1
        RETURNING *
      `, [targetSub, normalizedRole]);
      return normalizeUserRow(result.rows[0], normalizedBootstrapEmails);
    },

    async setBan(targetSub, { until = null, reason = "" } = {}) {
      await ensureSchema();
      const result = await pool.query(`
        UPDATE academy_admin_users
        SET banned_until = $2, banned_reason = $3, session_version = session_version + 1, updated_at = NOW()
        WHERE google_sub = $1
        RETURNING *
      `, [targetSub, until, String(reason).trim().slice(0, 300)]);
      return normalizeUserRow(result.rows[0], normalizedBootstrapEmails);
    },

    async revokeSessions(targetSub) {
      await ensureSchema();
      const result = await pool.query(`
        UPDATE academy_admin_users
        SET session_version = session_version + 1, updated_at = NOW()
        WHERE google_sub = $1
        RETURNING *
      `, [targetSub]);
      return normalizeUserRow(result.rows[0], normalizedBootstrapEmails);
    },

    async writeAudit(actor, action, targetSub = null, details = {}) {
      await ensureSchema();
      await pool.query(`
        INSERT INTO academy_admin_audit (actor_sub, actor_email, action, target_sub, details)
        VALUES ($1, $2, $3, $4, $5::jsonb)
      `, [actor.sub, actor.email, String(action).slice(0, 80), targetSub, JSON.stringify(details)]);
    },

    async listAudit(limit = 100) {
      await ensureSchema();
      const result = await pool.query(`
        SELECT id, actor_sub, actor_email, action, target_sub, details, created_at
        FROM academy_admin_audit ORDER BY created_at DESC LIMIT $1
      `, [Math.min(200, Math.max(1, Number(limit) || 100))]);
      return result.rows.map((row) => ({
        id: String(row.id), actorSub: row.actor_sub, actorEmail: row.actor_email,
        action: row.action, targetSub: row.target_sub, details: row.details, createdAt: row.created_at,
      }));
    },

    async close() {
      await pool.end();
    },
  };
}
