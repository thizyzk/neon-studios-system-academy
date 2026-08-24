import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { URL } from "node:url";

import { OAuth2Client } from "google-auth-library";
import Stripe from "stripe";

import { ADMIN_ROLES, createAdminStore, hasAdminPermission, normalizeAdminRole } from "./adminStore.js";
import { COMMERCE_CATALOG, findCommerceProduct, stripePriceMatchesProduct } from "./commerceCatalog.js";
import { createCommerceStore } from "./commerceStore.js";
import { readConfig } from "./config.js";
import { createLearningStore } from "./learningStore.js";
import { createR2AudioStorage, validateAudioUpload } from "./r2AudioStorage.js";
import { buildReadinessReport } from "./readiness.js";
import { createSignedSession, verifySignedSession } from "./signedSession.js";
import { exchangeAuthorizationCode, getUserInfo, listVideos, queryVideos, refreshAccessToken } from "./tiktokClient.js";
import { createTutorAudioStore } from "./tutorAudioStore.js";
import { createTokenStore, withTokenTimestamps } from "./tokenStore.js";

const config = readConfig();
const STATE_MAX_AGE_SECONDS = 10 * 60;
const TOKEN_REFRESH_SKEW_MS = 10 * 60 * 1000;
const MAX_AUTH_BODY_BYTES = 20 * 1024;
const MAX_LEARNING_PROFILE_BODY_BYTES = 600 * 1024;
const MAX_COMMERCE_BODY_BYTES = 64 * 1024;
const MAX_AUDIO_METADATA_BODY_BYTES = 16 * 1024;
const PEXELS_CACHE_TTL_MS = 15 * 60 * 1000;
const PEXELS_RATE_WINDOW_MS = 60 * 60 * 1000;
const PEXELS_RATE_MAX = 20;
const AUTH_ACCESS_CACHE_TTL_MS = 5 * 1000;
const authRateLimitWindowMs = config.authRateLimitWindowSeconds * 1000;
const googleClient = config.googleClientId ? new OAuth2Client(config.googleClientId) : null;
const authAttempts = new Map();
const learningStore = createLearningStore(config.databaseUrl);
const commerceStore = createCommerceStore(config.databaseUrl);
const adminStore = createAdminStore(config.databaseUrl, config.adminEmails);
const tutorAudioStore = createTutorAudioStore(config.databaseUrl);
const r2AudioStorage = createR2AudioStorage(config);
const stripe = config.stripeSecretKey
  ? new Stripe(config.stripeSecretKey, { timeout: 12_000, maxNetworkRetries: 1 })
  : null;
const tokenStore = createTokenStore({
  databaseUrl: config.databaseUrl,
  filePath: config.tokenStorePath,
  encryptionSecret: config.authSessionSecret,
});
const pexelsCache = new Map();
const pexelsRateLimits = new Map();
const checkoutRateLimits = new Map();
const stripePriceCache = new Map();
const validatedAccessCache = new Map();

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".luau", "text/plain; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
  [".wasm", "application/wasm"],
]);

let reelCache = {
  fetchedAt: 0,
  payload: null,
};

