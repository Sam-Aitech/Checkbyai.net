import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const redisIndex = new Map<string, string>();

const queueState = {
  jobs: new Map<string, any>(),
  available: true,
};

const storageState = {
  user: null as any,
};

const storeCalls = {
  put: [] as string[],
  deleted: [] as string[],
};

const analysisSpy = vi.fn();

vi.mock("../../db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    execute: vi.fn(async () => ({ rows: [] })),
    transaction: vi.fn(async (cb: any) => cb({})),
  },
}));

vi.mock("../../auth", () => ({
  isAuthenticated: (req: any, _res: any, next: any) => {
    req.user = { id: "u-test" };
    req.isAuthenticated = () => true;
    next();
  },
}));

vi.mock("../../middleware/rateLimiter", () => ({
  verifyLimiter: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../../storage", () => ({
  storage: {
    getUser: async () => storageState.user,
    getVerificationByReceiptId: async () => null,
    getVerificationsByUserId: async () => [],
    checkDailyLimit: async () => true,
    getAdminFlaggedVerificationByHash: async () => null,
    getIpVerification: async () => null,
  },
}));

vi.mock("../../services/documentStore", () => ({
  getDocumentStore: () => ({
    put: async (key: string) => {
      storeCalls.put.push(key);
    },
    get: async () => Buffer.from("%PDF-1.4 test"),
    delete: async (key: string) => {
      storeCalls.deleted.push(key);
    },
  }),
  buildDocumentKey: (receiptId: string, hash: string) => `verify/${receiptId}/${hash}.pdf`,
}));

vi.mock("../../services/verificationAnalysis", () => ({
  runVerificationAnalysis: (...args: any[]) => analysisSpy(...args),
}));

vi.mock("../../utils/redisClient", () => ({
  getRedis: () => ({
    get: async (key: string) => redisIndex.get(key) ?? null,
    set: async (key: string, value: string) => {
      redisIndex.set(key, value);
      return "OK";
    },
  }),
}));

vi.mock("../../services/jobQueue", () => ({
  VERIFICATION_JOB: "verification-job",
  isQueueAvailable: () => queueState.available,
  getVerificationQueue: () =>
    queueState.available
      ? { getJob: async (id: string) => queueState.jobs.get(id) ?? null }
      : null,
}));

import { registerVerificationRoutes } from "../verification";
import { errorHandler } from "../../lib/errorHandler";

async function startTestServer() {
  const app = express();
  app.use(express.json());
  registerVerificationRoutes(app);
  app.use(errorHandler);
  const server = app.listen(0);
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("Failed to start test server");
  return { server, baseUrl: `http://127.0.0.1:${addr.port}` };
}

describe("verify job status mapping", () => {
  beforeEach(() => {
    redisIndex.clear();
    queueState.jobs.clear();
    queueState.available = true;
    storageState.user = null;
    storeCalls.put.length = 0;
    storeCalls.deleted.length = 0;
    analysisSpy.mockReset();
    delete process.env.ALLOW_SYNC_VERIFY;
  });

  it("returns the evicted receipt when the queue job is gone but indexed", async () => {
    redisIndex.set(
      "verify:job:job-1",
      JSON.stringify({ receiptId: "CBA-AAAA-1111", userId: "u-test", documentHash: "hash-a" }),
    );
    const { server, baseUrl } = await startTestServer();
    try {
      const res = await fetch(`${baseUrl}/api/verify/job/job-1`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.status).toBe("evicted");
      expect(body.data.receiptId).toBe("CBA-AAAA-1111");
      expect(body.data.receiptUrl).toBe("/api/receipt/CBA-AAAA-1111");
    } finally {
      server.close();
    }
  });

  it("keeps two uploads isolated after the first job is evicted", async () => {
    redisIndex.set(
      "verify:job:job-1",
      JSON.stringify({ receiptId: "CBA-AAAA-1111", userId: "u-test", documentHash: "same-hash" }),
    );
    redisIndex.set(
      "verify:job:job-2",
      JSON.stringify({ receiptId: "CBA-BBBB-2222", userId: "u-test", documentHash: "same-hash" }),
    );
    queueState.jobs.set("job-2", {
      id: "job-2",
      progress: 100,
      getState: async () => "completed",
      returnvalue: { receiptId: "CBA-BBBB-2222", result: "genuine", confidence: 92 },
    });

    const { server, baseUrl } = await startTestServer();
    try {
      const first = await (await fetch(`${baseUrl}/api/verify/job/job-1`)).json();
      const second = await (await fetch(`${baseUrl}/api/verify/job/job-2`)).json();
      expect(first.data.status).toBe("evicted");
      expect(first.data.receiptId).toBe("CBA-AAAA-1111");
      expect(second.data.status).toBe("completed");
      expect(second.data.result.receiptId).toBe("CBA-BBBB-2222");
      expect(first.data.receiptId).not.toBe(second.data.result.receiptId);
    } finally {
      server.close();
    }
  });

  it("returns 404 for unknown job ids with no index entry", async () => {
    const { server, baseUrl } = await startTestServer();
    try {
      const res = await fetch(`${baseUrl}/api/verify/job/nope`);
      expect(res.status).toBe(404);
    } finally {
      server.close();
    }
  });
});

describe("verify failure mode (Redis down)", () => {
  beforeEach(() => {
    redisIndex.clear();
    queueState.jobs.clear();
    queueState.available = false;
    storageState.user = {
      id: "u-test",
      role: "user",
      cosCheckSubscription: true,
      subscriptionStatus: "pro",
      ipExempt: true,
    };
    storeCalls.put.length = 0;
    storeCalls.deleted.length = 0;
    analysisSpy.mockReset();
    delete process.env.ALLOW_SYNC_VERIFY;
  });

  async function startApp() {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res: any, next: any) => {
      req.isAuthenticated = () => true;
      req.user = { id: "u-test" };
      next();
    });
    registerVerificationRoutes(app);
    app.use(errorHandler);
    return app;
  }

  it("rejects with 503 without running analysis and leaves no stored document", async () => {
    const app = await startApp();
    const res = await request(app)
      .post("/api/verify")
      .attach("file", Buffer.from("%PDF-1.4 fake-bytes"), {
        filename: "test.pdf",
        contentType: "application/pdf",
      });
    expect(res.status).toBe(503);
    expect(analysisSpy).not.toHaveBeenCalled();
    expect(storeCalls.put.length).toBe(1);
    expect(storeCalls.deleted.length).toBe(1);
    expect(storeCalls.deleted[0]).toBe(storeCalls.put[0]);
  });

  it("rejects ?sync=1 with 400 when sync mode is not enabled", async () => {
    const app = await startApp();
    const res = await request(app)
      .post("/api/verify?sync=1")
      .attach("file", Buffer.from("%PDF-1.4 fake-bytes"), {
        filename: "test.pdf",
        contentType: "application/pdf",
      });
    expect(res.status).toBe(400);
    expect(analysisSpy).not.toHaveBeenCalled();
  });
});
