import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const state = vi.hoisted(() => ({ rows: [] as any[] }));

vi.mock("../../db", () => ({
  db: {
    execute: vi.fn(async () => {
      const rows = state.rows;
      state.rows = [];
      return { rows };
    }),
  },
}));
vi.mock("../../utils/redisClient", () => ({ getRedis: () => null, cacheGet: vi.fn(async () => null), cacheSet: vi.fn(async () => true) }));
vi.mock("../../utils/appUrl", () => ({ getAppUrl: () => "http://localhost:3000" }));
vi.mock("../../utils/sponsorSearch", () => ({
  ensureIndexReady: vi.fn(async () => undefined),
  getIndexData: vi.fn(() => []),
  getIndexVersion: vi.fn(() => 1),
}));

describe("GET /api/sponsors/export.csv", () => {
  let app: express.Express;

  beforeEach(async () => {
    const { registerSponsorPageRoutes } = await import("../sponsorPages");
    app = express();
    registerSponsorPageRoutes(app);
  });

  it("neutralises formula-looking cells and keeps legitimate rows intact", async () => {
    state.rows = [
      { id: 1, name: "=HYPERLINK(\"http://evil.example\",\"x\")", town: "+44 London", type_rating: "-Worker (A rating)", route: "@Skilled", status: "ACTIVE", granted_at: "2026-01-31T00:00:00Z" },
      { id: 2, name: "Acme, Ltd", town: "Leeds", type_rating: "Worker (A rating)", route: "Skilled Worker", status: "ACTIVE", granted_at: null },
    ];
    const res = await request(app).get("/api/sponsors/export.csv").buffer(true).parse((r, cb) => {
      let data = "";
      r.setEncoding("utf8");
      r.on("data", (c) => (data += c));
      r.on("end", () => cb(null, data));
    });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    const lines = (res.body as string).split("\r\n").filter(Boolean);
    expect(lines[1]).toBe(`"'=HYPERLINK(""http://evil.example"",""x"")",'+44 London,'-Worker (A rating),'@Skilled,ACTIVE,2026-01-31`);
    expect(lines[2]).toBe('"Acme, Ltd",Leeds,Worker (A rating),Skilled Worker,ACTIVE,');
    for (const line of lines.slice(1)) {
      for (const cell of line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)) {
        expect(cell.replace(/^"/, "")).not.toMatch(/^[=+\-@]/);
      }
    }
  });
});
