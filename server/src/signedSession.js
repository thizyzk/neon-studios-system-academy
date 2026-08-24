import crypto from "node:crypto";

const SESSION_VERSION = 1;
const MAX_TOKEN_LENGTH = 4096;

function signPayload(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function signaturesMatch(actual, expected) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function normalizeUser(user) {
  return {
    sub: String(user.sub ?? ""),
    email: String(user.email ?? ""),
    name: String(user.name ?? ""),
    givenName: String(user.givenName ?? ""),
    picture: String(user.picture ?? ""),
    hostedDomain: String(user.hostedDomain ?? ""),
  };
}

export function createSignedSession(user, secret, maxAgeSeconds, nowMs = Date.now()) {
  const issuedAt = Math.floor(nowMs / 1000);
  const payload = {
    version: SESSION_VERSION,
    issuedAt,
    expiresAt: issuedAt + maxAgeSeconds,
    sessionId: crypto.randomBytes(16).toString("base64url"),
    user: normalizeUser(user),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const token = `${encodedPayload}.${signPayload(encodedPayload, secret)}`;

  if (token.length > MAX_TOKEN_LENGTH) {
    throw new Error("Signed session exceeds the cookie size limit.");
  }

  return {
    token,
    expiresAt: payload.expiresAt * 1000,
  };
}

export function verifySignedSession(token, secret, nowMs = Date.now()) {
  if (typeof token !== "string" || !token || token.length > MAX_TOKEN_LENGTH || !secret) {
    return null;
  }

  const [encodedPayload, signature, extraPart] = token.split(".");
  if (!encodedPayload || !signature || extraPart !== undefined) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload, secret);
  if (!signaturesMatch(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    const now = Math.floor(nowMs / 1000);
    if (
      payload.version !== SESSION_VERSION
      || !Number.isInteger(payload.issuedAt)
      || !Number.isInteger(payload.expiresAt)
      || payload.issuedAt > now + 60
      || payload.expiresAt <= now
      || typeof payload.sessionId !== "string"
      || !payload.user?.sub
      || !payload.user?.email
    ) {
      return null;
    }

    return {
      user: normalizeUser(payload.user),
      expiresAt: payload.expiresAt * 1000,
    };
  } catch {
    return null;
  }
}
