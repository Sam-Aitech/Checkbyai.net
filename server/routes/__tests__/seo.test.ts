import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { registerSeoRoutes } from "../seo";

const dbState = {
  sponsorRows: [] as any[],
  changeRows: [] as any[],
};

vi.mock("../../db", () => {
  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve(dbState.sponsorRows)),
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve(dbState.changeRows)),
          })),
        })),
      })),
    })),
  };
  return { db };
});

const cacheState = {
  cached: null as string | null,
};

vi.mock("../../utils/redisClient", () => ({
  cacheGet: vi.fn(() => Promise.resolve(cacheState.cached)),
  cacheSet: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("../../utils/appUrl", () => ({
  getAppUrl: () => "https://checkbyai.net",
}));

import { cacheGet, cacheSet } from "../../utils/redisClient";

function makeSponsor(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 42,
    fingerprint: "abc123",
    currentName: "Acme Care Ltd",
    townCity: "Leeds",
    route: "Skilled Worker",
    typeRating: "Worker (A rating)",
    status: "ACTIVE",
    grantedAt: new Date("2023-01-10"),
    removedAt: null,
    ...overrides,
  };
}

describe("GET /sponsor/:id/:slug (bot-visible SSR)", () => {
  let app: express.Express;

  beforeEach(() => {
    dbState.sponsorRows = [];
    dbState.changeRows = [];
    cacheState.cached = null;
    vi.clearAllMocks();

    app = express();
    registerSeoRoutes(app);
  });

  function botRequest(url: string) {
    return request(app).get(url).set("User-Agent", "Googlebot").set("Accept", "text/html");
  }

  it("serves the cached page verbatim on a cache hit, without querying the DB", async () => {
    cacheState.cached = "<html><body>cached sponsor page</body></html>";

    const res = await botRequest("/sponsor/42/acme-care-ltd");

    expect(res.status).toBe(200);
    expect(res.text).toBe(cacheState.cached);
    expect(cacheSet).not.toHaveBeenCalled();
  });

  it("renders sponsor content, escapes it into title/meta/JSON-LD, and caches the result on a cache miss", async () => {
    dbState.sponsorRows = [makeSponsor()];
    dbState.changeRows = [];

    const res = await botRequest("/sponsor/42/acme-care-ltd");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.text).toContain("Acme Care Ltd");
    expect(res.text).toContain("Active UK Sponsor Licence");
    expect(res.text).toContain('<script type="application/ld+json">');
    expect(cacheSet).toHaveBeenCalledTimes(1);
    expect(cacheSet).toHaveBeenCalledWith("sponsors:seopage:42", expect.stringContaining("Acme Care Ltd"), 21600);
  });

  it("escapes a script-breakout attempt in the sponsor name out of every JSON-LD block", async () => {
    dbState.sponsorRows = [makeSponsor({ currentName: 'Acme</script><script>alert(1)</script>' })];
    dbState.changeRows = [];

    const res = await botRequest("/sponsor/42/acme-care-ltd");

    expect(res.status).toBe(200);
    expect(res.text).not.toContain("</script><script>alert(1)");
    const blocks = [...res.text.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    for (const m of blocks) expect(() => JSON.parse(m[1])).not.toThrow();
  });

  it("falls through to next() (SPA) when the sponsor id doesn't exist in the DB", async () => {
    dbState.sponsorRows = [];

    const res = await botRequest("/sponsor/999999/nobody-ltd");

    // No route matches after next() with no sponsor route further down in
    // this isolated app, so Express's default 404 is the observable signal
    // that our handler did NOT render sponsor content.
    expect(res.status).toBe(404);
    expect(cacheGet).toHaveBeenCalledWith("sponsors:seopage:999999");
    expect(cacheSet).not.toHaveBeenCalled();
  });

  it("falls through to next() for a non-numeric id instead of querying the DB", async () => {
    const res = await botRequest("/sponsor/not-a-number/acme-care-ltd");
    expect(res.status).toBe(404);
    expect(cacheGet).not.toHaveBeenCalled();
  });

  it("skips SSR entirely for non-bot requests without an html Accept header", async () => {
    const res = await request(app).get("/sponsor/42/acme-care-ltd").set("Accept", "application/json");
    expect(res.status).toBe(404);
    expect(cacheGet).not.toHaveBeenCalled();
  });
});
