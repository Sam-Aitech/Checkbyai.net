import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db", () => {
  const db = {
    select: vi.fn(() => {
      throw new Error("DB connection refused");
    }),
    insert: vi.fn(() => {
      throw new Error("DB connection refused");
    }),
    update: vi.fn(() => {
      throw new Error("DB connection refused");
    }),
    execute: vi.fn(async () => {
      throw new Error("DB connection refused");
    }),
    transaction: vi.fn(async (_cb: any) => {
      throw new Error("DB connection refused");
    }),
  };
  return { db };
});

vi.mock("../../middleware/roleGuard", () => ({
  requireRole: (_minimum: "admin" | "analyst") => (req: any, res: any, next: any) => {
    const role = String(req.headers["x-role"] ?? "");
    if (!role) return res.status(401).json({ message: "Unauthorized" });
    req.user = { id: "u-test", role };
    next();
  },
}));

vi.mock("../../middleware/rateLimiter", () => ({
  opsTriggerLimiter: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../../utils/callbackSigner", () => ({
  isSafeCallbackUrl: async (_url: string) => true,
  signPayload: (_payload: string, _secret: string) => "sha256=test",
}));

vi.mock("../../utils/jobTelemetry", () => ({
  generateCorrelationId: vi.fn(() => "corr-fault-1"),
  startJobRun: vi.fn(() => ({ correlationId: "corr-fault-1", startedAt: new Date().toISOString() })),
  finishJobRun: vi.fn(() => undefined),
  getAllJobHealthSnapshots: vi.fn(() => []),
}));

vi.mock("../../utils/sponsorMonitorJob", () => ({
  runSponsorMonitorJob: async () => ({ success: true, recordsProcessed: 0, changes: {}, notificationsSent: 0, notificationsSkipped: 0, notificationsFailed: 0 }),
}));
vi.mock("../../utils/jobAlertJob", () => ({ runJobAlertJob: async () => undefined }));
vi.mock("../../utils/enrichmentWorker", () => ({
  seedEnrichmentQueue: async () => ({ inserted: 0 }),
  runEnrichmentBatch: async () => ({ processed: 0, errors: 0 }),
}));
vi.mock("../../services/notificationEngine", () => ({
  processQueuedEngineEvents: async () => undefined,
}));
vi.mock("../../utils/shadowMode", () => ({
  runShadowSnapshot: async () => ({ jobName: "test", result: "success", metrics: {}, notes: [] }),
  getLatestProductionBaseline: async () => null,
  computeParityReport: () => ({ parityScore: 1, outcomeMatch: true, durationDriftMs: 0, recordsDrift: 0, changeDriftJson: {}, driftSummary: "ok" }),
}));
vi.mock("../../utils/incidentManager", () => ({
  evaluateSeverity: vi.fn(() => null),
  createIncidentTicket: vi.fn(async () => 1),
  tryAutoRemediate: vi.fn(async () => null),
}));

import { registerOpsRoutes } from "../ops";

async function startTestServer() {
  const app = express();
  app.use(express.json());
  registerOpsRoutes(app);
  const server = app.listen(0);
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("Failed to start test server");
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  return { server, baseUrl };
}

describe("fault injection: ops routes return 500 on DB failure", () => {
  beforeEach(() => {
    process.env.CALLBACK_SIGNING_SECRET = "test-secret";
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("POST trigger → DB transaction failure → 500", async () => {
    const { server, baseUrl } = await startTestServer();
    try {
      const response = await fetch(`${baseUrl}/api/ops/jobs/jobAlertJob/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-role": "admin", "x-user-id": "u-test" },
        body: JSON.stringify({ idempotencyKey: "550e8400-e29b-41d4-a716-446655440010" }),
      });
      expect(response.status).toBe(500);
    } finally {
      server.close();
    }
  });

  it("GET /incidents → DB select failure → 500", async () => {
    const { server, baseUrl } = await startTestServer();
    try {
      const response = await fetch(`${baseUrl}/api/ops/incidents`, {
        headers: { "x-role": "analyst" },
      });
      expect(response.status).toBe(500);
    } finally {
      server.close();
    }
  });

  it("GET /incidents/:id → DB select failure → 500", async () => {
    const { server, baseUrl } = await startTestServer();
    try {
      const response = await fetch(`${baseUrl}/api/ops/incidents/1`, {
        headers: { "x-role": "analyst" },
      });
      expect(response.status).toBe(500);
    } finally {
      server.close();
    }
  });

  it("POST /incidents/:id/resolve → DB update failure → 500", async () => {
    const { server, baseUrl } = await startTestServer();
    try {
      const response = await fetch(`${baseUrl}/api/ops/incidents/1/resolve`, {
        method: "POST",
        headers: { "x-role": "admin", "x-user-id": "u-test" },
      });
      expect(response.status).toBe(500);
    } finally {
      server.close();
    }
  });

  it("GET /jobs/:jobName/status/:triggerId → DB select failure → 500", async () => {
    const { server, baseUrl } = await startTestServer();
    try {
      const response = await fetch(
        `${baseUrl}/api/ops/jobs/jobAlertJob/status/550e8400-e29b-41d4-a716-446655440011`,
        { headers: { "x-role": "analyst" } },
      );
      expect(response.status).toBe(500);
    } finally {
      server.close();
    }
  });

  it("GET /rollout/status → DB select failure → 500", async () => {
    const { server, baseUrl } = await startTestServer();
    try {
      const response = await fetch(`${baseUrl}/api/ops/rollout/status`, {
        headers: { "x-role": "analyst" },
      });
      expect(response.status).toBe(500);
    } finally {
      server.close();
    }
  });
});
