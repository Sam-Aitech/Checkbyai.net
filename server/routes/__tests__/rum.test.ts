import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../middleware/rateLimiter", () => ({
  verifyLimiter: (_req: any, _res: any, next: any) => next(),
}));

import { registerRumRoutes } from "../rum";
import { errorHandler } from "../../lib/errorHandler";
import { getPerfSnapshot, resetPerfMonitor } from "../../utils/perfMonitor";

function startApp() {
  const app = express();
  app.use(express.json());
  registerRumRoutes(app);
  app.use(errorHandler);
  return app;
}

describe("POST /api/rum", () => {
  it("accepts valid web-vital beacons and surfaces them in the perf snapshot", async () => {
    resetPerfMonitor();
    const app = startApp();
    const res = await request(app)
      .post("/api/rum")
      .send({ name: "LCP", value: 1234.5, rating: "good", url: "/sponsor-directory" });
    expect(res.status).toBe(200);
    expect(res.body.data.accepted).toBe(true);
    const snap = getPerfSnapshot() as any;
    expect(snap.rum.LCP.count).toBe(1);
    expect(snap.rum.LCP.p50).toBe(1234.5);
  });

  it("rejects invalid beacons without recording", async () => {
    resetPerfMonitor();
    const app = startApp();
    const res = await request(app)
      .post("/api/rum")
      .send({ name: "NOPE", value: -5 });
    expect(res.status).toBe(200);
    expect(res.body.data.accepted).toBe(false);
    const snap = getPerfSnapshot() as any;
    expect(snap.rum).toEqual({});
  });
});
