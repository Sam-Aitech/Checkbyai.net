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

describe("Route-specific SSR bodies (/sponsors, /dashboard, /what-to-do-fake-cos)", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    registerSeoRoutes(app);
  });

  function htmlRequest(url: string) {
    return request(app).get(url).set("Accept", "text/html");
  }

  it("serves Sponsor Directory intent on /sponsors, not homepage/CoS copy", async () => {
    const res = await htmlRequest("/sponsors");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.text).toContain("UK Licensed Sponsor Register");
    expect(res.text).toContain("Search and browse the UK Home Office Register of Licensed Sponsors");
  });

  it("serves CoS verification intent on /dashboard without Sponsor Monitor copy", async () => {
    const res = await htmlRequest("/dashboard");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Technical risk analysis of your Certificate of Sponsorship");
    expect(res.text).toContain("Certificate of Sponsorship Risk Check");
    expect(res.text).toContain("Not a genuineness verdict");
  });

  it("serves the recovery guide intent on /what-to-do-fake-cos", async () => {
    const res = await htmlRequest("/what-to-do-fake-cos");
    expect(res.status).toBe(200);
    expect(res.text).toContain("What To Do If You've Bought a Fake Certificate");
  });

  it("skips SSR for non-HTML Accept headers", async () => {
    const res = await request(app).get("/sponsors").set("Accept", "application/json");
    expect(res.status).toBe(404);
  });

  it("serves static guide content for extensionless /guides/* URLs", async () => {
    for (const slug of [
      "/guides/how-to-check-cos-genuine",
      "/guides/cos-scams-red-flags",
      "/guides/employers-guide-fake-cos",
      "/guides/what-to-do-fake-cos",
    ]) {
      const res = await request(app).get(slug).set("Accept", "text/html");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/html");
      expect(res.text).not.toContain("Not Found");
    }
  });

  it("skips guide serving for non-HTML Accept headers", async () => {
    const res = await request(app).get("/guides/cos-scams-red-flags").set("Accept", "application/json");
    expect(res.status).toBe(404);
  });
});

describe("Sitemap + llms.txt safety", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    registerSeoRoutes(app);
  });

  it("does not advertise dead /guides/*, /single-check, /privacy or /data-security routes", async () => {
    const res = await request(app).get("/sitemap-core.xml");
    expect(res.status).toBe(200);
    expect(res.text).not.toContain("/guides/");
    expect(res.text).not.toContain("/single-check");
    expect(res.text).not.toContain("<loc>https://checkbyai.net/privacy</loc>");
    expect(res.text).not.toContain("<loc>https://checkbyai.net/data-security</loc>");
    expect(res.text).toContain("/sponsors");
    expect(res.text).toContain("/dashboard");
  });

  it("uses neutral revocation wording and digest timing in llms.txt", async () => {
    const res = await request(app).get("/llms-full.txt");
    expect(res.status).toBe(200);
    expect(res.text).toContain("A sponsor licence change can affect sponsored workers");
    expect(res.text).toContain("GOV.UK");
    expect(res.text).not.toContain("60 days to find");
    expect(res.text).not.toContain("within minutes of detection");
    expect(res.text).not.toContain("Real-time");
  });
});