function applySecurityHeaders(response, request) {
  const r2Origin = r2AudioStorage.endpointOrigin;
  const isEmbeddedLuau = String(request?.url || "").startsWith("/luau/");
  response.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    `script-src 'self'${isEmbeddedLuau ? " 'wasm-unsafe-eval'" : ""} https://accounts.google.com https://www.google.com https://www.gstatic.com`,
    "style-src 'self' 'unsafe-inline' https://accounts.google.com",
    "frame-src 'self' https://accounts.google.com https://www.google.com https://recaptcha.google.com https://play.luau.org",
    "worker-src 'self' blob:",
    `connect-src 'self' https://accounts.google.com https://www.google.com${isEmbeddedLuau ? " https://clientsettingscdn.roblox.com" : ""}${r2Origin ? ` ${r2Origin}` : ""}`,
    `media-src 'self' blob: https://videos.pexels.com${r2Origin ? ` ${r2Origin}` : ""}`,
    "img-src 'self' data: blob: https://lh3.googleusercontent.com https://*.googleusercontent.com https://images.pexels.com",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${isEmbeddedLuau ? "'self'" : "'none'"}`,
  ].join("; "));
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", isEmbeddedLuau ? "SAMEORIGIN" : "DENY");
  response.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(self), geolocation=()");
  if (config.publicBaseUrl.startsWith("https://")) {
    response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

function isAuthConfigured() {
  return Boolean(
    config.googleClientId
    && config.recaptchaSiteKey
    && config.recaptchaSecretKey
    && Buffer.byteLength(config.authSessionSecret, "utf8") >= 32
  );
}

function isCommerceConfigured() {
  return Boolean(
    stripe
    && commerceStore.available
    && config.stripeWebhookSecret
    && COMMERCE_CATALOG.every((product) => String(config.stripePriceIds[product.id] || "").startsWith("price_"))
  );
}

function consumeCheckoutAttempt(userSub) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const attempts = (checkoutRateLimits.get(userSub) || []).filter((timestamp) => now - timestamp < windowMs);
  if (attempts.length >= 6) {
    return { allowed: false, retryAfterSeconds: Math.ceil((windowMs - (now - attempts[0])) / 1000) };
  }
  attempts.push(now);
  checkoutRateLimits.set(userSub, attempts);
  return { allowed: true, retryAfterSeconds: 0 };
}

async function validateConfiguredStripePrice(product) {
  const priceId = config.stripePriceIds[product.id];
  const cached = stripePriceCache.get(priceId);
  if (cached && Date.now() - cached.checkedAt < 15 * 60 * 1000) return cached.valid;
  const price = await stripe.prices.retrieve(priceId);
  const valid = stripePriceMatchesProduct(product, price);
  stripePriceCache.set(priceId, { checkedAt: Date.now(), valid });
  return valid;
}

async function getStripeCustomerWithoutBlockingCheckout(user, timeoutMs = 2500) {
  const lookup = commerceStore.getStripeCustomerId(user).then(
    (customerId) => ({ customerId, error: null }),
    (error) => ({ customerId: null, error })
  );
  let timeoutId;
  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve({ customerId: null, error: null, timedOut: true }), timeoutMs);
  });
  const result = await Promise.race([lookup, timeout]);
  clearTimeout(timeoutId);
  if (result.error) throw result.error;
  return result;
}

function classifyStripeCheckoutError(error) {
  const message = String(error?.message || "");
  const parameter = String(error?.param || "");
  if (/terms of service/i.test(message) || /terms_of_service/i.test(parameter)) return "StripeTermsUrlMissing";
  if (error?.code === "resource_missing") return "StripeResourceMissing";
  if (["StripeConnectionError", "StripeAPIError", "StripeRateLimitError"].includes(error?.type)) {
    return "StripeUnavailable";
  }
  return "CheckoutProviderRejected";
}

function logCheckoutFailure(error, phase, productId, startedAt) {
  console.error(JSON.stringify({
    event: "stripe_checkout_failed",
    phase,
    productId,
    type: error?.type || "",
    code: error?.code || "",
    parameter: error?.param || "",
    message: error?.message || "",
    durationMs: Date.now() - startedAt,
  }));
}

function getAuthConfigurationStatus() {
  const missing = [];
  if (!config.googleClientId) missing.push("GOOGLE_CLIENT_ID");
  if (!config.recaptchaSiteKey) missing.push("RECAPTCHA_SITE_KEY");
  if (!config.recaptchaSecretKey) missing.push("RECAPTCHA_SECRET_KEY");
  if (Buffer.byteLength(config.authSessionSecret, "utf8") < 32) missing.push("AUTH_SESSION_SECRET");
  return {
    configured: missing.length === 0,
    missing,
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendHtml(response, statusCode, html) {
  response.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(html);
}

function redirect(response, location) {
  response.writeHead(302, {
    Location: location,
    "Cache-Control": "no-store",
  });
  response.end();
}

function getCookie(request, name) {
  const cookies = request.headers.cookie ?? "";
  for (const part of cookies.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === name) {
      return rawValue.join("=");
    }
  }

  return "";
}

function getRequestIp(request) {
  if (config.trustProxy) {
    const forwarded = request.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.trim()) {
      return forwarded.split(",")[0].trim();
    }
  }

  return request.socket.remoteAddress ?? "unknown";
}

function isTrustedRequestOrigin(request) {
  const origin = request.headers.origin;
  if (typeof origin !== "string") return false;
  return origin === new URL(config.publicBaseUrl).origin;
}

function createAuthCookie(token) {
  const secure = config.publicBaseUrl.startsWith("https://") ? "; Secure" : "";
  return `${config.authCookieName}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${config.authSessionMaxAgeSeconds}; Priority=High${secure}`;
}

function clearAuthCookie() {
  const secure = config.publicBaseUrl.startsWith("https://") ? "; Secure" : "";
  return `${config.authCookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Priority=High${secure}`;
}

function getAuthSession(request) {
  return verifySignedSession(getCookie(request, config.authCookieName), config.authSessionSecret);
}

function cacheValidatedAccess(access) {
  if (!access?.sub) return access;
  validatedAccessCache.set(access.sub, {
    access,
    sessionVersion: Number(access.sessionVersion || 0),
    expiresAt: Date.now() + AUTH_ACCESS_CACHE_TTL_MS,
  });
  if (validatedAccessCache.size > 500) {
    const now = Date.now();
    for (const [sub, entry] of validatedAccessCache) {
      if (entry.expiresAt <= now) validatedAccessCache.delete(sub);
    }
  }
  return access;
}

async function getCachedAccessState(user) {
  const sessionVersion = Number(user.sessionVersion || 0);
  const cached = validatedAccessCache.get(user.sub);
  if (cached?.sessionVersion === sessionVersion && cached.expiresAt > Date.now()) {
    return cached.promise ? cached.promise : cached.access;
  }

  const promise = adminStore.getAccessState(user);
  validatedAccessCache.set(user.sub, {
    promise,
    sessionVersion,
    expiresAt: Date.now() + AUTH_ACCESS_CACHE_TTL_MS,
  });
  try {
    return cacheValidatedAccess(await promise);
  } catch (error) {
    if (validatedAccessCache.get(user.sub)?.promise === promise) validatedAccessCache.delete(user.sub);
    throw error;
  }
}

function isCurrentlyBanned(access) {
  return Boolean(access?.bannedUntil && new Date(access.bannedUntil).getTime() > Date.now());
}

async function getValidatedAuthSession(request) {
  const session = getAuthSession(request);
  if (!session) return null;
  const access = await getCachedAccessState(session.user);
  if (!access || isCurrentlyBanned(access) || access.sessionVersion !== session.user.sessionVersion) return null;
  return {
    ...session,
    user: {
      ...session.user,
      role: access.role,
      isAdmin: access.isAdmin,
      sessionVersion: access.sessionVersion,
    },
  };
}

function consumeAuthAttempt(request) {
  const ip = getRequestIp(request);
  const now = Date.now();
  const recentAttempts = (authAttempts.get(ip) ?? []).filter((timestamp) => now - timestamp < authRateLimitWindowMs);

  if (recentAttempts.length >= config.authRateLimitMax) {
    return {
      allowed: false,
      ip,
      retryAfterSeconds: Math.max(1, Math.ceil((authRateLimitWindowMs - (now - recentAttempts[0])) / 1000)),
    };
  }

  recentAttempts.push(now);
  authAttempts.set(ip, recentAttempts);

  if (authAttempts.size > 1000) {
    for (const [storedIp, timestamps] of authAttempts) {
      if (!timestamps.some((timestamp) => now - timestamp < authRateLimitWindowMs)) {
        authAttempts.delete(storedIp);
      }
    }
  }

  return { allowed: true, ip, retryAfterSeconds: 0 };
}

async function readJsonBody(request, maximumBytes = MAX_AUTH_BODY_BYTES) {
  if (!(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
    const error = new Error("Content-Type must be application/json.");
    error.statusCode = 415;
    throw error;
  }

  const chunks = [];
  let receivedBytes = 0;
  for await (const chunk of request) {
    receivedBytes += chunk.length;
    if (receivedBytes > maximumBytes) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Request body is not valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

async function readRawBody(request, maximumBytes) {
  const chunks = [];
  let receivedBytes = 0;
  for await (const chunk of request) {
    receivedBytes += chunk.length;
    if (receivedBytes > maximumBytes) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function verifyRecaptcha(token, remoteIp) {
  if (typeof token !== "string" || token.length < 20 || token.length > 4096) {
    return { ok: false, reason: "MissingCaptchaToken" };
  }

  const body = new URLSearchParams({
    secret: config.recaptchaSecretKey,
    response: token,
  });
  if (remoteIp && remoteIp !== "unknown") {
    body.set("remoteip", remoteIp);
  }

  let verificationResponse;
  try {
    verificationResponse = await fetch(config.recaptchaVerifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { ok: false, reason: "CaptchaVerificationUnavailable" };
  }

  if (!verificationResponse.ok) {
    return { ok: false, reason: "CaptchaVerificationUnavailable" };
  }

  const result = await verificationResponse.json();
  if (!result.success) {
    return { ok: false, reason: "CaptchaRejected", details: result["error-codes"] };
  }

  const hostname = String(result.hostname ?? "").toLowerCase();
  if (!config.recaptchaAllowedHostnames.includes(hostname)) {
    return { ok: false, reason: "CaptchaHostnameMismatch", hostname };
  }

  if (config.recaptchaVersion === "v3") {
    if (result.action !== config.recaptchaAction) {
      return { ok: false, reason: "CaptchaActionMismatch", hostname };
    }

    const score = Number(result.score);
    if (!Number.isFinite(score) || score < config.recaptchaMinimumScore) {
      return { ok: false, reason: "CaptchaScoreTooLow", hostname, score };
    }
  }

  return {
    ok: true,
    hostname,
    challengeTimestamp: result.challenge_ts,
    score: Number(result.score),
  };
}

async function verifyGoogleCredential(credential) {
  if (!googleClient || typeof credential !== "string" || credential.length < 100 || credential.length > 8192) {
    return null;
  }

  const ticket = await googleClient.verifyIdToken({
    idToken: credential,
    audience: config.googleClientId,
  });
  const payload = ticket.getPayload();

  if (!payload?.sub || !payload.email || payload.email_verified !== true) {
    return null;
  }

  const email = payload.email.toLowerCase();
  if (config.googleAllowedEmailDomain) {
    const emailDomain = email.split("@").at(-1);
    const hostedDomain = String(payload.hd ?? "").toLowerCase();
    if (emailDomain !== config.googleAllowedEmailDomain || hostedDomain !== config.googleAllowedEmailDomain) {
      return null;
    }
  }

  return {
    sub: payload.sub,
    email,
    name: payload.name ?? email,
    givenName: payload.given_name ?? "",
    picture: payload.picture ?? "",
    hostedDomain: payload.hd ?? "",
    isAdmin: config.adminEmails.includes(email),
  };
}

function resolveSiteFile(requestPath) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(requestPath);
  } catch {
    return null;
  }

  const isSourceFile = decodedPath.startsWith("/src/");
  const rootPath = path.resolve(isSourceFile ? config.sourceRoot : config.siteRoot);
  const relativePath = isSourceFile
    ? decodedPath.slice("/src/".length)
    : (decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, ""));
  const candidate = path.resolve(rootPath, relativePath);
  const relativeToRoot = path.relative(rootPath, candidate);
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    return null;
  }

  return candidate;
}

async function sendSiteFile(response, requestPath) {
  const filePath = resolveSiteFile(requestPath);
  if (!filePath) return false;

  try {
    const contents = await fs.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": contentTypes.get(extension) ?? "application/octet-stream",
      "Cache-Control": extension === ".html" ? "no-store" : "public, max-age=300",
    });
    response.end(contents);
    return true;
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") {
      return false;
    }
    throw error;
  }
}

function signState(state) {
  const secret = config.robloxSharedSecret || config.tiktokClientSecret || "local-dev-state-secret";
  return crypto.createHmac("sha256", secret).update(state).digest("hex");
}

function createCodeVerifier() {
  return crypto.randomBytes(48).toString("base64url");
}

function createCodeChallenge(codeVerifier) {
  return crypto.createHash("sha256").update(codeVerifier).digest("hex");
}

function signOAuthSession(state, codeVerifier) {
  const secret = config.robloxSharedSecret || config.tiktokClientSecret || "local-dev-state-secret";
  return crypto.createHmac("sha256", secret).update(`${state}.${codeVerifier}`).digest("hex");
}

function createStateCookie(state, codeVerifier) {
  const value = `${state}.${codeVerifier}.${signOAuthSession(state, codeVerifier)}`;
  const secure = config.publicBaseUrl.startsWith("https://") ? "; Secure" : "";
  return `${config.stateCookieName}=${value}; HttpOnly; SameSite=Lax; Path=/auth/tiktok/callback; Max-Age=${STATE_MAX_AGE_SECONDS}${secure}`;
}

function clearStateCookie() {
  return `${config.stateCookieName}=; HttpOnly; SameSite=Lax; Path=/auth/tiktok/callback; Max-Age=0`;
}

function getVerifiedCodeVerifier(request, state) {
  const cookie = getCookie(request, config.stateCookieName);
  const [cookieState, codeVerifier, cookieSignature] = cookie.split(".");

  if (!state || !cookieState || !codeVerifier || !cookieSignature || state !== cookieState) {
    return null;
  }

  const expected = signOAuthSession(cookieState, codeVerifier);
  if (expected.length !== cookieSignature.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(cookieSignature))) {
    return null;
  }

  return codeVerifier;
}

function requireTikTokConfig(response) {
  if (config.tiktokClientKey && config.tiktokClientSecret && config.tiktokRedirectUri) {
    return true;
  }

  sendJson(response, 500, {
    ok: false,
    error: "TikTokConfigMissing",
    message: "Configure TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET and TIKTOK_REDIRECT_URI.",
  });
  return false;
}

function isGameAuthorized(request) {
  if (!config.robloxSharedSecret) {
    return true;
  }

  return request.headers["x-game-secret"] === config.robloxSharedSecret;
}

function getAuthUrl(state, codeVerifier) {
  const authUrl = new URL(config.tiktokAuthorizeUrl);
  authUrl.searchParams.set("client_key", config.tiktokClientKey);
  authUrl.searchParams.set("scope", config.tiktokScopes);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", config.tiktokRedirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", createCodeChallenge(codeVerifier));
  authUrl.searchParams.set("code_challenge_method", "S256");
  return authUrl.toString();
}

function normalizeVideo(video) {
  return {
    id: String(video.id ?? ""),
    title: String(video.title ?? ""),
    description: String(video.video_description ?? ""),
    duration: Number(video.duration ?? 0),
    coverImageUrl: String(video.cover_image_url ?? ""),
    shareUrl: String(video.share_url ?? ""),
    embedLink: String(video.embed_link ?? ""),
    likeCount: Number(video.like_count ?? 0),
    commentCount: Number(video.comment_count ?? 0),
    shareCount: Number(video.share_count ?? 0),
    viewCount: Number(video.view_count ?? 0),
  };
}

function mergeVideoDetails(baseVideos, detailedVideos) {
  const detailsById = new Map(detailedVideos.map((video) => [String(video.id), video]));
  return baseVideos.map((video) => ({
    ...video,
    ...(detailsById.get(String(video.id)) ?? {}),
  }));
}

async function getUsableToken() {
  const store = await tokenStore.read();
  const token = store.token;

  if (!token?.access_token || !token?.refresh_token) {
    return null;
  }

  if (Date.now() < token.access_token_expires_at - TOKEN_REFRESH_SKEW_MS) {
    return token;
  }

  const refreshed = await refreshAccessToken(config, token.refresh_token);
  const nextToken = withTokenTimestamps(refreshed);
  await tokenStore.write({
    ...store,
    token: nextToken,
  });

  return nextToken;
}

async function getReels(limit) {
  const now = Date.now();
  if (reelCache.payload && now - reelCache.fetchedAt < config.reelsCacheTtlMs) {
    return {
      ...reelCache.payload,
      cached: true,
    };
  }

  const token = await getUsableToken();
  if (!token) {
    const error = new Error("TikTok account is not connected.");
    error.code = "TikTokNotConnected";
    throw error;
  }

  const [profile, videoList] = await Promise.all([
    getUserInfo(config, token.access_token),
    listVideos(config, token.access_token, limit),
  ]);

  let videos = videoList.videos;
  try {
    const detailedVideos = await queryVideos(
      config,
      token.access_token,
      videoList.videos.map((video) => String(video.id ?? "")),
    );
    videos = mergeVideoDetails(videoList.videos, detailedVideos);
  } catch (error) {
    console.warn("TikTok video detail query failed; returning list metadata only.", error.message);
  }

  const payload = {
    ok: true,
    source: "tiktok",
    cached: false,
    fetchedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + config.reelsCacheTtlMs).toISOString(),
    profile,
    reels: videos.map(normalizeVideo).filter((video) => video.id),
    paging: {
      cursor: videoList.cursor,
      hasMore: videoList.hasMore,
    },
  };

  reelCache = {
    fetchedAt: now,
    payload,
  };

  return payload;
}

async function handleAuthStart(request, response) {
  if (!requireTikTokConfig(response)) {
    return;
  }
  const session = await requireAdminSession(request, response, "integrations.manage");
  if (!session) return;

  const state = crypto.randomBytes(32).toString("hex");
  const codeVerifier = createCodeVerifier();
  response.writeHead(302, {
    Location: getAuthUrl(state, codeVerifier),
    "Set-Cookie": createStateCookie(state, codeVerifier),
    "Cache-Control": "no-store",
  });
  response.end();
}

async function handleAuthCallback(request, response, requestUrl) {
  if (!requireTikTokConfig(response)) {
    return;
  }
  const session = await requireAdminSession(request, response, "integrations.manage");
  if (!session) return;

  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const error = requestUrl.searchParams.get("error");

  response.setHeader("Set-Cookie", clearStateCookie());

  if (error) {
    sendHtml(response, 400, `<h1>TikTok authorization failed</h1><p>${escapeHtml(error)}</p>`);
    return;
  }

  const codeVerifier = getVerifiedCodeVerifier(request, state);
  if (!code || !codeVerifier) {
    sendHtml(response, 400, "<h1>Invalid TikTok callback</h1><p>Missing code or invalid state.</p>");
    return;
  }

  const token = withTokenTimestamps(await exchangeAuthorizationCode(config, code, codeVerifier));
  const store = await tokenStore.read();
  await tokenStore.write({
    ...store,
    token,
    authorized_at: new Date().toISOString(),
  });
  reelCache = { fetchedAt: 0, payload: null };

  sendHtml(response, 200, "<h1>TikTok conectado</h1><p>Os reels ja podem ser consumidos pelo jogo.</p>");
}

async function handleApiReels(request, response, requestUrl) {
  if (!isGameAuthorized(request)) {
    sendJson(response, 401, {
      ok: false,
      error: "Unauthorized",
    });
    return;
  }

  const limit = Number.parseInt(requestUrl.searchParams.get("limit") ?? "12", 10);

  try {
    sendJson(response, 200, await getReels(Number.isFinite(limit) ? limit : 12));
  } catch (error) {
    const statusCode = error.code === "TikTokNotConnected" ? 503 : 502;
    sendJson(response, statusCode, {
      ok: false,
      error: error.code ?? "TikTokRequestFailed",
      message: error.message,
      authUrl: `${config.publicBaseUrl}/auth/tiktok`,
      details: error.payload,
    });
  }
}

async function handleRefresh(request, response) {
  if (!isGameAuthorized(request)) {
    sendJson(response, 401, {
      ok: false,
      error: "Unauthorized",
    });
    return;
  }

  reelCache = { fetchedAt: 0, payload: null };
  sendJson(response, 200, await getReels(12));
}

function handleAuthConfig(response) {
  const status = getAuthConfigurationStatus();
  sendJson(response, status.configured ? 200 : 503, {
    ok: status.configured,
    configured: status.configured,
    missing: status.missing,
    googleClientId: config.googleClientId,
    recaptchaSiteKey: config.recaptchaSiteKey,
    recaptchaVersion: config.recaptchaVersion,
    recaptchaAction: config.recaptchaAction,
    allowedEmailDomain: config.googleAllowedEmailDomain,
  });
}

async function handleGoogleAuth(request, response) {
  const requestId = String(request.headers["cf-ray"] || crypto.randomUUID()).slice(0, 80);
  const startedAt = Date.now();
  if (!isAuthConfigured()) {
    sendJson(response, 503, {
      ok: false,
      error: "AuthConfigMissing",
      missing: getAuthConfigurationStatus().missing,
    });
    return;
  }

  if (!isTrustedRequestOrigin(request)) {
    sendJson(response, 403, { ok: false, error: "InvalidOrigin" });
    return;
  }

  const attempt = consumeAuthAttempt(request);
  if (!attempt.allowed) {
    response.setHeader("Retry-After", String(attempt.retryAfterSeconds));
    sendJson(response, 429, {
      ok: false,
      error: "TooManyAuthAttempts",
      retryAfterSeconds: attempt.retryAfterSeconds,
    });
    return;
  }

  try {
    const body = await readJsonBody(request);
    const verificationStartedAt = Date.now();
    const [captchaVerification, googleVerification] = await Promise.allSettled([
      verifyRecaptcha(body.captchaToken, attempt.ip),
      verifyGoogleCredential(body.credential),
    ]);
    const verificationDurationMs = Date.now() - verificationStartedAt;
    response.setHeader("Server-Timing", `identity;dur=${verificationDurationMs}`);
    const captchaResult = captchaVerification.status === "fulfilled"
      ? captchaVerification.value
      : { ok: false, reason: "CaptchaVerificationUnavailable" };
    if (!captchaResult.ok) {
      console.warn(
        JSON.stringify({
          event: "auth_captcha_rejected",
          requestId,
          reason: captchaResult.reason,
          hostname: captchaResult.hostname ?? "",
          score: Number.isFinite(captchaResult.score) ? captchaResult.score : null,
          durationMs: Date.now() - startedAt,
        })
      );
      sendJson(response, 401, {
        ok: false,
        error: "InvalidCaptcha",
        captchaReason: captchaResult.reason,
        retryAfterSeconds: captchaResult.reason === "CaptchaScoreTooLow" ? 8 : 0,
        requestId,
      });
      return;
    }

    if (googleVerification.status === "rejected") throw googleVerification.reason;
    const user = googleVerification.value;
    if (!user) {
      sendJson(response, 401, { ok: false, error: "GoogleAccountRejected" });
      return;
    }

    let access;
    try {
      access = await adminStore.recordLogin(user);
    } catch (error) {
      console.error(JSON.stringify({
        event: "auth_storage_unavailable",
        requestId,
        code: error.code || "",
        message: error.message,
        durationMs: Date.now() - startedAt,
      }));
      sendJson(response, 503, { ok: false, error: "AuthStorageUnavailable", requestId });
      return;
    }
    if (isCurrentlyBanned(access)) {
      sendJson(response, 403, { ok: false, error: "AccountSuspended" });
      return;
    }
    const trustedUser = {
      ...user,
      role: access.role,
      isAdmin: access.isAdmin,
      sessionVersion: access.sessionVersion,
    };
    cacheValidatedAccess({ ...access, ...trustedUser });
    const session = createSignedSession(trustedUser, config.authSessionSecret, config.authSessionMaxAgeSeconds);
    authAttempts.delete(attempt.ip);
    response.setHeader("Set-Cookie", createAuthCookie(session.token));
    response.setHeader(
      "Server-Timing",
      `identity;dur=${verificationDurationMs}, storage;dur=${Math.max(0, Date.now() - verificationStartedAt - verificationDurationMs)}`
    );
    console.log(JSON.stringify({
      event: "auth_succeeded",
      requestId,
      role: trustedUser.role,
      verificationDurationMs,
      storageDurationMs: Date.now() - verificationStartedAt - verificationDurationMs,
      durationMs: Date.now() - startedAt,
    }));
    sendJson(response, 200, { ok: true, user: trustedUser, requestId });
  } catch (error) {
    console.warn(JSON.stringify({
      event: "auth_failed",
      requestId,
      code: error.code || "",
      message: error.message,
      durationMs: Date.now() - startedAt,
    }));
    sendJson(response, error.statusCode ?? 401, {
      ok: false,
      error: error.statusCode ? "InvalidAuthRequest" : "GoogleAccountRejected",
      requestId,
    });
  }
}

async function handleAuthSession(request, response) {
  let session;
  try {
    session = await getValidatedAuthSession(request);
  } catch (error) {
    console.error(JSON.stringify({
      event: "auth_session_storage_unavailable",
      requestId: String(request.headers["cf-ray"] || crypto.randomUUID()).slice(0, 80),
      code: error.code || "",
      message: error.message,
    }));
    sendJson(response, 503, { ok: false, error: "AuthStorageUnavailable" });
    return;
  }
  if (!session) {
    response.setHeader("Set-Cookie", clearAuthCookie());
    sendJson(response, 401, { ok: false, authenticated: false });
    return;
  }

  sendJson(response, 200, {
    ok: true,
    authenticated: true,
    user: session.user,
    expiresAt: session.expiresAt,
  });
}

async function handleAuthLogout(request, response) {
  if (!isTrustedRequestOrigin(request)) {
    sendJson(response, 403, { ok: false, error: "InvalidOrigin" });
    return;
  }

  response.setHeader("Set-Cookie", clearAuthCookie());
  sendJson(response, 200, { ok: true });
}

async function requireAuthSession(request, response) {
  const session = await getValidatedAuthSession(request);
  if (!session) {
    response.setHeader("Set-Cookie", clearAuthCookie());
    sendJson(response, 401, { ok: false, error: "Unauthorized" });
    return null;
  }
  return session;
}

async function requireAdminSession(request, response, permission) {
  const session = await requireAuthSession(request, response);
  if (!session) return null;
  if (!hasAdminPermission(session.user.role, permission)) {
    sendJson(response, 403, { ok: false, error: "Forbidden" });
    return null;
  }
  return session;
}

async function handleLearningProfileRead(request, response) {
  const session = await requireAuthSession(request, response);
  if (!session) return;

  if (!learningStore.available) {
    sendJson(response, 200, { ok: true, syncAvailable: false, profile: null });
    return;
  }

  const stored = await learningStore.read(session.user);
  sendJson(response, 200, {
    ok: true,
    syncAvailable: true,
    profile: stored?.profile ?? null,
    revision: stored?.revision ?? 0,
    updatedAt: stored?.updatedAt ?? null,
  });
}

async function handleLearningProfileWrite(request, response) {
  const session = await requireAuthSession(request, response);
  if (!session) return;
  if (!isTrustedRequestOrigin(request)) {
    sendJson(response, 403, { ok: false, error: "InvalidOrigin" });
    return;
  }
  if (!learningStore.available) {
    sendJson(response, 503, { ok: false, error: "LearningSyncUnavailable", syncAvailable: false });
    return;
  }

  const body = await readJsonBody(request, MAX_LEARNING_PROFILE_BODY_BYTES);
  const stored = await learningStore.write(session.user, body.profile);
  sendJson(response, 200, {
    ok: true,
    syncAvailable: true,
    revision: stored.revision,
    updatedAt: stored.updatedAt,
  });
}

function publicCatalog() {
  return COMMERCE_CATALOG.map((product) => ({
    id: product.id,
    type: product.type,
    name: product.name,
    description: product.description,
    energy: product.energy ?? null,
    amountCents: product.amountCents,
    compareAtCents: config.promotionalPricesVerified ? product.compareAtCents ?? null : null,
    currency: product.currency,
    interval: product.interval ?? null,
  }));
}

async function handleCommerceCatalog(request, response) {
  sendJson(response, 200, {
    ok: true,
    products: publicCatalog(),
    checkoutAvailable: isCommerceConfigured(),
    promotionVerified: config.promotionalPricesVerified,
  });
}

async function handleCommerceAccount(request, response) {
  const session = await requireAuthSession(request, response);
  if (!session) return;
  if (!commerceStore.available) {
    sendJson(response, 200, { ok: true, available: false, purchasedEnergy: 0, energyDebt: 0, plusActive: false });
    return;
  }
  const account = await commerceStore.getAccount(session.user);
  sendJson(response, 200, { ok: true, available: true, ...account });
}

async function handleCommerceLedger(request, response) {
  const session = await requireAuthSession(request, response);
  if (!session) return;
  if (!commerceStore.available) {
    sendJson(response, 200, { ok: true, available: false, entries: [] });
    return;
  }
  sendJson(response, 200, { ok: true, available: true, entries: await commerceStore.listLedger(session.user, 30) });
}

async function handleCommerceSession(request, response, requestUrl) {
  const session = await requireAuthSession(request, response);
  if (!session) return;
  if (!stripe) {
    sendJson(response, 503, { ok: false, error: "CheckoutUnavailable" });
    return;
  }
  const sessionId = requestUrl.searchParams.get("sessionId") || "";
  if (!/^cs_(?:test_|live_)?[a-zA-Z0-9]{20,}$/.test(sessionId)) {
    sendJson(response, 400, { ok: false, error: "InvalidCheckoutSession" });
    return;
  }
  const checkout = await stripe.checkout.sessions.retrieve(sessionId);
  if (checkout.client_reference_id !== session.user.sub) {
    sendJson(response, 404, { ok: false, error: "CheckoutSessionNotFound" });
    return;
  }
  const confirmed = checkout.status === "complete"
    && ["paid", "no_payment_required"].includes(checkout.payment_status);
  sendJson(response, 200, {
    ok: true,
    confirmed,
    status: checkout.status,
    paymentStatus: checkout.payment_status,
    productId: checkout.metadata?.product_id || "",
  });
}

async function handleCommerceCheckout(request, response) {
  const checkoutStartedAt = Date.now();
  const session = await requireAuthSession(request, response);
  if (!session) return;
  if (!isTrustedRequestOrigin(request)) {
    sendJson(response, 403, { ok: false, error: "InvalidOrigin" });
    return;
  }
  if (!isCommerceConfigured()) {
    sendJson(response, 503, { ok: false, error: "CheckoutUnavailable" });
    return;
  }

  const body = await readJsonBody(request, MAX_COMMERCE_BODY_BYTES);
  const product = findCommerceProduct(body.productId);
  if (!product) {
    sendJson(response, 400, { ok: false, error: "UnknownProduct" });
    return;
  }
  const rate = consumeCheckoutAttempt(session.user.sub);
  if (!rate.allowed) {
    response.setHeader("Retry-After", String(rate.retryAfterSeconds));
    sendJson(response, 429, { ok: false, error: "CheckoutRateLimit", retryAfterSeconds: rate.retryAfterSeconds });
    return;
  }
  const priceStartedAt = Date.now();
  let validPrice = false;
  try {
    validPrice = await validateConfiguredStripePrice(product);
  } catch (error) {
    logCheckoutFailure(error, "price_lookup", product.id, checkoutStartedAt);
    sendJson(response, 502, { ok: false, error: classifyStripeCheckoutError(error) });
    return;
  }
  if (!validPrice) {
    sendJson(response, 503, { ok: false, error: "StripePriceMismatch" });
    return;
  }
  const priceDurationMs = Date.now() - priceStartedAt;

  const metadata = {
    user_sub: session.user.sub,
    product_id: product.id,
    product_type: product.type,
    energy: String(product.energy ?? 0),
  };
  const customerStartedAt = Date.now();
  const customerLookup = await getStripeCustomerWithoutBlockingCheckout(session.user);
  const stripeCustomerId = customerLookup.customerId;
  const customerDurationMs = Date.now() - customerStartedAt;
  const requestId = typeof body.requestId === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(body.requestId)
    ? body.requestId
    : crypto.randomUUID();
  const idempotencyKey = crypto.createHash("sha256")
    .update(`${session.user.sub}:${product.id}:${requestId}`)
    .digest("hex");

  let checkout;
  try {
    checkout = await stripe.checkout.sessions.create({
      mode: product.type === "subscription" ? "subscription" : "payment",
      ...(stripeCustomerId ? { customer: stripeCustomerId } : { customer_email: session.user.email }),
      client_reference_id: session.user.sub,
      line_items: [{ quantity: 1, price: config.stripePriceIds[product.id] }],
      metadata,
      ...(product.type === "subscription" ? { subscription_data: { metadata } } : {}),
      ...(product.type === "energy" ? { payment_intent_data: { metadata } } : {}),
      allow_promotion_codes: config.stripeAllowPromotionCodes,
      automatic_tax: { enabled: config.stripeAutomaticTax },
      success_url: `${config.publicBaseUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}#store/success`,
      cancel_url: `${config.publicBaseUrl}/#store`,
    }, { idempotencyKey });
  } catch (error) {
    logCheckoutFailure(error, "session_create", product.id, checkoutStartedAt);
    sendJson(response, 502, { ok: false, error: classifyStripeCheckoutError(error) });
    return;
  }
  response.setHeader(
    "Server-Timing",
    `price;dur=${priceDurationMs}, customer;dur=${customerDurationMs}, total;dur=${Date.now() - checkoutStartedAt}`
  );
  console.log(JSON.stringify({
    event: "stripe_checkout_created",
    productId: product.id,
    priceDurationMs,
    customerDurationMs,
    customerLookupTimedOut: customerLookup.timedOut === true,
    durationMs: Date.now() - checkoutStartedAt,
  }));
  sendJson(response, 200, { ok: true, checkoutUrl: checkout.url });
}

