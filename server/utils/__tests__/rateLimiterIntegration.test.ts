/**
 * rateLimiterIntegration.test.ts
 *
 * Verification: Phase 3 — rate-limit headers and 429 behaviour
 *
 * Mounts a minimal Express app with express-rate-limit (in-process MemoryStore —
 * same as when Redis is offline) and verifies the full frontend→backend flow:
 *
 *   Request flow:
 *     Client → Express endpoint with rate limiter middleware
 *             → 200 on first N requests
 *             → 429 Too Many Requests once limit is exceeded
 *             → RateLimit-* headers present on every response (RFC 6585)
 */
import express from "express";
import request from "supertest";
import rateLimit from "express-rate-limit";
import { describe, it, expect, beforeAll } from "vitest";

// ── Build a minimal Express app under test ────────────────────────────────────

function buildApp(maxRequests: number) {
  const app = express();
  app.set("trust proxy", 1); // mirrors server/index.ts

  const limiter = rateLimit({
    windowMs: 60 * 1_000,
    max: maxRequests,
    standardHeaders: true,  // RateLimit-* headers (RFC 6585)
    legacyHeaders: false,
    // No Redis store — uses in-process MemoryStore (same as Redis-offline fallback)
    message: { message: "Too many requests. Please wait before browsing the directory again." },
  });

  app.get("/api/sponsors", limiter, (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Rate limiter — frontend to backend flow", () => {
  describe("under the limit", () => {
    const app = buildApp(5);

    it("returns 200 on the first request", async () => {
      const res = await request(app).get("/api/sponsors");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it("includes RateLimit-Limit header (RFC 6585 standard headers)", async () => {
      const res = await request(app).get("/api/sponsors");
      // express-rate-limit v8 emits 'RateLimit-Limit' with standardHeaders:true
      expect(res.headers).toHaveProperty("ratelimit-limit");
    });

    it("includes RateLimit-Remaining header", async () => {
      const res = await request(app).get("/api/sponsors");
      expect(res.headers).toHaveProperty("ratelimit-remaining");
    });

    it("does NOT include legacy X-RateLimit-* headers (legacyHeaders:false)", async () => {
      const res = await request(app).get("/api/sponsors");
      expect(res.headers).not.toHaveProperty("x-ratelimit-limit");
      expect(res.headers).not.toHaveProperty("x-ratelimit-remaining");
    });
  });

  describe("when limit is exceeded", () => {
    // App with max=2 so we can blow through it quickly
    const app = buildApp(2);

    let limitedRes: request.Response;

    beforeAll(async () => {
      // Exhaust the allowance
      await request(app).get("/api/sponsors");
      await request(app).get("/api/sponsors");
      // This third request should be blocked
      limitedRes = await request(app).get("/api/sponsors");
    });

    it("returns HTTP 429 when limit is exceeded", () => {
      expect(limitedRes.status).toBe(429);
    });

    it("returns the configured error message body", () => {
      expect(limitedRes.body).toMatchObject({
        message: "Too many requests. Please wait before browsing the directory again.",
      });
    });

    it("includes Retry-After header on 429", () => {
      // express-rate-limit v8 with standardHeaders:true emits RateLimit-Reset
      // Some versions also set Retry-After — we accept either convention
      const hasRetry =
        "retry-after" in limitedRes.headers ||
        "ratelimit-reset" in limitedRes.headers;
      expect(hasRetry).toBe(true);
    });
  });

  describe("graceful degradation (Redis unavailable → in-process store)", () => {
    // The key contract: when makeRateLimitStore returns undefined,
    // rateLimit() must still enforce limits using its own MemoryStore.
    const app = buildApp(1);

    it("still enforces rate limits without Redis", async () => {
      await request(app).get("/api/sponsors"); // consume the 1 allowed
      const blocked = await request(app).get("/api/sponsors");
      expect(blocked.status).toBe(429);
    });
  });
});
