import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { URL } from "node:url";

import { OAuth2Client } from "google-auth-library";

import { readConfig } from "./config.js";
import { createSignedSession, verifySignedSession } from "./signedSession.js";
import { exchangeAuthorizationCode, getUserInfo, listVideos, queryVideos, refreshAccessToken } from "./tiktokClient.js";
import { readTokenStore, withTokenTimestamps, writeTokenStore } from "./tokenStore.js";

const config = readConfig();
const STATE_MAX_AGE_SECONDS = 10 * 60;
const TOKEN_REFRESH_SKEW_MS = 10 * 60 * 1000;
const MAX_AUTH_BODY_BYTES = 20 * 1024;
const authRateLimitWindowMs = config.authRateLimitWindowSeconds * 1000;
const googleClient = config.googleClientId ? new OAuth2Client(config.googleClientId) : null;
const authAttempts = new Map();

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".luau", "text/plain; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
]);

let reelCache = {
  fetchedAt: 0,
  payload: null,
};

function applySecurityHeaders(response) {
  response.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    "script-src 'self' https://accounts.google.com https://www.google.com https://www.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://accounts.google.com",
    "frame-src https://accounts.google.com https://www.google.com https://recaptcha.google.com",
    "connect-src 'self' https://accounts.google.com https://www.google.com",
    "img-src 'self' data: https://lh3.googleusercontent.com https://*.googleusercontent.com",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; "));
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

function isAuthConfigured() {
  return Boolean(
    config.googleClientId
    && config.recaptchaSiteKey
    && config.recaptchaSecretKey
    && Buffer.byteLength(config.authSessionSecret, "utf8") >= 32
  );
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

async function readJsonBody(request) {
  if (!(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
    const error = new Error("Content-Type must be application/json.");
    error.statusCode = 415;
    throw error;
  }

  const chunks = [];
  let receivedBytes = 0;
  for await (const chunk of request) {
    receivedBytes += chunk.length;
    if (receivedBytes > MAX_AUTH_BODY_BYTES) {
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

  const verificationResponse = await fetch(config.recaptchaVerifyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(8000),
  });

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
  const store = await readTokenStore(config.tokenStorePath);
  const token = store.token;

  if (!token?.access_token || !token?.refresh_token) {
    return null;
  }

  if (Date.now() < token.access_token_expires_at - TOKEN_REFRESH_SKEW_MS) {
    return token;
  }

  const refreshed = await refreshAccessToken(config, token.refresh_token);
  const nextToken = withTokenTimestamps(refreshed);
  await writeTokenStore(config.tokenStorePath, {
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

async function handleAuthStart(_request, response) {
  if (!requireTikTokConfig(response)) {
    return;
  }

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
  const store = await readTokenStore(config.tokenStorePath);
  await writeTokenStore(config.tokenStorePath, {
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
    const captchaResult = await verifyRecaptcha(body.captchaToken, attempt.ip);
    if (!captchaResult.ok) {
      console.warn(
        "Authentication CAPTCHA rejected.",
        captchaResult.reason,
        captchaResult.hostname ?? "",
        Number.isFinite(captchaResult.score) ? `score=${captchaResult.score}` : ""
      );
      sendJson(response, 401, {
        ok: false,
        error: "InvalidCaptcha",
        captchaReason: captchaResult.reason,
      });
      return;
    }

    const user = await verifyGoogleCredential(body.credential);
    if (!user) {
      sendJson(response, 401, { ok: false, error: "GoogleAccountRejected" });
      return;
    }

    const session = createSignedSession(user, config.authSessionSecret, config.authSessionMaxAgeSeconds);
    authAttempts.delete(attempt.ip);
    response.setHeader("Set-Cookie", createAuthCookie(session.token));
    sendJson(response, 200, { ok: true, user });
  } catch (error) {
    console.warn("Google authentication failed.", error.message);
    sendJson(response, error.statusCode ?? 401, {
      ok: false,
      error: error.statusCode ? "InvalidAuthRequest" : "GoogleAccountRejected",
    });
  }
}

async function handleAuthSession(request, response) {
  const session = await getAuthSession(request);
  if (!session) {
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
      authConfigured: isAuthConfigured(),
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

  if (request.method === "GET" && requestUrl.pathname === "/login") {
    if (await getAuthSession(request)) {
      redirect(response, "/");
      return;
    }
    if (!await sendSiteFile(response, "/login.html")) {
      sendJson(response, 500, { ok: false, error: "LoginPageMissing" });
    }
    return;
  }

  if (request.method === "GET" && ["/privacy", "/terms"].includes(requestUrl.pathname)) {
    const legalFile = requestUrl.pathname === "/privacy" ? "/privacy.html" : "/terms.html";
    if (!await sendSiteFile(response, legalFile)) {
      sendJson(response, 404, { ok: false, error: "NotFound" });
    }
    return;
  }

  if (request.method === "GET" && ["/auth.css", "/auth.js", "/legal.js", "/assets/lucide.min.js"].includes(requestUrl.pathname)) {
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
    if (!await getAuthSession(request)) {
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

const server = http.createServer((request, response) => {
  applySecurityHeaders(response);
  route(request, response).catch((error) => {
    console.error(error);
    sendJson(response, 500, {
      ok: false,
      error: "InternalServerError",
      message: error.message,
    });
  });
});

server.listen(config.port, () => {
  console.log(`Neon Studios System Academy listening on ${config.publicBaseUrl}`);
});