async function handleCommercePortal(request, response) {
  const session = await requireAuthSession(request, response);
  if (!session) return;
  if (!isTrustedRequestOrigin(request)) {
    sendJson(response, 403, { ok: false, error: "InvalidOrigin" });
    return;
  }
  if (!stripe || !commerceStore.available) {
    sendJson(response, 503, { ok: false, error: "BillingPortalUnavailable" });
    return;
  }
  const stripeCustomerId = await commerceStore.getStripeCustomerId(session.user);
  if (!stripeCustomerId) {
    sendJson(response, 404, { ok: false, error: "StripeCustomerNotFound" });
    return;
  }
  const portal = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${config.publicBaseUrl}/#store`,
  });
  sendJson(response, 200, { ok: true, portalUrl: portal.url });
}

async function handleCommerceEnergyConsume(request, response) {
  const session = await requireAuthSession(request, response);
  if (!session) return;
  if (!isTrustedRequestOrigin(request)) {
    sendJson(response, 403, { ok: false, error: "InvalidOrigin" });
    return;
  }
  if (!commerceStore.available) {
    sendJson(response, 503, { ok: false, error: "CommerceUnavailable" });
    return;
  }
  const body = await readJsonBody(request, MAX_COMMERCE_BODY_BYTES);
  const result = await commerceStore.consumeEnergy(session.user, 1, String(body.reason || "learning_session").slice(0, 80));
  sendJson(response, result.ok ? 200 : 409, result);
}

