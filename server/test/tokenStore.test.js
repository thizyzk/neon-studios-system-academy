import assert from "node:assert/strict";
import test from "node:test";

import { decryptTokenPayload, encryptTokenPayload } from "../src/tokenStore.js";

test("integration tokens round-trip through authenticated encryption", () => {
  const value = { token: { access_token: "private", refresh_token: "refresh" } };
  const encrypted = encryptTokenPayload(value, "a-stable-secret-with-at-least-32-bytes");

  assert.notEqual(encrypted.includes("private"), true);
  assert.deepEqual(decryptTokenPayload(encrypted, "a-stable-secret-with-at-least-32-bytes"), value);
});

test("tampered integration tokens are rejected", () => {
  const encrypted = encryptTokenPayload({ token: "private" }, "a-stable-secret-with-at-least-32-bytes");
  const parts = encrypted.split(".");
  parts[2] = `${parts[2].startsWith("A") ? "B" : "A"}${parts[2].slice(1)}`;
  const tampered = parts.join(".");

  assert.throws(() => decryptTokenPayload(tampered, "a-stable-secret-with-at-least-32-bytes"));
});
