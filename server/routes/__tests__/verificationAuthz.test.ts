import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const h = vi.hoisted(() => {
  process.env.UPLOADS_DIR = require("fs").mkdtempSync(require("path").join(require("os").tmpdir(), "verif-authz-"));
  return {
    jobs: new Map<string, any>(),
    verifications: [] as any[],
    queueAvailable: true,
  };
});

vi.mock("../../db", () => ({ db: {} }));
vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) },
}));
vi.mock("../../auth", () => ({
  isAuthenticated: (req: any, res: any, next: any) => {
    const id = req.headers["x-test-user"];
    if (!id) return res.status(401).json({ message: "Unauthorized" });
    req.user = { id };
    req.isAuthenticated = () => true;
    next();
  },
}));
vi.mock("../../middleware/rateLimiter", () => ({
  verifyLimiter: (_q: any, _s: any, n: any) => n(),
  receiptVerifyLimiter: (_q: any, _s: any, n: any) => n(),
}));
vi.mock("../../storage", () => ({
  storage: {
    getUser: async (id: string) => ({ id, role: "user" }),
    getVerificationByDocHashPrefixAndUser: async (prefix: string, userId: string) =>
      h.verifications.find((v) => v.documentHash.startsWith(prefix) && v.userId === userId) ?? null,
    getVerificationByReceiptId: async (id: string) => h.verifications.find((v) => v.receiptId === id && !v.deletedAt),
  },
}));
vi.mock("../../services/jobQueue", () => ({
  isQueueAvailable: () => h.queueAvailable,
  getPdfVerifyQueue: () => ({ getJob: async (id: string) => h.jobs.get(id) ?? null }),
}));
vi.mock("../../services/verificationShared", () => ({
  buildAdminOverrideEvidence: vi.fn(),
  buildPatternAndCosForensicChecks: vi.fn(),
  chargeVerificationUsage: vi.fn(),
}));
vi.mock("../../utils/dbRetry", () => ({ withRetry: (fn: any) => fn() }));
vi.mock("../../services/pdfAnalyzer", () => ({ PDFAnalyzer: class {} }));
vi.mock("../../services/cosAuthenticityChecker", () => ({ COSAuthenticityChecker: class {} }));
vi.mock("../../ipRateLimit", () => ({ getClientIp: () => "1.1.1.1", hashIpAddress: (x: string) => x }));
vi.mock("../../utils/cosVerdictCombiner", () => ({ combineWithCosVerdict: vi.fn() }));
vi.mock("../../utils/trustedReference", () => ({ resolveVerificationWithTrust: vi.fn() }));
vi.mock("../../services/forensicTypes", () => ({ buildForensicEvidence: vi.fn(), toEvidenceVerdict: vi.fn() }));
vi.mock("../../utils/pdfUploadStore", () => ({ storePdfUpload: vi.fn() }));

const HASH16 = "0123456789abcdef";
const jobIdFor = (userId: string) => `verify-${HASH16}-${userId}-deadbeef`;

async function buildApp() {
  const { registerVerificationRoutes } = await import("../verification");
  const { errorHandler } = await import("../../lib/errorHandler");
  const app = express();
  app.use(express.json());
  registerVerificationRoutes(app);
  app.use(errorHandler);
  return app;
}