async function enrichStripeCommerceEvent(event) {
  const object = event.data.object;
  const needsChargeLookup = [
    "charge.dispute.created",
    "charge.dispute.closed",
    "refund.created",
    "refund.updated",
    "refund.failed",
  ].includes(event.type);
  const relatedCharge = event.type === "charge.refunded"
    ? object
    : needsChargeLookup && object.charge
      ? await stripe.charges.retrieve(typeof object.charge === "string" ? object.charge : object.charge.id)
      : null;
  if (!relatedCharge) return event;

  event.commerceRelatedCharge = relatedCharge;
  const invoiceId = typeof relatedCharge.invoice === "string"
    ? relatedCharge.invoice
    : relatedCharge.invoice?.id;
  if (!invoiceId) return event;

  const invoice = await stripe.invoices.retrieve(invoiceId);
  const subscriptionId = typeof invoice.parent?.subscription_details?.subscription === "string"
    ? invoice.parent.subscription_details.subscription
    : invoice.parent?.subscription_details?.subscription?.id
      || (typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id);
  if (!subscriptionId) return event;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  event.commerceSubscriptionActive = ["active", "trialing"].includes(subscription.status);
  return event;
}

async function handleStripeWebhook(request, response) {
  if (!stripe || !commerceStore.available || !config.stripeWebhookSecret) {
    sendJson(response, 503, { ok: false, error: "WebhookUnavailable" });
    return;
  }
  const signature = request.headers["stripe-signature"];
  if (typeof signature !== "string") {
    sendJson(response, 400, { ok: false, error: "MissingStripeSignature" });
    return;
  }
  const rawBody = await readRawBody(request, MAX_COMMERCE_BODY_BYTES);
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, config.stripeWebhookSecret);
  } catch (_error) {
    sendJson(response, 400, { ok: false, error: "InvalidStripeSignature" });
    return;
  }
  event = await enrichStripeCommerceEvent(event);
  const result = await commerceStore.processStripeEvent(event);
  sendJson(response, 200, { ok: true, received: true, processed: result.processed });
}

