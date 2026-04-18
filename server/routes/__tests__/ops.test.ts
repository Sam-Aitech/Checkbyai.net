import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbState = {
  selectQueue: [] as any[][],
  inserted: [] as any[],
  updates: [] as any[],
  updateReturning: [] as any[][],
};

vi.mock("../../db", () => {
  const select = vi.fn(() => {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: async () => dbState.selectQueue.shift() ?? [],
    };
    return chain;
  });

  const insert = vi.fn(() => {
    const chain: any = {
      values: (payload: any) => {
        dbState.inserted.push(payload);
        return {
          returning: async () => [{ id: dbState.inserted.length }],
        };
      },
    };
    return chain;
  });

  const update = vi.fn(() => {
    const chain: any = {
      set: (payload: any) => {
        dbState.updates.push(payload);
        return {
          where: (_cond?: any) => {
            const returning = async () => dbState.updateReturning.shift() ?? [];
            return Object.assign(Promise.resolve<undefined>(undefined), { returning });
          },
        };
      },
    };
    return chain;
  });

  const execute = vi.fn(async () => ({ rows: [] }));

  const db = {
    select,
    insert,
    update,
    execute,
    transaction: async (cb: any) => {
      const tx = { select, insert, update, execute };
      return cb(tx);
    },
  };

  return { db };
});

vi.mock("../../middleware/roleGuard", () => ({
  requireRole: (minimum: "admin" | "analyst") => (req: any, res: any, next: any) => {
    const role = String(req.headers["x-role"] ?? "");
    const userId = String(req.headers["x-user-id"] ?? "u-test");
    if (!role) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (minimum === "admin" && !["admin", "owner"].includes(role)) {
      return res.status(403).json({ message: "Insufficient permissions", required: "admin" });
    }

    if (minimum === "analyst" && !["analyst", "admin", "owner"].includes(role)) {
      return res.status(403).json({ message: "Insufficient permissions", required: "analyst" });
    }

    req.user = { id: userId, role };
    next();
  },
}));

vi.mock("../../middleware/rateLimiter", () => ({
  opsTriggerLimiter: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../../utils/callbackSigner", () => ({
  isSafeCallbackUrl: async (url: string) => !url.includes("localhost"),
  signPayload: (_payload: string, _secret: string) => "sha256=test",
}));

vi.mock("../../utils/jobTelemetry", () => ({
  generateCorrelationId: vi.fn(() => "corr-test-1"),
  startJobRun: vi.fn(() => ({ correlationId: "corr-test-1", startedAt: new Date().toISOString() })),
  finishJobRun: vi.fn(() => undefined),
  getAllJobHealthSnapshots: vi.fn(() => [] as any[]),
}));

vi.mock("../../utils/sponsorMonitorJob", () => ({
  runSponsorMonitorJob: async () => ({ success: true, recordsProcessed: 0, changes: {}, notificationsSent: 0, notificationsSkipped: 0, notificationsFailed: 0 }),
}));
vi.mock("../../utils/jobAlertJob", () => ({ runJobAlertJob: async () => undefined }));
vi.mock("../../utils/enrichmentWorker", () => ({
  seedEnrichmentQueue: async () => ({ inserted: 0 }),
  runEnrichmentBatch: async () => ({ processed: 0, errors: 0 }),
}));
vi.mock("../../services/notificationEngine", () => ({ processQueuedEngineEvents: async () => undefined }));
vi.mock("../../utils/shadowMode", () => ({
  runShadowSnapshot: async (jobName: string) => ({
    jobName,
    result: "success",
    metrics: { recordsProcessed: 10, durationMs: 1000 },
    notes: ["test"],
  }),
  getLatestProductionBaseline: async () => ({
    correlationId: "corr-prod-1",
    result: "success",
    durationMs: 1200,
  }),
  computeParityReport: () => ({
    parityScore: 0.95,
    outcomeMatch: true,
    durationDriftMs: 200,
    recordsDrift: 0,
    changeDriftJson: { test: true },
    driftSummary: "ok",
  }),
}));

vi.mock("../../utils/incidentManager", () => ({
  evaluateSeverity: vi.fn(() => null as any),
  createIncidentTicket: vi.fn(async () => 1),
  tryAutoRemediate: vi.fn(async () => "corr-remediate-1"),
}));

