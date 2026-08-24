import fs from "node:fs/promises";
import path from "node:path";

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

export function withTokenTimestamps(tokenPayload, receivedAt = Date.now()) {
  return {
    ...tokenPayload,
    received_at: receivedAt,
    access_token_expires_at: receivedAt + tokenPayload.expires_in * 1000,
    refresh_token_expires_at: receivedAt + tokenPayload.refresh_expires_in * 1000,
  };
}