async function handleCommunityStatus(request, response) {
  const session = await requireAuthSession(request, response);
  if (!session) return;
  sendJson(response, 200, {
    ok: true,
    enabled: config.communityEnabled,
    safetyGate: true,
    capabilities: { friends: false, groups: false, images: false, calls: false, streaming: false },
  });
}

async function handleReadiness(request, response) {
  const session = await requireAdminSession(request, response, "audit.read");
  if (!session) return;
  sendJson(response, 200, { ok: true, report: buildReadinessReport(config) });
}

function consumePexelsSearch(userSub) {
  const now = Date.now();
  const recent = (pexelsRateLimits.get(userSub) ?? []).filter((timestamp) => now - timestamp < PEXELS_RATE_WINDOW_MS);
  if (recent.length >= PEXELS_RATE_MAX) {
    return { allowed: false, retryAfterSeconds: Math.ceil((PEXELS_RATE_WINDOW_MS - (now - recent[0])) / 1000) };
  }
  recent.push(now);
  pexelsRateLimits.set(userSub, recent);
  return { allowed: true, retryAfterSeconds: 0 };
}

function selectPexelsVideoFile(video) {
  const files = Array.isArray(video.video_files) ? video.video_files : [];
  return files
    .filter((file) => file.file_type === "video/mp4" && typeof file.link === "string" && file.link.startsWith("https://"))
    .sort((left, right) => {
      const leftScore = Math.abs((left.width || 0) - 1280) + (left.quality === "hd" ? 0 : 1000);
      const rightScore = Math.abs((right.width || 0) - 1280) + (right.quality === "hd" ? 0 : 1000);
      return leftScore - rightScore;
    })[0];
}

