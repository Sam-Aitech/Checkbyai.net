import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

/**
 * Object-level authorization for paid submissions. The in-memory store below implements the
 * owner-scoped methods with the same semantics as the SQL (id AND userId), so these tests
 * exercise the route's decision to use them, and the observable responses.
 */

interface Row {
  id: number;
  userId: string | null;
  email: string;
  packageType: string;
  paymentStatus: string;
  reviewStatus: string;
  stripeSessionId: string;
  cosDocumentPath: string | null;
  supportingDocumentsPath: string[] | null;
  assignedTo: string | null;
  stripePaymentIntentId: string | null;
  expertVerdict: string | null;
  reportDelivered: boolean;
  createdAt: Date;
  employerName: string | null;
}

const state = vi.hoisted(() => ({
  rows: [] as any[],
  uploadRuns: 0,
  stripeStatus: "paid" as string,
}));

vi.mock("../../db", () => ({ db: {} }));
vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) },
}));

// Mirrors server/auth.ts isAuthenticated: no session -> 401. Test principal comes from a header.
vi.mock("../../auth", () => ({
  isAuthenticated: (req: any, res: any, next: any) => {
    const id = req.headers["x-test-user"];
    if (!id) return res.status(401).json({ message: "Unauthorized" });
    req.user = { id };
    next();
  },
}));

vi.mock("../../middleware/roleGuard", () => ({
  requireRole: (role: string) => (req: any, res: any, next: any) => {
    const id = req.headers["x-test-user"];
    if (!id) return res.status(401).json({ message: "Unauthorized" });
    if (req.headers["x-test-role"] !== role) return res.status(403).json({ message: "Forbidden" });
    req.user = { id, role };
    next();
  },
}));

vi.mock("../../storage", () => ({
  storage: {
    getPaidSubmission: async (id: number) => state.rows.find((r: Row) => r.id === id),
    getPaidSubmissionBySessionId: async (sid: string) => state.rows.find((r: Row) => r.stripeSessionId === sid),
    getPaidSubmissionForUser: async (id: number, userId: string) =>
      state.rows.find((r: Row) => r.id === id && r.userId !== null && r.userId === userId),
    getPaidSubmissionBySessionIdForUser: async (sid: string, userId: string) =>
      state.rows.find((r: Row) => r.stripeSessionId === sid && r.userId !== null && r.userId === userId),
    updatePaidSubmissionForUser: async (id: number, userId: string, data: any) => {
      const row = state.rows.find((r: Row) => r.id === id && r.userId === userId);
      if (row) Object.assign(row, data);
      return row;
    },
    updatePaidSubmission: async (id: number, data: any) => {
      const row = state.rows.find((r: Row) => r.id === id);
      if (row) Object.assign(row, data);
      return row;
    },
    getAllPaidSubmissions: async () => state.rows,
  },
}));

// The upload middleware must never run for a request that has not been authenticated.
vi.mock("../../utils/uploadPolicy", () => {
  const counting = (_req: any, _res: any, next: any) => {
    state.uploadRuns++;
    next();
  };
  return {
    UPLOAD_PROFILES: { paidDocs: {}, singlePdf: {} },
    uploadPaidDocs: counting,
    uploadSinglePdf: counting,
    verifyUploadedFiles: async () => undefined,
    removeUploadedFiles: async () => undefined,
    removeStoredUploads: async () => undefined,
  };
});

vi.mock("stripe", () => ({
  default: class {
    checkout = {
      sessions: {
        retrieve: async () => ({ payment_status: state.stripeStatus, customer_details: { email: "buyer@example.com" } }),
      },
    };
  },
}));

