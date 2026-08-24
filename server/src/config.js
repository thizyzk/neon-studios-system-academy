import path from "node:path";
import process from "node:process";
import { readFileSync } from "node:fs";

function loadDotEnv() {
  const envPath = path.resolve(process.cwd(), ".env");

  try {
    const contents = readFileSync(envPath, "utf8");

    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();
      if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env is optional; production hosts usually provide real environment variables.
  }
}

export function readConfig() {
  const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? process.env.RENDER_EXTERNAL_URL ?? "http://localhost:3000";
  const publicHostname = new URL(publicBaseUrl).hostname.toLowerCase();
  const configuredRecaptchaScore = Number.parseFloat(process.env.RECAPTCHA_MINIMUM_SCORE ?? "0.5");
  const configuredCaptchaHosts = (process.env.RECAPTCHA_ALLOWED_HOSTNAMES ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return {
    port: Number.parseInt(process.env.PORT ?? "3000", 10),
    publicBaseUrl,
    siteRoot: process.env.SITE_ROOT ?? path.resolve(process.cwd(), "..", "docs", "economy-systems-guide"),
    sourceRoot: process.env.SOURCE_ROOT ?? path.resolve(process.cwd(), "..", "src"),
    googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
    googleAllowedEmailDomain: (process.env.GOOGLE_ALLOWED_EMAIL_DOMAIN ?? "").trim().toLowerCase(),
    recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY ?? "",
    recaptchaSecretKey: process.env.RECAPTCHA_SECRET_KEY ?? "",
    recaptchaVersion: (process.env.RECAPTCHA_VERSION ?? "v3").trim().toLowerCase() === "v2" ? "v2" : "v3",
    recaptchaAction: (process.env.RECAPTCHA_ACTION ?? "login").trim(),
    recaptchaMinimumScore: Number.isFinite(configuredRecaptchaScore)
      ? Math.min(1, Math.max(0, configuredRecaptchaScore))
      : 0.5,
    recaptchaAllowedHostnames: configuredCaptchaHosts.length > 0
      ? configuredCaptchaHosts
      : [...new Set([publicHostname, "localhost"])],
    recaptchaVerifyUrl: "https://www.google.com/recaptcha/api/siteverify",
    authSessionSecret: process.env.AUTH_SESSION_SECRET ?? "",
    authSessionMaxAgeSeconds: Number.parseInt(process.env.AUTH_SESSION_MAX_AGE_SECONDS ?? "604800", 10),
    authRateLimitMax: Number.parseInt(process.env.AUTH_RATE_LIMIT_MAX ?? "8", 10),
    authRateLimitWindowSeconds: Number.parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_SECONDS ?? "600", 10),
    trustProxy: process.env.TRUST_PROXY === "true",
    authCookieName: publicBaseUrl.startsWith("https://") ? "__Host-neon_academy_session" : "neon_academy_session",
    tiktokClientKey: process.env.TIKTOK_CLIENT_KEY ?? "",
    tiktokClientSecret: process.env.TIKTOK_CLIENT_SECRET ?? "",
    tiktokRedirectUri: process.env.TIKTOK_REDIRECT_URI ?? `${process.env.PUBLIC_BASE_URL ?? "http://localhost:3000"}/auth/tiktok/callback`,
    tiktokScopes: process.env.TIKTOK_SCOPES ?? "user.info.basic,video.list",
    robloxSharedSecret: process.env.ROBLOX_SHARED_SECRET ?? "",
    reelsCacheTtlMs: Number.parseInt(process.env.REELS_CACHE_TTL_SECONDS ?? "43200", 10) * 1000,
    tokenStorePath: process.env.TIKTOK_TOKEN_STORE_PATH ?? path.resolve(process.cwd(), ".data", "tiktok-session.json"),
    stateCookieName: "tiktok_oauth_state",
    tiktokApiBaseUrl: "https://open.tiktokapis.com",
    tiktokAuthorizeUrl: "https://www.tiktok.com/v2/auth/authorize/",
  };
}

loadDotEnv();
