import path from "node:path";
import process from "node:process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const isCloudflareWorker = process.env.CLOUDFLARE_WORKERS === "true";
const serverRoot = isCloudflareWorker
  ? "/server"
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = isCloudflareWorker ? "/" : path.resolve(serverRoot, "..");

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
  const publicBaseUrl = process.env.PUBLIC_BASE_URL?.trim() || process.env.RENDER_EXTERNAL_URL?.trim() || "http://localhost:3000";
  const publicHostname = new URL(publicBaseUrl).hostname.toLowerCase();
  const configuredRecaptchaScore = Number.parseFloat(process.env.RECAPTCHA_MINIMUM_SCORE ?? "0.5");
  const configuredCaptchaHosts = (process.env.RECAPTCHA_ALLOWED_HOSTNAMES ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return {
    port: Number.parseInt(process.env.PORT ?? "3000", 10),
    deploymentRevision: (process.env.DEPLOYMENT_REVISION?.trim() || process.env.RENDER_GIT_COMMIT?.trim() || "local").slice(0, 12),
    publicBaseUrl,
    siteRoot: process.env.SITE_ROOT?.trim() || path.resolve(projectRoot, "docs", "economy-systems-guide"),
    sourceRoot: process.env.SOURCE_ROOT?.trim() || path.resolve(projectRoot, "src"),
    googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
    googleAllowedEmailDomain: (process.env.GOOGLE_ALLOWED_EMAIL_DOMAIN ?? "").trim().toLowerCase(),
    adminEmails: (process.env.ADMIN_EMAILS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean),
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
    databaseUrl: process.env.DATABASE_URL ?? "",
    r2AccountId: (process.env.R2_ACCOUNT_ID ?? "").trim(),
    r2AccessKeyId: (process.env.R2_ACCESS_KEY_ID ?? "").trim(),
    r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    r2BucketName: (process.env.R2_BUCKET_NAME ?? "neon-academy-audio").trim(),
    r2SignedUrlTtlSeconds: Math.min(900, Math.max(60, Number.parseInt(process.env.R2_SIGNED_URL_TTL_SECONDS ?? "300", 10) || 300)),
    r2AudioRetentionDays: Math.min(365, Math.max(1, Number.parseInt(process.env.R2_AUDIO_RETENTION_DAYS ?? "30", 10) || 30)),
    stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
    stripePriceIds: {
      "plus-monthly": (process.env.STRIPE_PRICE_PLUS_MONTHLY ?? "").trim(),
      "energy-50": (process.env.STRIPE_PRICE_ENERGY_50 ?? "").trim(),
      "energy-150": (process.env.STRIPE_PRICE_ENERGY_150 ?? "").trim(),
      "energy-500": (process.env.STRIPE_PRICE_ENERGY_500 ?? "").trim(),
      "energy-1000": (process.env.STRIPE_PRICE_ENERGY_1000 ?? "").trim(),
    },
    stripeAutomaticTax: process.env.STRIPE_AUTOMATIC_TAX === "true",
    stripeAllowPromotionCodes: process.env.STRIPE_ALLOW_PROMOTION_CODES === "true",
    promotionalPricesVerified: process.env.PROMOTIONAL_PRICES_VERIFIED === "true",
    pexelsApiKey: process.env.PEXELS_API_KEY ?? "",
    communityEnabled: process.env.COMMUNITY_ENABLED === "true",
    tiktokClientKey: process.env.TIKTOK_CLIENT_KEY ?? "",
    tiktokClientSecret: process.env.TIKTOK_CLIENT_SECRET ?? "",
    tiktokRedirectUri: process.env.TIKTOK_REDIRECT_URI?.trim() || `${publicBaseUrl}/auth/tiktok/callback`,
    tiktokScopes: process.env.TIKTOK_SCOPES ?? "user.info.basic,video.list",
    robloxSharedSecret: process.env.ROBLOX_SHARED_SECRET ?? "",
    reelsCacheTtlMs: Number.parseInt(process.env.REELS_CACHE_TTL_SECONDS ?? "43200", 10) * 1000,
    tokenStorePath: process.env.TIKTOK_TOKEN_STORE_PATH?.trim() || path.resolve(serverRoot, ".data", "tiktok-session.json"),
    stateCookieName: "tiktok_oauth_state",
    tiktokApiBaseUrl: "https://open.tiktokapis.com",
    tiktokAuthorizeUrl: "https://www.tiktok.com/v2/auth/authorize/",
  };
}

loadDotEnv();