// Heavy collaborators that admin.ts imports but these routes never touch.
vi.mock("../../utils/sponsorMonitorJob", () => ({}));
vi.mock("../../utils/sponsorSearch", () => ({ rebuildSponsorIndex: vi.fn() }));
vi.mock("../../services/jobQueue", () => ({ isQueueAvailable: vi.fn(), getSponsorRefreshQueue: vi.fn() }));
vi.mock("../../services/forensicTypes", () => ({ producerFamily: vi.fn() }));
vi.mock("../../utils/redisClient", () => ({ cacheFlushPattern: vi.fn(), getRedis: () => null }));
vi.mock("../../utils/tierConfig", () => ({ getWatchLimit: vi.fn() }));
vi.mock("../../services/pdfAnalyzer", () => ({ PDFAnalyzer: class {} }));
vi.mock("../../services/cosAuthenticityChecker", () => ({ COSAuthenticityChecker: class {} }));
vi.mock("../../utils/resilientEmail", () => ({ sendEmailReliably: vi.fn() }));
vi.mock("../../utils/binaryRunner", () => ({ checkBinaryHealth: vi.fn() }));
vi.mock("../../utils/uploadGuard", () => ({
  sanitizeUploadPath: (p: string) => p,
  assertSafeUploadFilename: vi.fn(),
  assertPdfMagicBytes: vi.fn(),
  toConfinedFsPath: (p: string) => p,
}));

function makeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 1,
    userId: "owner",
    email: "owner@example.com",
    packageType: "normal",
    paymentStatus: "paid",
    reviewStatus: "pending",
    stripeSessionId: "cs_test_owner",
    cosDocumentPath: "uploads/secret-server-path",
    supportingDocumentsPath: ["uploads/a"],
    assignedTo: "admin-1",
    stripePaymentIntentId: "pi_secret",
    expertVerdict: null,
    reportDelivered: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    employerName: "Acme",
    ...overrides,
  };
}

async function buildApp() {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
  const { registerAdminRoutes } = await import("../admin");
  const app = express();
  app.use(express.json());
  registerAdminRoutes(app);
  return app;
}

