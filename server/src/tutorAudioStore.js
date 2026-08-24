import { Pool } from "pg";

function storeError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function createTutorAudioStore(databaseUrl) {
  if (!databaseUrl) {
    return {
      available: false,
      async createPending() { return null; },
      async get() { return null; },
      async getPending() { return null; },
      async finalize() { return null; },
      async remove() { return null; },
      async close() {},
    };
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 5 });
  let schemaPromise = null;

  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = pool.query(`
        CREATE TABLE IF NOT EXISTS academy_tutor_audio (
          audio_id UUID PRIMARY KEY,
          google_sub TEXT NOT NULL,
          object_key TEXT NOT NULL UNIQUE,
          content_type TEXT NOT NULL,
          expected_size_bytes BIGINT NOT NULL CHECK (expected_size_bytes > 0),
          actual_size_bytes BIGINT,
          duration_ms INTEGER NOT NULL CHECK (duration_ms > 0),
          transcript TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready')),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMPTZ NOT NULL
        );
        CREATE INDEX IF NOT EXISTS academy_tutor_audio_owner_created_idx
          ON academy_tutor_audio (google_sub, created_at DESC);
        CREATE TABLE IF NOT EXISTS academy_tutor_audio_usage (
          google_sub TEXT NOT NULL,
          usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
          upload_count INTEGER NOT NULL DEFAULT 0 CHECK (upload_count >= 0),
          PRIMARY KEY (google_sub, usage_date)
        );
      `).catch((error) => {
        schemaPromise = null;
        throw error;
      });
    }
    return schemaPromise;
  }

  return {
    available: true,

    async createPending(user, audio, limits) {
      await ensureSchema();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(`
          DELETE FROM academy_tutor_audio
          WHERE (status = 'pending' AND created_at < NOW() - INTERVAL '15 minutes')
             OR expires_at <= NOW()
        `);
        await client.query("DELETE FROM academy_tutor_audio_usage WHERE usage_date < CURRENT_DATE - 90");
        const usage = await client.query(`
          INSERT INTO academy_tutor_audio_usage (google_sub, usage_date, upload_count)
          VALUES ($1, CURRENT_DATE, 1)
          ON CONFLICT (google_sub, usage_date) DO UPDATE
          SET upload_count = academy_tutor_audio_usage.upload_count + 1
          WHERE academy_tutor_audio_usage.upload_count < $2
          RETURNING upload_count
        `, [user.sub, limits.maxDaily]);
        if (usage.rowCount === 0) {
          await client.query("ROLLBACK");
          throw storeError("Daily audio limit reached.", 429);
        }
        await client.query(`
          INSERT INTO academy_tutor_audio (
            audio_id, google_sub, object_key, content_type, expected_size_bytes, duration_ms, expires_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW() + ($7 * INTERVAL '1 day'))
        `, [audio.audioId, user.sub, audio.objectKey, audio.contentType, audio.sizeBytes, audio.durationMs, limits.retentionDays]);
        await client.query("COMMIT");
        return audio;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },

    async get(user, audioId) {
      await ensureSchema();
      const result = await pool.query(`
        SELECT audio_id, object_key, content_type, actual_size_bytes, duration_ms, transcript, created_at, expires_at
        FROM academy_tutor_audio
        WHERE audio_id = $1 AND google_sub = $2 AND status = 'ready' AND expires_at > NOW()
      `, [audioId, user.sub]);
      if (result.rowCount === 0) return null;
      const row = result.rows[0];
      return {
        audioId: row.audio_id,
        objectKey: row.object_key,
        contentType: row.content_type,
        sizeBytes: Number(row.actual_size_bytes),
        durationMs: row.duration_ms,
        transcript: row.transcript,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
      };
    },

    async getPending(user, audioId) {
      await ensureSchema();
      const result = await pool.query(`
        SELECT audio_id, object_key, content_type, expected_size_bytes, duration_ms
        FROM academy_tutor_audio
        WHERE audio_id = $1 AND google_sub = $2 AND status = 'pending'
      `, [audioId, user.sub]);
      if (result.rowCount === 0) return null;
      const row = result.rows[0];
      return {
        audioId: row.audio_id,
        objectKey: row.object_key,
        contentType: row.content_type,
        sizeBytes: Number(row.expected_size_bytes),
        durationMs: row.duration_ms,
      };
    },

    async finalize(user, audioId, uploaded) {
      await ensureSchema();
      const pending = await this.getPending(user, audioId);
      if (!pending) throw storeError("Pending audio was not found.", 404);
      if (pending.sizeBytes !== uploaded.sizeBytes || pending.contentType !== uploaded.contentType) {
        throw storeError("Uploaded audio does not match its signed request.", 400);
      }
      const result = await pool.query(`
        UPDATE academy_tutor_audio
        SET status = 'ready', actual_size_bytes = $3
        WHERE audio_id = $1 AND google_sub = $2 AND status = 'pending'
        RETURNING audio_id
      `, [audioId, user.sub, uploaded.sizeBytes]);
      if (result.rowCount === 0) throw storeError("Audio could not be finalized.", 409);
      return this.get(user, audioId);
    },

    async remove(user, audioId) {
      await ensureSchema();
      const result = await pool.query(`
        DELETE FROM academy_tutor_audio WHERE audio_id = $1 AND google_sub = $2
        RETURNING object_key
      `, [audioId, user.sub]);
      return result.rows[0]?.object_key || null;
    },

    async close() {
      await pool.end();
    },
  };
}