function normalizePexelsItems(type, payload) {
  if (type === "photo") {
    return (Array.isArray(payload.photos) ? payload.photos : []).slice(0, 8).map((photo) => ({
      id: `photo-${photo.id}`,
      type: "photo",
      previewUrl: photo.src?.medium || photo.src?.landscape || "",
      mediaUrl: photo.src?.large2x || photo.src?.large || photo.src?.landscape || "",
      creatorName: String(photo.photographer || "Pexels creator").slice(0, 120),
      creatorUrl: String(photo.photographer_url || "https://www.pexels.com").slice(0, 500),
      pexelsUrl: String(photo.url || "https://www.pexels.com").slice(0, 500),
    })).filter((item) => item.previewUrl && item.mediaUrl);
  }
  return (Array.isArray(payload.videos) ? payload.videos : []).slice(0, 8).map((video) => {
    const file = selectPexelsVideoFile(video);
    return {
      id: `video-${video.id}`,
      type: "video",
      previewUrl: String(file?.link || ""),
      mediaUrl: String(file?.link || ""),
      creatorName: String(video.user?.name || "Pexels creator").slice(0, 120),
      creatorUrl: String(video.user?.url || "https://www.pexels.com").slice(0, 500),
      pexelsUrl: String(video.url || "https://www.pexels.com").slice(0, 500),
    };
  }).filter((item) => item.previewUrl && item.mediaUrl);
}

async function handlePexelsSearch(request, response, requestUrl) {
  const session = await requireAuthSession(request, response);
  if (!session) return;
  if (!config.pexelsApiKey) {
    sendJson(response, 503, { ok: false, error: "PexelsUnavailable" });
    return;
  }
  if (!commerceStore.available) {
    sendJson(response, 403, { ok: false, error: "PlusRequired" });
    return;
  }
  const account = await commerceStore.getAccount(session.user);
  if (account?.plusActive !== true) {
    sendJson(response, 403, { ok: false, error: "PlusRequired" });
    return;
  }
  const type = requestUrl.searchParams.get("type") === "photo" ? "photo" : "video";
  const query = String(requestUrl.searchParams.get("query") || "").trim().replace(/\s+/g, " ");
  if (query.length < 2 || query.length > 60) {
    sendJson(response, 400, { ok: false, error: "InvalidSearchQuery" });
    return;
  }
  const cacheKey = `${type}:${query.toLocaleLowerCase("en-US")}`;
  const cached = pexelsCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < PEXELS_CACHE_TTL_MS) {
    sendJson(response, 200, { ok: true, cached: true, items: cached.items });
    return;
  }
  const rate = consumePexelsSearch(session.user.sub);
  if (!rate.allowed) {
    response.setHeader("Retry-After", String(rate.retryAfterSeconds));
    sendJson(response, 429, { ok: false, error: "PexelsRateLimit", retryAfterSeconds: rate.retryAfterSeconds });
    return;
  }
  const endpoint = type === "photo" ? "https://api.pexels.com/v1/search" : "https://api.pexels.com/v1/videos/search";
  const upstreamUrl = new URL(endpoint);
  upstreamUrl.searchParams.set("query", query);
  upstreamUrl.searchParams.set("orientation", "landscape");
  upstreamUrl.searchParams.set("locale", "pt-BR");
  upstreamUrl.searchParams.set("per_page", "8");
  const upstream = await fetch(upstreamUrl, {
    headers: { Authorization: config.pexelsApiKey },
    signal: AbortSignal.timeout(10_000),
  });
  if (!upstream.ok) {
    sendJson(response, upstream.status === 429 ? 429 : 502, { ok: false, error: upstream.status === 429 ? "PexelsRateLimit" : "PexelsRequestFailed" });
    return;
  }
  const items = normalizePexelsItems(type, await upstream.json());
  pexelsCache.set(cacheKey, { createdAt: Date.now(), items });
  if (pexelsCache.size > 100) pexelsCache.delete(pexelsCache.keys().next().value);
  sendJson(response, 200, { ok: true, cached: false, items });
}

const ADMIN_ROLE_RANK = Object.freeze({ user: 0, support: 1, moderator: 2, administrator: 3, owner: 4 });

function canManageAdminTarget(actor, target) {
  return (ADMIN_ROLE_RANK[actor.role] ?? 0) > (ADMIN_ROLE_RANK[target.role] ?? 0);
}

async function handleAdminUsers(request, response, requestUrl) {
  const session = await requireAdminSession(request, response, "users.read");
  if (!session) return;
  if (!adminStore.available) {
    sendJson(response, 503, { ok: false, error: "AdministrationUnavailable" });
    return;
  }
  if (commerceStore.available) await commerceStore.getAccount(session.user);
  const query = String(requestUrl.searchParams.get("query") || "").slice(0, 80);
  const offset = Math.max(0, Number.parseInt(requestUrl.searchParams.get("offset") || "0", 10) || 0);
  const result = await adminStore.listUsers({ query, offset, limit: 50 });
  sendJson(response, 200, {
    ok: true,
    role: session.user.role,
    permissions: Object.fromEntries(["users.read", "users.revoke", "users.ban", "energy.adjust", "audit.read", "roles.manage"].map((permission) => [permission, hasAdminPermission(session.user.role, permission)])),
    ...result,
  });
}

