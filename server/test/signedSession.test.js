import assert from "node:assert/strict";
import test from "node:test";

import { createSignedSession, verifySignedSession } from "../src/signedSession.js";

const secret = "test-secret-that-is-longer-than-thirty-two-bytes";
const now = Date.UTC(2026, 7, 24, 12, 0, 0);

test("signed sessions preserve trusted administration claims", () => {
  const session = createSignedSession({
    sub: "google-subject",
    email: "admin@example.com",
    name: "Admin",
    isAdmin: true,
  }, secret, 3600, now);

  const verified = verifySignedSession(session.token, secret, now + 1000);
  assert.equal(verified.user.email, "admin@example.com");
  assert.equal(verified.user.isAdmin, true);
});

test("tampered and expired sessions are rejected", () => {
  const session = createSignedSession({ sub: "user", email: "user@example.com" }, secret, 60, now);
  const tampered = `${session.token.slice(0, -1)}x`;

  assert.equal(verifySignedSession(tampered, secret, now), null);
  assert.equal(verifySignedSession(session.token, secret, now + 61_000), null);
});
