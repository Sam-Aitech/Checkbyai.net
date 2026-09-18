/**
 * sponsors.freeSearch.test.ts
 *
 * Regression test for the free-search documented-limit mismatch:
 *   docs/SECURITY.md = 1 req/day per IP (source of truth).
 *   Old code enforced 30 req/min — a pure implementation bug.
 *
 * Exercises the ACTUAL route (registerSponsorRoutes) with supertest, not a
 * standalone limiter replica, so future refactors of the limiter wiring that
 * break the route will fail here.
 *
 * The limiter is keyed on IP only and shared by free-search +
 * historical-search (one combined daily bucket). Each test uses a distinct
 * X-Forwarded-For IP because the module-level limiter state is shared across
 * tests within this file (vitest isolates per file, not per test).
 */
import express from "express";
import request from "supertest";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (must be declared before importing the route module) ───────────────

vi.mock("../../db", () => ({
  db: {
    select: vi.fn(),
    execute: vi.fn(() => Promise.resolve({ rows: [] })),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock("../../auth", () => ({
  isAuthenticated: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../../middleware/roleGuard", () => ({
  requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../../utils/sponsorSearch", () => ({
  ensureIndexReady: vi.fn(() => Promise.resolve()),
  isIndexReady: vi.fn(() => true),
  searchSponsors: vi.fn(() => ({
    results: [
      {
        fingerprint: "acme|london|worker",
        organisationName: "Acme Ltd",
        townCity: "London",
        typeRating: "A-Rating",
        route: "Worker",
        status: "ACTIVE",
        matchScore: 94,
        historicalNames: [],
      },
    ],
    total: 1,
    page: 1,
    totalPages: 1,
  })),
  searchSponsorsFallback: vi.fn(() =>
    Promise.resolve({ results: [], total: 0, page: 1, totalPages: 1 }),
  ),
  searchRevokedSponsors: vi.fn(() => Promise.resolve([])),
  getIndexHealth: vi.fn(() => ({ ready: true })),
}));

vi.mock("../../services/monitoringService", () => ({
  recordSearchRequest: vi.fn(),
}));

vi.mock("../../services/aiDigest", () => ({
  generateHeadline: vi.fn(),
  signDigest: vi.fn(() => "test-signature"),
}));

vi.mock("../../utils/redisClient", () => ({
  // getRedis: null = Redis down → makeRateLimitStore returns undefined →
  // express-rate-limit uses its in-process MemoryStore (real limiter wiring).
  getRedis: vi.fn(() => null),
  cacheGet: vi.fn(() => Promise.resolve(null)),
  cacheSet: vi.fn(() => Promise.resolve()),
  cacheFlushPattern: vi.fn(() => Promise.resolve(0)),
  flushSponsorCaches: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../storage", () => ({
  storage: {},
}));

// NOTE: ../utils/redisRateLimitStore is intentionally NOT mocked — the real
// factory returns undefined when Redis is down, so express-rate-limit uses its
// in-process MemoryStore. That exercises the real limiter wiring.

import { registerSponsorRoutes } from "../sponsors";
import { errorHandler } from "../../lib/errorHandler";

// ── App builder ──────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.set("trust proxy", 1); // mirrors server/index.ts — req.ip from XFF
  app.use(express.json());
  registerSponsorRoutes(app);
  app.use(errorHandler);
  return app;
}

const get = (app: express.Express, path: string, ip: string) =>
  request(app).get(path).set("X-Forwarded-For", ip);

// ── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/sponsors/free-search — 1 req/day per IP", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows the first request (200 with search results)", async () => {
    const app = buildApp();
    const res = await get(app, "/api/sponsors/free-search?q=acme", "10.10.0.1");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.results).toHaveLength(1);
    expect(res.headers["ratelimit-limit"]).toBe("1");
  });

  it("blocks the SECOND request from the same IP with 429 (not 30/min)", async () => {
    const app = buildApp();
    const ip = "10.10.0.2";

    const first = await get(app, "/api/sponsors/free-search?q=acme", ip);
    expect(first.status).toBe(200);

    const blocked = await get(app, "/api/sponsors/free-search?q=acme", ip);
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({
      message: expect.any(String),
    });
    // Retry guidance must be present (either convention accepted)
    expect(
      "retry-after" in blocked.headers || "ratelimit-reset" in blocked.headers,
    ).toBe(true);
  });

  it("scopes the quota per IP — a different IP still gets 200", async () => {
    const app = buildApp();

    const a = await get(app, "/api/sponsors/free-search?q=acme", "10.10.0.3");
    expect(a.status).toBe(200);

    const b = await get(app, "/api/sponsors/free-search?q=acme", "10.10.0.4");
    expect(b.status).toBe(200);
  });

  it("shares ONE daily bucket with historical-search", async () => {
    const app = buildApp();
    const ip = "10.10.0.5";

    const first = await get(app, "/api/sponsors/free-search?q=acme", ip);
    expect(first.status).toBe(200);

    // Same IP, other endpoint in the shared bucket → also 429
    const blocked = await get(app, "/api/sponsors/historical-search?q=acme", ip);
    expect(blocked.status).toBe(429);
  });

  it("does not burn the daily quota on validation 400s", async () => {
    const app = buildApp();
    const ip = "10.10.0.6";

    const invalid = await get(app, "/api/sponsors/free-search?q=ab", ip);
    expect(invalid.status).toBe(400);

    // The 400 must not have counted (skipFailedRequests) — real query works
    const ok = await get(app, "/api/sponsors/free-search?q=acme", ip);
    expect(ok.status).toBe(200);

    // …and the quota is now spent
    const blocked = await get(app, "/api/sponsors/free-search?q=acme", ip);
    expect(blocked.status).toBe(429);
  });

  it("advertises a ~24h window (RateLimit-Reset), not a 60s one", async () => {
    const app = buildApp();
    const res = await get(app, "/api/sponsors/free-search?q=acme", "10.10.0.7");

    expect(res.status).toBe(200);
    const resetSec = Number(res.headers["ratelimit-reset"]);
    expect(Number.isFinite(resetSec)).toBe(true);
    // Daily window: reset is hours away. A per-minute limiter would be ≤ 60.
    expect(resetSec).toBeGreaterThan(60 * 60);
    expect(resetSec).toBeLessThanOrEqual(24 * 60 * 60);
  });
});
