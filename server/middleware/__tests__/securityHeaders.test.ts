import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import {
  collectInlineStyleHashes,
  createSecurityHeadersMiddleware,
  resolveConnectSrcExtra,
  type SecurityHeadersOptions,
} from "../../securityHeaders";

function makeApp(isProduction: boolean, options?: SecurityHeadersOptions) {
  const app = express();
  app.use(createSecurityHeadersMiddleware(isProduction, options));
  app.get("/", (_req, res) => res.send("ok"));
  return app;
}

function directives(csp: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const part of csp.split(";")) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) out[name] = values;
  }
  return out;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "csp-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("security headers", () => {
  it("keeps development responses embeddable in Replit Preview", async () => {
    const response = await request(makeApp(false)).get("/");

    expect(response.status).toBe(200);
    expect(response.headers["x-frame-options"]).toBeUndefined();
    expect(response.headers["content-security-policy"]).not.toContain("frame-ancestors 'none'");
  });

  it("retains anti-framing protections in production", async () => {
    const response = await request(makeApp(true)).get("/");

    expect(response.status).toBe(200);
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  });
});

describe("production Content-Security-Policy", () => {
  const hash = "'sha256-abc123='";
  async function prod(options: SecurityHeadersOptions = { styleHashes: [hash], connectSrcExtra: ["https://o1.ingest.sentry.io"] }) {
    const res = await request(makeApp(true, options)).get("/");
    return directives(res.headers["content-security-policy"] as string);
  }

  it("has no unsafe-inline or unsafe-eval in script-src, and blocks inline event handlers", async () => {
    const d = await prod();
    expect(d["script-src"]).toEqual(["'self'", "https://challenges.cloudflare.com"]);
    expect(d["script-src"].join(" ")).not.toMatch(/unsafe-/);
    expect(d["script-src-attr"]).toEqual(["'none'"]);
  });

  it("allows inline styles only by hash, with attribute-level inline styles as the sole residual", async () => {
    const d = await prod();
    expect(d["style-src"]).toEqual(["'self'", hash]);
    expect(d["style-src"]).not.toContain("'unsafe-inline'");
    expect(d["style-src-attr"]).toEqual(["'unsafe-inline'"]);
  });

  it("restricts every fetch and navigation directive", async () => {
    const d = await prod();
    expect(d["default-src"]).toEqual(["'self'"]);
    expect(d["object-src"]).toEqual(["'none'"]);
    expect(d["base-uri"]).toEqual(["'self'"]);
    expect(d["form-action"]).toEqual(["'self'"]);
    expect(d["frame-ancestors"]).toEqual(["'none'"]);
    expect(d["frame-src"]).toEqual(["https://challenges.cloudflare.com"]);
    expect(d["connect-src"]).toEqual(["'self'", "https://challenges.cloudflare.com", "https://o1.ingest.sentry.io"]);
    expect(d["img-src"]).toEqual(["'self'", "data:", "https://*.googleusercontent.com"]);
    expect(d["font-src"]).toEqual(["'self'", "data:"]);
    expect(d).toHaveProperty("upgrade-insecure-requests");
  });

  it("does not use blanket https:, wildcard or Stripe sources", async () => {
    const res = await request(makeApp(true)).get("/");
    const csp = res.headers["content-security-policy"] as string;
    expect(csp).not.toMatch(/(^|[\s;])https:([\s;]|$)/);
    expect(csp).not.toMatch(/(^|\s)\*(\s|;|$)/);
    expect(csp).not.toContain("stripe.com");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("sends HSTS and the other hardening headers", async () => {
    const res = await request(makeApp(true)).get("/");
    expect(res.headers["strict-transport-security"]).toContain("max-age=63072000");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("development keeps the permissive script policy that Vite HMR needs, production never does", async () => {
    const dev = directives((await request(makeApp(false)).get("/")).headers["content-security-policy"] as string);
    expect(dev["script-src"]).toContain("'unsafe-eval'");
    const production = await prod();
    expect(production["script-src"]).not.toContain("'unsafe-eval'");
  });
});

describe("collectInlineStyleHashes", () => {
  it("hashes inline <style> blocks across nested html files and ignores everything else", () => {
    fs.mkdirSync(path.join(tmp, "guides"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "index.html"), "<html><style>body{margin:0}</style><script type=\"application/ld+json\">{}</script></html>");
    fs.writeFileSync(path.join(tmp, "guides", "a.html"), "<style media=\"all\">a{color:red}</style><style>body{margin:0}</style>");
    fs.writeFileSync(path.join(tmp, "notes.txt"), "<style>ignored{}</style>");
    const hashes = collectInlineStyleHashes(tmp);
    expect(hashes).toHaveLength(2); // duplicate blocks collapse
    expect(hashes.every((h) => /^'sha256-[A-Za-z0-9+/]+=*'$/.test(h))).toBe(true);
  });

  it("returns nothing for a missing directory", () => {
    expect(collectInlineStyleHashes(path.join(tmp, "nope"))).toEqual([]);
  });
});

describe("resolveConnectSrcExtra", () => {
  it("accepts https origins and the Sentry DSN host, and drops everything else", () => {
    const result = resolveConnectSrcExtra({
      CSP_CONNECT_SRC: "https://api.example.com/path, http://insecure.example.com, javascript:alert(1), not a url, *",
      VITE_SENTRY_DSN: "https://publickey@o123.ingest.sentry.io/456",
    } as NodeJS.ProcessEnv);
    expect(result).toEqual(["https://api.example.com", "https://o123.ingest.sentry.io"]);
  });
});
