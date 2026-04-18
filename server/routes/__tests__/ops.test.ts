import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbState = {
  selectQueue: [] as any[][],
  inserted: [] as any[],
  updates: [] as any[],
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
      values: async (payload: any) => {
        dbState.inserted.push(payload);
      },
    };
    return chain;
  });

  const update = vi.fn(() => {
    const chain: any = {
      set: (payload: any) => {
        dbState.updates.push(payload);
        return {
          where: async () => undefined,
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
  generateCorrelationId: () => "corr-test-1",
  startJobRun: () => ({ correlationId: "corr-test-1", startedAt: new Date().toISOString() }),
  finishJobRun: () => undefined,
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

describe("ops routes", () => {
  beforeEach(() => {
    dbState.selectQueue = [];
    dbState.inserted = [];
    dbState.updates = [];
    process.env.CALLBACK_SIGNING_SECRET = "test-secret";
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
});
