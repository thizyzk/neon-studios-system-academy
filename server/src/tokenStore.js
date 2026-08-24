import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

const TOKEN_STORE_CONTEXT = "neon-academy-integration-token-v1";

function encryptionKey(secret) {
  return crypto.createHash("sha256").update(`${TOKEN_STORE_CONTEXT}:${secret}`).digest();
}

export function encryptTokenPayload(value, secret) {
  if (!secret) throw new Error("TokenStoreEncryptionSecretMissing");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptTokenPayload(payload, secret) {
  if (!secret) throw new Error("TokenStoreEncryptionSecretMissing");
  const [version, ivValue, tagValue, encryptedValue, extra] = String(payload || "").split(".");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue || extra !== undefined) {
    throw new Error("TokenStorePayloadInvalid");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(secret), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString("utf8"));
}

export async function readTokenStore(filePath) {
  try {
    const contents = await fs.readFile(filePath, "utf8");
    return JSON.parse(contents);
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

export async function writeTokenStore(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function createTokenStore({ databaseUrl, filePath, encryptionSecret }) {
  if (!databaseUrl) {
    return {
      durable: false,
      read: () => readTokenStore(filePath),
      write: (value) => writeTokenStore(filePath, value),
      async close() {},
    };
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  let schemaPromise = null;
  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = pool.query(`
        CREATE TABLE IF NOT EXISTS academy_integration_secrets (
          integration_key TEXT PRIMARY KEY,
          encrypted_payload TEXT NOT NULL,
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
    durable: true,
    async read() {
      await ensureSchema();
      const result = await pool.query(`
        SELECT encrypted_payload FROM academy_integration_secrets
        WHERE integration_key = 'tiktok' LIMIT 1
      `);
      if (!result.rows[0]) return {};
      return decryptTokenPayload(result.rows[0].encrypted_payload, encryptionSecret);
    },
    async write(value) {
      await ensureSchema();
      const encrypted = encryptTokenPayload(value, encryptionSecret);
      await pool.query(`
        INSERT INTO academy_integration_secrets (integration_key, encrypted_payload)
        VALUES ('tiktok', $1)
        ON CONFLICT (integration_key) DO UPDATE
        SET encrypted_payload = EXCLUDED.encrypted_payload, updated_at = NOW()
      `, [encrypted]);
    },
    async close() {
      await pool.end();
    },
  };
}

export function withTokenTimestamps(tokenPayload, receivedAt = Date.now()) {
  return {
    ...tokenPayload,
    received_at: receivedAt,
    access_token_expires_at: receivedAt + tokenPayload.expires_in * 1000,
    refresh_token_expires_at: receivedAt + tokenPayload.refresh_expires_in * 1000,
  };
}
