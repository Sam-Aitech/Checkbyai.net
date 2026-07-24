import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { registerSponsorPageRoutes } from "../sponsorPages";

const dbState = {
  selectRows: [] as any[],
  capturedOrderBy: null as any,
  capturedWhere: null as any,
};

vi.mock("../../db", () => {
  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn((whereClause: any) => {
          dbState.capturedWhere = whereClause;
          return {
            orderBy: vi.fn((orderByClause: any) => {
              dbState.capturedOrderBy = orderByClause;
              return {
                limit: vi.fn(() => Promise.resolve(dbState.selectRows)),
              };
            }),
          };
        }),
      })),
    })),
    execute: vi.fn(() => Promise.resolve({ rows: [] })),
  };
  return { db };
});

vi.mock("../../utils/redisClient", () => ({
  cacheGet: vi.fn(() => Promise.resolve(null)),
  cacheSet: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("../../utils/appUrl", () => ({
  getAppUrl: () => "http://localhost:3000",
}));

vi.mock("../../utils/sponsorSearch", () => ({
  ensureIndexReady: vi.fn(() => Promise.resolve()),
  getIndexData: vi.fn(() => []),
  getIndexVersion: vi.fn(() => 1),
}));

describe("sponsorPages routes", () => {
  let app: express.Express;

  beforeEach(() => {
    dbState.selectRows = [];
    dbState.capturedOrderBy = null;
    dbState.capturedWhere = null;
    vi.clearAllMocks();

    app = express();
    app.use(express.json());
    registerSponsorPageRoutes(app);
  });

  describe("GET /api/sponsors/recently-revoked", () => {
    it("fetches recently revoked sponsors sorted with NULLS LAST", async () => {
      dbState.selectRows = [
        {
          id: 10,
          currentName: "Revoked Corp A",
          townCity: "London",
          route: "Skilled Worker",
          removedAt: "2026-07-20T00:00:00.000Z",
        },
        {
          id: 5,
          currentName: "Revoked Corp B",
          townCity: "Manchester",
          route: "Skilled Worker",
          removedAt: "2026-07-19T00:00:00.000Z",
        },
      ];

      const res = await request(app).get("/api/sponsors/recently-revoked");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].currentName).toBe("Revoked Corp A");

      // Verify sql query order by clause contains DESC NULLS LAST
      expect(dbState.capturedOrderBy).toBeDefined();
      const sqlText = String(dbState.capturedOrderBy?.queryChunks?.map((c: any) => c?.value ?? String(c)).join(" ") ?? dbState.capturedOrderBy);
      expect(sqlText).toContain("DESC NULLS LAST");
    });
  });
});
