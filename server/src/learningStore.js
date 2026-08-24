import { Pool } from "pg";

const MAX_PROFILE_BYTES = 512 * 1024;

function normalizeProfile(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    const error = new Error("Learning profile must be an object.");
    error.statusCode = 400;
    throw error;
  }

  const serialized = JSON.stringify(profile);
  if (Buffer.byteLength(serialized, "utf8") > MAX_PROFILE_BYTES) {
    const error = new Error("Learning profile is too large.");
    error.statusCode = 413;
    throw error;
  }

  return JSON.parse(serialized);
}

export function createLearningStore(databaseUrl) {
  if (!databaseUrl) {
    return {
      available: false,
      async read() { return null; },
      async write() { return null; },
      async close() {},
    };
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 5 });
  let schemaPromise = null;

  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = pool.query(`
        CREATE TABLE IF NOT EXISTS academy_learning_profiles (
          google_sub TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          display_name TEXT NOT NULL,
          profile JSONB NOT NULL DEFAULT '{}'::jsonb,
          revision INTEGER NOT NULL DEFAULT 1,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `).catch((error) => {
        schemaPromise = null;
        throw error;
      });
    }
    return schemaPromise;
  }

  return {
    available: true,

    async read(user) {
      await ensureSchema();
      const result = await pool.query(
        "SELECT profile, revision, updated_at FROM academy_learning_profiles WHERE google_sub = $1",
        [user.sub]
      );
      if (result.rowCount === 0) return null;
      return {
        profile: result.rows[0].profile,
        revision: result.rows[0].revision,
        updatedAt: result.rows[0].updated_at,
      };
    },

    async write(user, profile) {
      await ensureSchema();
      const safeProfile = normalizeProfile(profile);
      const result = await pool.query(`
        INSERT INTO academy_learning_profiles (google_sub, email, display_name, profile)
        VALUES ($1, $2, $3, $4::jsonb)
        ON CONFLICT (google_sub) DO UPDATE SET
          email = EXCLUDED.email,
          display_name = EXCLUDED.display_name,
          profile = EXCLUDED.profile,
          revision = academy_learning_profiles.revision + 1,
          updated_at = NOW()
        RETURNING revision, updated_at
      `, [user.sub, user.email, user.name || user.email, JSON.stringify(safeProfile)]);
      return {
        profile: safeProfile,
        revision: result.rows[0].revision,
        updatedAt: result.rows[0].updated_at,
      };
    },

    async close() {
      await pool.end();
    },
  };
}