describe("paid submission object-level authorization", () => {
  let app: express.Express;

  beforeEach(async () => {
    state.rows = [
      makeRow(),
      makeRow({ id: 2, userId: "other", email: "other@example.com", stripeSessionId: "cs_test_other" }),
      makeRow({ id: 3, userId: null, email: "", stripeSessionId: "cs_test_orphan" }),
    ];
    state.uploadRuns = 0;
    state.stripeStatus = "paid";
    app = await buildApp();
  });

  describe("GET /api/paid/submission/:sessionId", () => {
    it("returns the owner their own submission, limited to the owner view", async () => {
      const res = await request(app).get("/api/paid/submission/cs_test_owner").set("x-test-user", "owner");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: 1,
        email: "owner@example.com",
        packageType: "normal",
        paymentStatus: "paid",
        reviewStatus: "pending",
        createdAt: "2026-01-01T00:00:00.000Z",
      });
    });

    it("does not leak server paths, assignee, Stripe ids or analysis fields", async () => {
      const res = await request(app).get("/api/paid/submission/cs_test_owner").set("x-test-user", "owner");
      const serialised = JSON.stringify(res.body);
      for (const secret of ["secret-server-path", "admin-1", "pi_secret", "cosDocumentPath", "stripePaymentIntentId", "assignedTo"]) {
        expect(serialised).not.toContain(secret);
      }
    });

    it("returns 404 (not data, not 403) to a different user holding a valid session id", async () => {
      const res = await request(app).get("/api/paid/submission/cs_test_owner").set("x-test-user", "attacker");
      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain("owner@example.com");
    });

    it("is indistinguishable from a nonexistent session id", async () => {
      const foreign = await request(app).get("/api/paid/submission/cs_test_owner").set("x-test-user", "attacker");
      const missing = await request(app).get("/api/paid/submission/cs_does_not_exist").set("x-test-user", "attacker");
      expect(foreign.status).toBe(missing.status);
      expect(foreign.body).toEqual(missing.body);
    });

    it("does not perform the pending to paid write for a non-owner", async () => {
      state.rows[0].paymentStatus = "pending";
      state.rows[0].email = "";
      await request(app).get("/api/paid/submission/cs_test_owner").set("x-test-user", "attacker");
      expect(state.rows[0].paymentStatus).toBe("pending");
      expect(state.rows[0].email).toBe("");
    });

    it("still reconciles payment for the owner", async () => {
      state.rows[0].paymentStatus = "pending";
      state.rows[0].email = "";
      const res = await request(app).get("/api/paid/submission/cs_test_owner").set("x-test-user", "owner");
      expect(res.status).toBe(200);
      expect(res.body.paymentStatus).toBe("paid");
      expect(res.body.email).toBe("buyer@example.com");
    });

    it("denies everyone, including authenticated users, access to an ownerless row", async () => {
      const res = await request(app).get("/api/paid/submission/cs_test_orphan").set("x-test-user", "attacker");
      expect(res.status).toBe(404);
    });

    it("rejects unauthenticated requests", async () => {
      const res = await request(app).get("/api/paid/submission/cs_test_owner");
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/paid/status/:submissionId", () => {
    it("returns status to the owner", async () => {
      const res = await request(app).get("/api/paid/status/1").set("x-test-user", "owner");
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(1);
    });

    it("returns the same 404 for another user's id and a nonexistent id (no existence oracle)", async () => {
      const foreign = await request(app).get("/api/paid/status/1").set("x-test-user", "attacker");
      const missing = await request(app).get("/api/paid/status/999").set("x-test-user", "attacker");
      expect(foreign.status).toBe(404);
      expect(foreign.status).toBe(missing.status);
      expect(foreign.body).toEqual(missing.body);
    });

    it.each(["abc", "1.5", "-1", "0", "1e3", "99999999999"])("treats malformed id %s as not found", async (id) => {
      const res = await request(app).get(`/api/paid/status/${id}`).set("x-test-user", "owner");
      expect(res.status).toBe(404);
    });

    it("denies ownerless rows to everyone", async () => {
      const res = await request(app).get("/api/paid/status/3").set("x-test-user", "attacker");
      expect(res.status).toBe(404);
    });

    it("rejects unauthenticated requests", async () => {
      const res = await request(app).get("/api/paid/status/1");
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/paid/submit/:submissionId", () => {
    it("accepts a submission from the owner", async () => {
      const res = await request(app)
        .post("/api/paid/submit/1")
        .set("x-test-user", "owner")
        .send({ employerName: "Acme Ltd" });
      expect(res.status).toBe(200);
      expect(state.rows[0].employerName).toBe("Acme Ltd");
    });

    it("never runs the upload middleware for unauthenticated requests (no files written)", async () => {
      const res = await request(app).post("/api/paid/submit/1").send({});
      expect(res.status).toBe(401);
      expect(state.uploadRuns).toBe(0);
    });

    it("returns 404 and leaves the row untouched when another user submits to it", async () => {
      const res = await request(app)
        .post("/api/paid/submit/1")
        .set("x-test-user", "attacker")
        .send({ employerName: "Evil Corp" });
      expect(res.status).toBe(404);
      expect(state.rows[0].employerName).toBe("Acme");
    });

    it("rejects a submission for an unpaid row", async () => {
      state.rows[0].paymentStatus = "pending";
      const res = await request(app).post("/api/paid/submit/1").set("x-test-user", "owner").send({});
      expect(res.status).toBe(400);
    });
  });

  describe("admin routes keep their role requirement", () => {
    it("lets an admin list submissions", async () => {
      const res = await request(app).get("/api/admin/paid-submissions").set("x-test-user", "admin-1").set("x-test-role", "admin");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
    });

    it("forbids a low-privilege user", async () => {
      const res = await request(app).get("/api/admin/paid-submissions").set("x-test-user", "owner").set("x-test-role", "viewer");
      expect(res.status).toBe(403);
    });

    it("rejects unauthenticated requests", async () => {
      const res = await request(app).get("/api/admin/paid-submissions");
      expect(res.status).toBe(401);
    });

    it("forbids a low-privilege user from modifying a submission", async () => {
      const res = await request(app)
        .patch("/api/admin/paid-submissions/1")
        .set("x-test-user", "owner")
        .set("x-test-role", "support")
        .send({ reviewStatus: "approved" });
      expect(res.status).toBe(403);
      expect(state.rows[0].reviewStatus).toBe("pending");
    });
  });
});
