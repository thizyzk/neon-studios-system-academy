import { httpServerHandler } from "cloudflare:node";

import { server, serverPort } from "./index.js";
import { verifySignedSession } from "./signedSession.js";

server.listen(serverPort);

const backend = httpServerHandler({ port: serverPort });
const PUBLIC_ASSET_PATHS = new Set([
  "/auth.css",
  "/auth.js",
  "/legal.js",
  "/academy-effects.js",
  "/academy-scene.js",
  "/assets/academy-icon.svg",
  "/assets/lucide.min.js",
  "/assets/vendor/three.module.min.js",
  "/assets/vendor/three.core.min.js",
]);

function isBackendRoute(pathname) {
  return pathname === "/health"
    || pathname.startsWith("/api/")
    || pathname === "/auth/tiktok"
    || pathname === "/auth/tiktok/callback";
}

function getSessionCookieName(requestUrl) {
  return requestUrl.protocol === "https:" ? "__Host-neon_academy_session" : "neon_academy_session";
}

function clearSessionCookie(requestUrl) {
  const secure = requestUrl.protocol === "https:" ? "; Secure" : "";
  return `${getSessionCookieName(requestUrl)}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Priority=High${secure}`;
}

function getCookie(request, name) {
  const cookies = request.headers.get("cookie") || "";
  for (const part of cookies.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === name) return rawValue.join("=");
  }
  return "";
}

function hasSignedSession(request, requestUrl) {
  const token = getCookie(request, getSessionCookieName(requestUrl));
  return Boolean(verifySignedSession(token, process.env.AUTH_SESSION_SECRET || ""));
}

function redirect(location, requestUrl, clearCookie = false) {
  const headers = new Headers({
    Location: location,
    "Cache-Control": "no-store",
  });
  if (clearCookie) headers.set("Set-Cookie", clearSessionCookie(requestUrl));
  return new Response(null, { status: 302, headers });
}

function withSecurityHeaders(response, requestUrl, assetPath) {
  const headers = new Headers(response.headers);
  const isEmbeddedLuau = assetPath.startsWith("/luau/");
  const r2Origin = process.env.R2_ACCOUNT_ID
    ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
    : "";
  headers.set("Content-Security-Policy", [
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
  headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", isEmbeddedLuau ? "SAMEORIGIN" : "DENY");
  headers.set("X-Permitted-Cross-Domain-Policies", "none");
  headers.set("Permissions-Policy", "camera=(), microphone=(self), geolocation=()");
  if (requestUrl.protocol === "https:") {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  if (assetPath.endsWith(".html") || ["/", "/login", "/privacy", "/terms"].includes(assetPath)) {
    headers.set("Cache-Control", "no-store");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function createAssetRequest(request, assetPath) {
  const assetUrl = new URL(request.url);
  assetUrl.pathname = assetPath;
  assetUrl.search = "";
  return new Request(assetUrl, {
    method: request.method === "HEAD" ? "HEAD" : "GET",
    headers: request.headers,
  });
}

async function serveAsset(request, env, assetPath) {
  const requestUrl = new URL(request.url);
  const response = await env.ASSETS.fetch(createAssetRequest(request, assetPath));
  return withSecurityHeaders(response, requestUrl, assetPath);
}

async function getSessionResponse(request) {
  const sessionUrl = new URL("/api/auth/session", request.url);
  return backend.fetch(new Request(sessionUrl, {
    method: "GET",
    headers: request.headers,
  }));
}

export default {
  async fetch(request, env, context) {
    const requestUrl = new URL(request.url);
    const { pathname } = requestUrl;

    if (isBackendRoute(pathname) || !["GET", "HEAD"].includes(request.method)) {
      return backend.fetch(request, env, context);
    }

    if (pathname === "/login") {
      const sessionResponse = await getSessionResponse(request);
      if (sessionResponse.ok) return redirect("/", requestUrl);
      return serveAsset(request, env, "/login.html");
    }

    if (pathname === "/privacy" || pathname === "/terms") {
      return serveAsset(request, env, `${pathname}.html`);
    }

    if (PUBLIC_ASSET_PATHS.has(pathname)) {
      return serveAsset(request, env, pathname);
    }

    if (!hasSignedSession(request, requestUrl)) {
      return redirect("/login", requestUrl, true);
    }

    return serveAsset(request, env, pathname === "/" ? "/index.html" : pathname);
  },
};