import { registerOpsRoutes } from "../ops";
import { getAllJobHealthSnapshots } from "../../utils/jobTelemetry";
import { evaluateSeverity, createIncidentTicket } from "../../utils/incidentManager";

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

describe("ops routes", () => {
  beforeEach(() => {
    dbState.selectQueue = [];
    dbState.inserted = [];
    dbState.updates = [];
    dbState.updateReturning = [];
    process.env.CALLBACK_SIGNING_SECRET = "test-secret";
    vi.mocked(getAllJobHealthSnapshots).mockReturnValue([]);
    vi.mocked(evaluateSeverity).mockReturnValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for unsupported job names", async () => {
    const { server, baseUrl } = await startTestServer();
    try {
      const response = await fetch(`${baseUrl}/api/ops/jobs/not-real/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-role": "admin" },
        body: JSON.stringify({ idempotencyKey: "550e8400-e29b-41d4-a716-446655440000" }),
      });
      expect(response.status).toBe(400);
    } finally {
      server.close();
    }
  });

  it("enforces admin auth on trigger endpoint", async () => {
    const { server, baseUrl } = await startTestServer();
    try {
      const response = await fetch(`${baseUrl}/api/ops/jobs/jobAlertJob/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-role": "viewer" },
        body: JSON.stringify({ idempotencyKey: "550e8400-e29b-41d4-a716-446655440000" }),
      });
      expect(response.status).toBe(403);
    } finally {
      server.close();
    }
  });

  it("returns 409 for replay in 24h window", async () => {
    dbState.selectQueue.push([
      {
        triggerId: "11111111-1111-4111-8111-111111111111",
        correlationId: "corr-existing",
      },
    ]);

    const { server, baseUrl } = await startTestServer();
    try {
      const response = await fetch(`${baseUrl}/api/ops/jobs/jobAlertJob/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-role": "admin", "x-user-id": "u-1" },
        body: JSON.stringify({ idempotencyKey: "550e8400-e29b-41d4-a716-446655440000" }),
      });

      expect(response.status).toBe(409);
      const json = await response.json();
      expect(json.status).toBe("already_accepted");
      expect(json.triggerId).toBe("11111111-1111-4111-8111-111111111111");
    } finally {
      server.close();
    }
  });

  it("returns 202 and persists callback pending state for accepted trigger", async () => {
    dbState.selectQueue.push([]);

    const { server, baseUrl } = await startTestServer();
    try {
      const response = await fetch(`${baseUrl}/api/ops/jobs/jobAlertJob/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-role": "admin", "x-user-id": "u-2" },
        body: JSON.stringify({
          idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
          callbackUrl: "https://8.8.8.8/hook",
          reason: "manual run",
        }),
      });

      expect(response.status).toBe(202);
      const payload = dbState.inserted[0];
      expect(payload.jobName).toBe("jobAlertJob");
      expect(payload.callbackStatus).toBe("pending");
      expect(payload.callbackAttempts).toBe(0);
    } finally {
      server.close();
    }
  });

  it("returns 400 for invalid triggerId in status endpoint", async () => {
    const { server, baseUrl } = await startTestServer();
    try {
      const response = await fetch(`${baseUrl}/api/ops/jobs/jobAlertJob/status/not-a-uuid`, {
        headers: { "x-role": "analyst" },
      });
      expect(response.status).toBe(400);
    } finally {
      server.close();
    }
  });

  it("accepts a shadow run trigger for admin users", async () => {
    const { server, baseUrl } = await startTestServer();
    try {
      const response = await fetch(`${baseUrl}/api/ops/jobs/jobAlertJob/shadow`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-role": "admin", "x-user-id": "u-3" },
      });

      expect(response.status).toBe(202);
      const json = await response.json();
      expect(json.status).toBe("accepted");
      expect(json.runMode).toBe("shadow");
      expect(json.parityScore).toBe(0.95);
    } finally {
      server.close();
    }
  });

  it("rejects invalid parity report id", async () => {
    const { server, baseUrl } = await startTestServer();
    try {
      const response = await fetch(`${baseUrl}/api/ops/parity-reports/not-a-number`, {
        headers: { "x-role": "analyst" },
      });
      expect(response.status).toBe(400);
    } finally {
      server.close();
    }
  });

  // ── Status endpoint ─────────────────────────────────────────────────────────

  it("returns 200 with trigger data when status record exists", async () => {
    dbState.selectQueue.push([{
      triggerId: "550e8400-e29b-41d4-a716-446655440001",
      correlationId: "corr-test-1",
      jobName: "jobAlertJob",
      status: "success",
      triggeredBy: "u-1",
      triggeredAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 1234,
      failureReason: null,
    }]);
    const { server, baseUrl } = await startTestServer();
    try {
      const response = await fetch(
        `${baseUrl}/api/ops/jobs/jobAlertJob/status/550e8400-e29b-41d4-a716-446655440001`,
        { headers: { "x-role": "analyst" } },
      );
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.triggerId).toBe("550e8400-e29b-41d4-a716-446655440001");
      expect(json.status).toBe("success");
    } finally {
      server.close();
    }
  });

  it("returns 404 when trigger record not found in status endpoint", async () => {
    dbState.selectQueue.push([]);
    const { server, baseUrl } = await startTestServer();
    try {
      const response = await fetch(
        `${baseUrl}/api/ops/jobs/jobAlertJob/status/550e8400-e29b-41d4-a716-446655440003`,
        { headers: { "x-role": "analyst" } },
      );
      expect(response.status).toBe(404);
    } finally {
      server.close();
    }
  });

  it("returns 400 for unsafe localhost callbackUrl", async () => {
    const { server, baseUrl } = await startTestServer();
    try {
      const response = await fetch(`${baseUrl}/api/ops/jobs/jobAlertJob/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-role": "admin", "x-user-id": "u-1" },
        body: JSON.stringify({
          idempotencyKey: "550e8400-e29b-41d4-a716-446655440002",
          callbackUrl: "http://localhost:9999/hook",
        }),
      });
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.message).toMatch(/safe/i);
    } finally {
      server.close();
    }
  });

  // ── Incident routes ─────────────────────────────────────────────────────────

  it("POST /incidents/evaluate returns empty result when no snapshots", async () => {
    const { server, baseUrl } = await startTestServer();
    try {
      const response = await fetch(`${baseUrl}/api/ops/incidents/evaluate`, {
        method: "POST",
        headers: { "x-role": "admin" },
      });
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.evaluated).toBe(0);
      expect(json.created).toEqual([]);
    } finally {
      server.close();
    }
  });

  it("POST /incidents/evaluate requires admin role", async () => {
    const { server, baseUrl } = await startTestServer();
    try {
      const response = await fetch(`${baseUrl}/api/ops/incidents/evaluate`, {
        method: "POST",
        headers: { "x-role": "analyst" },
      });
      expect(response.status).toBe(403);
    } finally {
      server.close();
    }
  });

  it("POST /incidents/evaluate creates ticket for unhealthy snapshot", async () => {
    const snapshot = {
      jobName: "jobAlertJob",
      running: false,
      lastSuccessAt: null,
      lastFailureAt: new Date().toISOString(),
      lastRunMode: null,
      staleByMinutes: null,
    };
    vi.mocked(getAllJobHealthSnapshots).mockReturnValueOnce([snapshot] as any);
    vi.mocked(evaluateSeverity).mockReturnValueOnce("P1" as any);
    vi.mocked(createIncidentTicket).mockResolvedValueOnce(42);

    const { server, baseUrl } = await startTestServer();
    try {
      const response = await fetch(`${baseUrl}/api/ops/incidents/evaluate`, {
        method: "POST",
        headers: { "x-role": "admin" },
      });
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.evaluated).toBe(1);
      expect(json.created).toHaveLength(1);
      expect(json.created[0].jobName).toBe("jobAlertJob");
      expect(json.created[0].severity).toBe("P1");
      expect(json.created[0].incidentId).toBe(42);
    } finally {
      server.close();
    }
  });

  it("GET /incidents returns list with count", async () => {
    dbState.selectQueue.push([
      { id: 1, jobName: "jobAlertJob", severity: "P1", status: "open", title: "[P1] jobAlertJob health degraded", context: {}, createdAt: new Date().toISOString() },
    ]);
    const { server, baseUrl } = await startTestServer();
    try {
      const response = await fetch(`${baseUrl}/api/ops/incidents`, {
        headers: { "x-role": "analyst" },
      });
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.count).toBe(1);
      expect(json.items[0].id).toBe(1);
    } finally {
      server.close();
    }
  });

  it("GET /incidents requires analyst role", async () => {
    const { server, baseUrl } = await startTestServer();
    try {
      const response = await fetch(`${baseUrl}/api/ops/incidents`, {
        headers: { "x-role": "viewer" },
      });
      expect(response.status).toBe(403);
    } finally {
      server.close();
    }
  });

  it("GET /incidents/:id returns 400 for invalid id", async () => {
    const { server, baseUrl } = await startTestServer();
    try {
      const response = await fetch(`${baseUrl}/api/ops/incidents/not-a-number`, {
        headers: { "x-role": "analyst" },
      });
      expect(response.status).toBe(400);
    } finally {
      server.close();
    }
  });

  it("GET /incidents/:id returns 404 when not found", async () => {
    dbState.selectQueue.push([]);
    const { server, baseUrl } = await startTestServer();
    try {
      const response = await fetch(`${baseUrl}/api/ops/incidents/9999`, {
        headers: { "x-role": "analyst" },
      });
      expect(response.status).toBe(404);
    } finally {
      server.close();
    }
  });

  it("GET /incidents/:id returns 200 with incident data", async () => {
    dbState.selectQueue.push([
      { id: 5, jobName: "enrichmentBatch", severity: "P0", status: "open", title: "[P0] enrichmentBatch health degraded (stale 7h)", context: {} },
    ]);
    const { server, baseUrl } = await startTestServer();
    try {
      const response = await fetch(`${baseUrl}/api/ops/incidents/5`, {
        headers: { "x-role": "analyst" },
      });
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.id).toBe(5);
      expect(json.severity).toBe("P0");
    } finally {
      server.close();
    }
  });

  it("POST /incidents/:id/resolve marks incident as resolved", async () => {
    dbState.updateReturning.push([
      { id: 3, status: "resolved", resolvedBy: "u-admin", resolvedAt: new Date().toISOString() },
    ]);
    const { server, baseUrl } = await startTestServer();
    try {
      const response = await fetch(`${baseUrl}/api/ops/incidents/3/resolve`, {
        method: "POST",
        headers: { "x-role": "admin", "x-user-id": "u-admin" },
      });
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.resolved).toBe(true);
      expect(json.incident.status).toBe("resolved");
    } finally {
      server.close();
    }
  });

  it("POST /incidents/:id/resolve returns 404 when incident not found", async () => {
    dbState.updateReturning.push([]);
    const { server, baseUrl } = await startTestServer();
    try {
      const response = await fetch(`${baseUrl}/api/ops/incidents/9999/resolve`, {
        method: "POST",
        headers: { "x-role": "admin", "x-user-id": "u-admin" },
      });
      expect(response.status).toBe(404);
    } finally {
      server.close();
    }
  });

  it("POST /incidents/:id/resolve requires admin role", async () => {
    const { server, baseUrl } = await startTestServer();
    try {
      const response = await fetch(`${baseUrl}/api/ops/incidents/3/resolve`, {
        method: "POST",
        headers: { "x-role": "analyst" },
      });
      expect(response.status).toBe(403);
    } finally {
      server.close();
    }
  });

  // ── Rollout status endpoint ─────────────────────────────────────────────────

  it("GET /rollout/status returns 200 with aggregated state for analyst", async () => {
    dbState.selectQueue.push([
      { id: 1, severity: "P0", status: "open", jobName: "sponsorMonitorJob", title: "[P0] sponsorMonitorJob health degraded" },
    ]);
    const { server, baseUrl } = await startTestServer();
    try {
      const response = await fetch(`${baseUrl}/api/ops/rollout/status`, {
        headers: { "x-role": "analyst" },
      });
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.phase).toBe("phase-8-hypercare");
      expect(json.incidents.openCount).toBe(1);
      expect(json.incidents.p0Open).toBe(1);
      expect(json.cutover).toBeDefined();
      expect(json.health).toBeDefined();
    } finally {
      server.close();
    }
  });

  it("GET /rollout/status requires analyst role", async () => {
    const { server, baseUrl } = await startTestServer();
    try {
      const response = await fetch(`${baseUrl}/api/ops/rollout/status`, {
        headers: { "x-role": "viewer" },
      });
      expect(response.status).toBe(403);
    } finally {
      server.close();
    }
  });
});