async function handleAdminAudit(request, response) {
  const session = await requireAdminSession(request, response, "audit.read");
  if (!session) return;
  if (!adminStore.available) {
    sendJson(response, 503, { ok: false, error: "AdministrationUnavailable" });
    return;
  }
  sendJson(response, 200, { ok: true, events: await adminStore.listAudit(100) });
}

async function handleAdminUserAction(request, response, targetSub) {
  if (!isTrustedRequestOrigin(request)) {
    sendJson(response, 403, { ok: false, error: "InvalidOrigin" });
    return;
  }
  const session = await requireAdminSession(request, response, "users.read");
  if (!session) return;
  if (!adminStore.available) {
    sendJson(response, 503, { ok: false, error: "AdministrationUnavailable" });
    return;
  }
  const body = await readJsonBody(request, MAX_COMMERCE_BODY_BYTES);
  const action = String(body.action || "");
  const target = await adminStore.getUser(targetSub);
  if (!target) {
    sendJson(response, 404, { ok: false, error: "UserNotFound" });
    return;
  }

  if (["ban", "unban", "revoke_sessions", "set_role"].includes(action) && !canManageAdminTarget(session.user, target)) {
    sendJson(response, 403, { ok: false, error: "Forbidden" });
    return;
  }

  let updated = target;
  let result = null;
  if (action === "revoke_sessions") {
    if (!hasAdminPermission(session.user.role, "users.revoke")) {
      sendJson(response, 403, { ok: false, error: "Forbidden" });
      return;
    }
    updated = await adminStore.revokeSessions(targetSub);
  } else if (action === "ban") {
    if (!hasAdminPermission(session.user.role, "users.ban")) {
      sendJson(response, 403, { ok: false, error: "Forbidden" });
      return;
    }
    const durationHours = Math.min(87_600, Math.max(1, Number.parseInt(body.durationHours || "24", 10) || 24));
    const reason = String(body.reason || "").trim();
    if (reason.length < 3) {
      sendJson(response, 400, { ok: false, error: "BanReasonRequired" });
      return;
    }
    updated = await adminStore.setBan(targetSub, { until: new Date(Date.now() + durationHours * 60 * 60 * 1000), reason });
  } else if (action === "unban") {
    if (!hasAdminPermission(session.user.role, "users.ban")) {
      sendJson(response, 403, { ok: false, error: "Forbidden" });
      return;
    }
    updated = await adminStore.setBan(targetSub, { until: null, reason: "" });
  } else if (action === "set_role") {
    if (!hasAdminPermission(session.user.role, "roles.manage")) {
      sendJson(response, 403, { ok: false, error: "Forbidden" });
      return;
    }
    if (!ADMIN_ROLES.includes(body.role)) {
      sendJson(response, 400, { ok: false, error: "InvalidAdminRole" });
      return;
    }
    const role = normalizeAdminRole(body.role);
    updated = await adminStore.setRole(targetSub, role);
  } else if (action === "adjust_energy") {
    if (!hasAdminPermission(session.user.role, "energy.adjust")) {
      sendJson(response, 403, { ok: false, error: "Forbidden" });
      return;
    }
    if ((ADMIN_ROLE_RANK[target.role] ?? 0) >= (ADMIN_ROLE_RANK[session.user.role] ?? 0) && target.sub !== session.user.sub) {
      sendJson(response, 403, { ok: false, error: "Forbidden" });
      return;
    }
    if (!commerceStore.available) {
      sendJson(response, 503, { ok: false, error: "CommerceUnavailable" });
      return;
    }
    const delta = Number.parseInt(body.delta, 10);
    result = await commerceStore.adminAdjustEnergy({ sub: target.sub, email: target.email }, delta, session.user.sub);
    if (!result.ok) {
      sendJson(response, 409, result);
      return;
    }
    updated = await adminStore.getUser(targetSub);
  } else {
    sendJson(response, 400, { ok: false, error: "UnknownAdminAction" });
    return;
  }

  if (["ban", "unban", "revoke_sessions", "set_role"].includes(action)) {
    validatedAccessCache.delete(targetSub);
  }

  await adminStore.writeAudit(session.user, action, targetSub, {
    role: action === "set_role" ? updated.role : undefined,
    durationHours: action === "ban" ? Number.parseInt(body.durationHours || "24", 10) : undefined,
    delta: action === "adjust_energy" ? Number.parseInt(body.delta, 10) : undefined,
    reason: action === "ban" ? String(body.reason || "").slice(0, 300) : undefined,
  });
  sendJson(response, 200, { ok: true, user: updated, result });
}

function isTutorAudioConfigured() {
  return Boolean(tutorAudioStore.available && r2AudioStorage.available);
}

async function getTutorAudioLimits(user) {
  let plusActive = false;
  if (commerceStore.available) {
    const account = await commerceStore.getAccount(user);
    plusActive = account?.plusActive === true;
  }
  return {
    plusActive,
    maxBytes: plusActive ? 10 * 1024 * 1024 : 3 * 1024 * 1024,
    maxDurationMs: plusActive ? 5 * 60 * 1000 : 60 * 1000,
    maxDaily: plusActive ? 100 : 10,
    retentionDays: config.r2AudioRetentionDays,
  };
}

function validAudioId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function handleTutorAudioConfig(request, response) {
  const session = await requireAuthSession(request, response);
  if (!session) return;
  if (!isTutorAudioConfigured()) {
    sendJson(response, 200, {
      ok: true,
      available: false,
      maxBytes: 3 * 1024 * 1024,
      maxDurationMs: 60 * 1000,
      maxDaily: 10,
      retentionDays: config.r2AudioRetentionDays,
    });
    return;
  }
  const limits = await getTutorAudioLimits(session.user);
  sendJson(response, 200, {
    ok: true,
    available: isTutorAudioConfigured(),
    maxBytes: limits.maxBytes,
    maxDurationMs: limits.maxDurationMs,
    maxDaily: limits.maxDaily,
    retentionDays: limits.retentionDays,
  });
}

async function handleTutorAudioUploadUrl(request, response) {
  const session = await requireAuthSession(request, response);
  if (!session) return;
  if (!isTrustedRequestOrigin(request)) {
    sendJson(response, 403, { ok: false, error: "InvalidOrigin" });
    return;
  }
  if (!isTutorAudioConfigured()) {
    sendJson(response, 503, { ok: false, error: "AudioStorageUnavailable" });
    return;
  }
  const limits = await getTutorAudioLimits(session.user);
  const metadata = validateAudioUpload(await readJsonBody(request, MAX_AUDIO_METADATA_BODY_BYTES), limits);
  const identity = r2AudioStorage.createObjectIdentity(session.user, metadata.contentType);
  await tutorAudioStore.createPending(session.user, { ...identity, ...metadata }, limits);
  try {
    const uploadUrl = await r2AudioStorage.createUploadUrl(identity.objectKey, metadata.contentType);
    sendJson(response, 200, {
      ok: true,
      audioId: identity.audioId,
      uploadUrl,
      contentType: metadata.contentType,
      expiresIn: config.r2SignedUrlTtlSeconds,
    });
  } catch (error) {
    await tutorAudioStore.remove(session.user, identity.audioId).catch(() => {});
    throw error;
  }
}

