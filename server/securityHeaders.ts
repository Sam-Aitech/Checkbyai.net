import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import helmet from "helmet";
import type { RequestHandler } from "express";

/**
 * Third-party origins the client genuinely needs (everything else is same-origin):
 *  - challenges.cloudflare.com: Turnstile CAPTCHA (script, iframe, verification call).
 *  - *.googleusercontent.com: Google OAuth profile pictures (img only).
 *  - Sentry ingest host: derived from the DSN (or CSP_CONNECT_SRC), connect only.
 * Stripe is reached by full-page redirects (navigations are not governed by CSP), so no Stripe
 * origin is allowed. Fonts are self-hosted/system.
 */
const TURNSTILE = "https://challenges.cloudflare.com";

export interface SecurityHeadersOptions {
  /** 'sha256-...' sources for the inline <style> blocks shipped in the built HTML. */
  styleHashes?: string[];
  /** Extra https origins for connect-src (validated, https only). */
  connectSrcExtra?: string[];
}

/** Hash every inline <style> block in the built HTML so style-src needs no 'unsafe-inline'. */
export function collectInlineStyleHashes(rootDir: string): string[] {
  const hashes = new Set<string>();
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".html")) {
        const html = fs.readFileSync(full, "utf8");
        for (const match of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
          hashes.add(`'sha256-${crypto.createHash("sha256").update(match[1], "utf8").digest("base64")}'`);
        }
      }
    }
  };
  walk(rootDir);
  return [...hashes].sort((a, b) => a.localeCompare(b));
}

/** https origins from CSP_CONNECT_SRC plus the Sentry DSN host, de-duplicated and validated. */
export function resolveConnectSrcExtra(env: NodeJS.ProcessEnv = process.env): string[] {
  const candidates: string[] = (env.CSP_CONNECT_SRC ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const dsn of [env.VITE_SENTRY_DSN, env.SENTRY_DSN]) {
    if (dsn) candidates.push(dsn);
  }
  const origins = new Set<string>();
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      if (url.protocol === "https:") origins.add(url.origin);
    } catch {
      // ignore malformed values rather than widening the policy
    }
  }
  return [...origins].sort((a, b) => a.localeCompare(b));
}

// Replit's development Preview renders the app in an iframe. Keep
// clickjacking protection strict in production without blocking Preview.
export function createSecurityHeadersMiddleware(isProduction: boolean, options: SecurityHeadersOptions = {}): RequestHandler {
  const styleHashes = options.styleHashes ?? [];
  const connectExtra = options.connectSrcExtra ?? [];

  return helmet({
    contentSecurityPolicy: {
      directives: isProduction
        ? {
            defaultSrc: ["'self'"],
            // No 'unsafe-inline' / 'unsafe-eval': the only inline <script> blocks are JSON-LD data.
            scriptSrc: ["'self'", TURNSTILE],
            scriptSrcAttr: ["'none'"],
            // Inline <style> blocks are allow-listed by hash. Style attributes in server-rendered
            // and static markup still need 'unsafe-inline', scoped to attributes only (they cannot run script).
            styleSrc: ["'self'", ...styleHashes],
            styleSrcAttr: ["'unsafe-inline'"],
            fontSrc: ["'self'", "data:"],
            imgSrc: ["'self'", "data:", "https://*.googleusercontent.com"],
            connectSrc: ["'self'", TURNSTILE, ...connectExtra],
            frameSrc: [TURNSTILE],
            workerSrc: ["'self'", "blob:"],
            manifestSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
            upgradeInsecureRequests: [],
          }
        : {
            // Development only: Vite's HMR preamble needs inline + eval and websockets.
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", TURNSTILE],
            styleSrc: ["'self'", "'unsafe-inline'"],
            fontSrc: ["'self'", "data:"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", TURNSTILE, "ws:", "wss:", ...connectExtra],
            frameSrc: [TURNSTILE],
            workerSrc: ["'self'", "blob:"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: null,
            upgradeInsecureRequests: null,
          },
    },
    hsts: isProduction
      ? {
          maxAge: 63072000,
          includeSubDomains: true,
          preload: true,
        }
      : false,
    xFrameOptions: isProduction ? { action: "deny" } : false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  });
}