describe("GET /api/verify/status/:jobId ownership", () => {
  let app: express.Express;
  const body = (res: any) => res.body?.data ?? res.body;

  beforeEach(async () => {
    h.jobs.clear();
    h.queueAvailable = true;
    h.verifications = [
      { id: 1, userId: "owner", documentHash: `${HASH16}ffff`, receiptId: "CBA-AAAA1111-BBBB2222", result: "genuine", confidence: 90, verifiedAt: new Date("2026-01-01T00:00:00Z"), analysisDetails: { checks: [{}, {}] } },
    ];
    h.jobs.set(jobIdFor("owner"), {
      data: { userId: "owner" },
      progress: 100,
      getState: async () => "completed",
      returnvalue: { receiptId: "CBA-AAAA1111-BBBB2222", result: "genuine", checks: [] },
    });
    app = await buildApp();
  });

  it("returns the job result to the owner", async () => {
    const res = await request(app).get(`/api/verify/status/${jobIdFor("owner")}`).set("x-test-user", "owner");
    expect(res.status).toBe(200);
    expect(body(res).status).toBe("completed");
    expect(body(res).returnvalue.receiptId).toBe("CBA-AAAA1111-BBBB2222");
  });

  it("reports not_found (no payload) to a different user who has the job id", async () => {
    const res = await request(app).get(`/api/verify/status/${jobIdFor("owner")}`).set("x-test-user", "attacker");
    expect(body(res).status).toBe("not_found");
    expect(JSON.stringify(res.body)).not.toContain("CBA-AAAA1111-BBBB2222");
  });

  it("does not let a forged job id that embeds the victim's user id reach the victim's stored result", async () => {
    h.jobs.clear(); // job evicted: only the DB fallback is left
    const res = await request(app).get(`/api/verify/status/${jobIdFor("owner")}`).set("x-test-user", "attacker");
    expect(body(res).status).toBe("not_found");
  });

  it("still serves the DB fallback to the owner after the job is evicted", async () => {
    h.jobs.clear();
    const res = await request(app).get(`/api/verify/status/${jobIdFor("owner")}`).set("x-test-user", "owner");
    expect(body(res).status).toBe("completed");
    expect(body(res).receiptId).toBe("CBA-AAAA1111-BBBB2222");
  });

  it("does not leak job state, progress or failure reason of another user's job", async () => {
    h.jobs.set(jobIdFor("owner"), { data: { userId: "owner" }, progress: 40, failedReason: "secret reason", getState: async () => "failed" });
    const res = await request(app).get(`/api/verify/status/${jobIdFor("owner")}`).set("x-test-user", "attacker");
    expect(JSON.stringify(res.body)).not.toContain("secret reason");
    expect(body(res).status).toBe("not_found");
  });

  it("rejects unauthenticated requests", async () => {
    const res = await request(app).get(`/api/verify/status/${jobIdFor("owner")}`);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/verify upload gate", () => {
  it("rejects unauthenticated uploads before multer touches the request", async () => {
    const fs = await import("fs");
    const app = express();
    const { registerVerificationRoutes } = await import("../verification");
    const { errorHandler } = await import("../../lib/errorHandler");
    // Unauthenticated: the real passport helper is absent, so isAuthenticated is false.
    app.use((req: any, _res, next) => { req.isAuthenticated = () => false; next(); });
    registerVerificationRoutes(app);
    app.use(errorHandler);
    const res = await request(app)
      .post("/api/verify")
      .attach("file", Buffer.from("%PDF-1.7 test"), { filename: "cos.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("beta_login_required");
    expect(fs.readdirSync(process.env.UPLOADS_DIR!)).toEqual([]);
  });
});

describe("receipts: integrity and access", () => {
  let app: express.Express;
  const body = (res: any) => res.body?.data ?? res.body;
  const record = () => ({
    id: 1,
    userId: "owner",
    documentHash: "ab".repeat(32),
    receiptId: "CBA-AAAA1111-BBBB2222",
    result: "genuine",
    confidence: 91,
    verifiedAt: new Date("2026-02-03T04:05:06.000Z"),
    analysisDetails: { checks: [{}, {}, {}] },
  });

  beforeEach(async () => {
    vi.stubEnv("DIGEST_SIGNING_KEY", "k".repeat(64));
    h.verifications = [record(), { ...record(), id: 2, receiptId: "CBA-DEAD0000-BEEF0000", deletedAt: new Date() }];
    app = await buildApp();
  });

  it("serves a keyed signature computed from the stored record", async () => {
    const res = await request(app).get("/api/receipt/CBA-AAAA1111-BBBB2222");
    expect(res.status).toBe(200);
    expect(body(res).signature).toMatch(/^[0-9a-f]{64}$/);
    expect(body(res).signatureVersion).toBe(1);
    expect(body(res).checksPerformed).toBe(3);
    expect(body(res).integrityHash).toMatch(/^[0-9a-f]{64}$/); // legacy field retained
  });

  it("the signature cannot be recomputed without the key (the unkeyed hash can)", async () => {
    const crypto = await import("node:crypto");
    const res = await request(app).get("/api/receipt/CBA-AAAA1111-BBBB2222");
    const r = record();
    const forgedWithoutKey = crypto
      .createHash("sha256")
      .update(["v1", r.receiptId, r.documentHash, r.result, String(r.confidence), r.verifiedAt.toISOString()].join("|"))
      .digest("hex");
    expect(body(res).signature).not.toBe(forgedWithoutKey);
  });

  it("verify endpoint accepts the issued signature and rejects tampered or malformed ones", async () => {
    const issued = body(await request(app).get("/api/receipt/CBA-AAAA1111-BBBB2222")).signature;
    const ok = await request(app).get("/api/receipt/CBA-AAAA1111-BBBB2222/verify").query({ signature: issued });
    expect(body(ok).valid).toBe(true);

    const flipped = (issued[0] === "a" ? "b" : "a") + issued.slice(1);
    for (const sig of [flipped, "", "zz", "0".repeat(64), issued.toUpperCase()]) {
      const res = await request(app).get("/api/receipt/CBA-AAAA1111-BBBB2222/verify").query({ signature: sig });
      expect(body(res).valid).toBe(false);
    }
    const none = await request(app).get("/api/receipt/CBA-AAAA1111-BBBB2222/verify");
    expect(body(none).valid).toBe(false);
  });

  it("a signature for one receipt does not validate another receipt or altered fields", async () => {
    const { signReceipt, verifyReceiptSignature } = await import("../../utils/receiptSignature");
    const base = record();
    const sig = signReceipt(base)!;
    expect(verifyReceiptSignature(base, sig)).toBe(true);
    expect(verifyReceiptSignature({ ...base, result: "fake" }, sig)).toBe(false);
    expect(verifyReceiptSignature({ ...base, confidence: 99 }, sig)).toBe(false);
    expect(verifyReceiptSignature({ ...base, receiptId: "CBA-00000000-00000000" }, sig)).toBe(false);
    expect(verifyReceiptSignature({ ...base, documentHash: "cd".repeat(32) }, sig)).toBe(false);
    expect(verifyReceiptSignature({ ...base, verifiedAt: new Date("2026-02-03T04:05:07.000Z") }, sig)).toBe(false);
  });

  it("is stable across server timezones (canonical ISO date, not Date#toString)", async () => {
    const { canonicalReceipt } = await import("../../utils/receiptSignature");
    expect(canonicalReceipt(record())).toBe(`v1|CBA-AAAA1111-BBBB2222|${"ab".repeat(32)}|genuine|91|2026-02-03T04:05:06.000Z`);
  });

  it("returns 404 for unknown and soft-deleted receipts, on both endpoints", async () => {
    for (const path of ["/api/receipt/CBA-NOPE0000-NOPE0000", "/api/receipt/CBA-DEAD0000-BEEF0000", "/api/receipt/CBA-DEAD0000-BEEF0000/verify"]) {
      expect((await request(app).get(path)).status).toBe(404);
    }
  });

  it("serves unsigned (not a 500) when no signing key is configured", async () => {
    vi.stubEnv("DIGEST_SIGNING_KEY", "");
    const res = await request(app).get("/api/receipt/CBA-AAAA1111-BBBB2222");
    expect(res.status).toBe(200);
    expect(body(res).signature).toBeUndefined();
    const verify = await request(app).get("/api/receipt/CBA-AAAA1111-BBBB2222/verify").query({ signature: "0".repeat(64) });
    expect(body(verify).valid).toBe(false);
  });

  it("does not expose owner identity or internal ids", async () => {
    const res = await request(app).get("/api/receipt/CBA-AAAA1111-BBBB2222");
    expect(JSON.stringify(res.body)).not.toContain("owner");
    expect(Object.keys(body(res)).sort()).toEqual(
      ["checksPerformed", "confidence", "documentHash", "integrityHash", "receiptId", "result", "signature", "signatureVersion", "verifiedAt"],
    );
  });
});