async function handleTutorAudioFinalize(request, response) {
  const session = await requireAuthSession(request, response);
  if (!session) return;
  if (!isTrustedRequestOrigin(request)) {
    sendJson(response, 403, { ok: false, error: "InvalidOrigin" });
    return;
  }
  if (!isTutorAudioConfigured()) {
    sendJson(response, 503, { ok: false, error: "AudioStorageUnavailable" });
    return;
  }
  const body = await readJsonBody(request, MAX_AUDIO_METADATA_BODY_BYTES);
  const audioId = String(body.audioId || "");
  if (!validAudioId(audioId)) {
    sendJson(response, 400, { ok: false, error: "InvalidAudioId" });
    return;
  }
  const pending = await tutorAudioStore.getPending(session.user, audioId);
  if (!pending) {
    sendJson(response, 404, { ok: false, error: "PendingAudioNotFound" });
    return;
  }
  try {
    const uploaded = await r2AudioStorage.headObject(pending.objectKey);
    const audio = await tutorAudioStore.finalize(session.user, audioId, uploaded);
    sendJson(response, 200, { ok: true, audio });
  } catch (error) {
    await r2AudioStorage.deleteObject(pending.objectKey).catch(() => {});
    await tutorAudioStore.remove(session.user, audioId).catch(() => {});
    throw error;
  }
}

async function handleTutorAudioReadUrl(request, response, audioId) {
  const session = await requireAuthSession(request, response);
  if (!session) return;
  if (!isTutorAudioConfigured() || !validAudioId(audioId)) {
    sendJson(response, 404, { ok: false, error: "AudioNotFound" });
    return;
  }
  const audio = await tutorAudioStore.get(session.user, audioId);
  if (!audio) {
    sendJson(response, 404, { ok: false, error: "AudioNotFound" });
    return;
  }
  const audioUrl = await r2AudioStorage.createReadUrl(audio.objectKey);
  sendJson(response, 200, { ok: true, audioUrl, expiresIn: config.r2SignedUrlTtlSeconds });
}

async function handleTutorAudioDelete(request, response, audioId) {
  const session = await requireAuthSession(request, response);
  if (!session) return;
  if (!isTrustedRequestOrigin(request)) {
    sendJson(response, 403, { ok: false, error: "InvalidOrigin" });
    return;
  }
  if (!isTutorAudioConfigured() || !validAudioId(audioId)) {
    sendJson(response, 404, { ok: false, error: "AudioNotFound" });
    return;
  }
  const audio = await tutorAudioStore.get(session.user, audioId)
    || await tutorAudioStore.getPending(session.user, audioId);
  if (!audio) {
    sendJson(response, 404, { ok: false, error: "AudioNotFound" });
    return;
  }
  await r2AudioStorage.deleteObject(audio.objectKey);
  await tutorAudioStore.remove(session.user, audioId);
  sendJson(response, 200, { ok: true });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

async function route(request, response) {
  const requestUrl = new URL(request.url ?? "/", config.publicBaseUrl);

  if (request.method === "GET" && requestUrl.pathname === "/health") {
    sendJson(response, 200, {
      ok: true,
      service: "neon-studios-system-academy",
      revision: config.deploymentRevision,
      curriculumSystems: 170,
      launchReady: buildReadinessReport(config).launchReady,
      authConfigured: isAuthConfigured(),
      learningSyncConfigured: learningStore.available,
      administrationConfigured: adminStore.available,
      commerceConfigured: isCommerceConfigured(),
      audioStorageConfigured: isTutorAudioConfigured(),
      pexelsConfigured: Boolean(config.pexelsApiKey),
      communityEnabled: config.communityEnabled,
    });
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/auth/config") {
    handleAuthConfig(response);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/auth/google") {
    await handleGoogleAuth(request, response);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/auth/session") {
    await handleAuthSession(request, response);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/auth/logout") {
    await handleAuthLogout(request, response);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/learning/profile") {
    await handleLearningProfileRead(request, response);
    return;
  }

  if (request.method === "PUT" && requestUrl.pathname === "/api/learning/profile") {
    await handleLearningProfileWrite(request, response);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/commerce/catalog") {
    await handleCommerceCatalog(request, response);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/commerce/account") {
    await handleCommerceAccount(request, response);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/commerce/ledger") {
    await handleCommerceLedger(request, response);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/commerce/session") {
    await handleCommerceSession(request, response, requestUrl);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/commerce/checkout") {
    await handleCommerceCheckout(request, response);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/commerce/portal") {
    await handleCommercePortal(request, response);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/commerce/energy/consume") {
    await handleCommerceEnergyConsume(request, response);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/commerce/webhook") {
    await handleStripeWebhook(request, response);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/community/status") {
    await handleCommunityStatus(request, response);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/backgrounds/pexels/search") {
    await handlePexelsSearch(request, response, requestUrl);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/admin/users") {
    await handleAdminUsers(request, response, requestUrl);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/admin/audit") {
    await handleAdminAudit(request, response);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/admin/readiness") {
    await handleReadiness(request, response);
    return;
  }

  const adminActionMatch = requestUrl.pathname.match(/^\/api\/admin\/users\/([^/]+)\/actions$/);
  if (request.method === "POST" && adminActionMatch) {
    await handleAdminUserAction(request, response, decodeURIComponent(adminActionMatch[1]));
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/tutor/audio/config") {
    await handleTutorAudioConfig(request, response);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/tutor/audio/upload-url") {
    await handleTutorAudioUploadUrl(request, response);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/tutor/audio/finalize") {
    await handleTutorAudioFinalize(request, response);
    return;
  }

  const tutorAudioReadMatch = requestUrl.pathname.match(/^\/api\/tutor\/audio\/([^/]+)\/url$/);
  if (request.method === "GET" && tutorAudioReadMatch) {
    await handleTutorAudioReadUrl(request, response, tutorAudioReadMatch[1]);
    return;
  }

  const tutorAudioDeleteMatch = requestUrl.pathname.match(/^\/api\/tutor\/audio\/([^/]+)$/);
  if (request.method === "DELETE" && tutorAudioDeleteMatch) {
    await handleTutorAudioDelete(request, response, tutorAudioDeleteMatch[1]);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/login") {
    if (await getValidatedAuthSession(request)) {
      redirect(response, "/");
      return;
    }
    if (!await sendSiteFile(response, "/login.html")) {
      sendJson(response, 500, { ok: false, error: "LoginPageMissing" });
    }
    return;
  }

  if (request.method === "GET" && ["/privacy", "/terms", "/support"].includes(requestUrl.pathname)) {
    if (!await sendSiteFile(response, `${requestUrl.pathname}.html`)) {
      sendJson(response, 404, { ok: false, error: "NotFound" });
    }
    return;
  }

  if (request.method === "GET" && [
    "/auth.css",
    "/auth.js",
    "/legal.js",
    "/academy-effects.js",
    "/academy-scene.js",
    "/assets/lucide.min.js",
    "/assets/vendor/three.module.min.js",
    "/assets/vendor/three.core.min.js",
  ].includes(requestUrl.pathname)) {
    if (!await sendSiteFile(response, requestUrl.pathname)) {
      sendJson(response, 404, { ok: false, error: "NotFound" });
    }
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/auth/tiktok") {
    await handleAuthStart(request, response);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/auth/tiktok/callback") {
    await handleAuthCallback(request, response, requestUrl);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/reels") {
    await handleApiReels(request, response, requestUrl);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/reels/refresh") {
    await handleRefresh(request, response);
    return;
  }

  if (request.method === "GET" && !requestUrl.pathname.startsWith("/api/")) {
    if (!getAuthSession(request)) {
      response.setHeader("Set-Cookie", clearAuthCookie());
      redirect(response, "/login");
      return;
    }

    if (await sendSiteFile(response, requestUrl.pathname)) {
      return;
    }

    sendJson(response, 404, { ok: false, error: "NotFound" });
    return;
  }

  sendJson(response, 404, {
    ok: false,
    error: "NotFound",
  });
}

export const server = http.createServer((request, response) => {
  applySecurityHeaders(response, request);
  route(request, response).catch((error) => {
    console.error(error);
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    sendJson(response, statusCode, {
      ok: false,
      error: statusCode >= 500 ? "InternalServerError" : "RequestRejected",
      ...(statusCode < 500 ? { message: error.message } : {}),
    });
  });
});

export const serverPort = config.port;

if (process.env.CLOUDFLARE_WORKERS !== "true") {
  server.listen(serverPort, () => {
    console.log(`Neon Studios System Academy listening on ${config.publicBaseUrl}`);
  });
}
