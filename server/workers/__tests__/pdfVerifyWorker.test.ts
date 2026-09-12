import { describe, it, expect, vi, beforeEach } from "vitest";

const mockStorage = {
  getVerificationByReceiptId: vi.fn(),
  getAdminFlaggedVerificationByHash: vi.fn(() => Promise.resolve(undefined)),
  getAdminApprovedVerificationByHash: vi.fn(() => Promise.resolve(undefined)),
  getTrustedPatterns: vi.fn(() => Promise.resolve([])),
  getActiveGlobalAiRules: vi.fn(() => Promise.resolve([])),
  getAdminFakeKnowledge: vi.fn(() => Promise.resolve([])),
};
vi.mock("../../storage", () => ({ storage: mockStorage }));

const mockFetchPdfUpload = vi.fn();
const mockDeletePdfUpload = vi.fn(() => Promise.resolve());
vi.mock("../../utils/pdfUploadStore", () => ({
  fetchPdfUpload: mockFetchPdfUpload,
  deletePdfUpload: mockDeletePdfUpload,
}));

const mockTransaction = vi.fn();
vi.mock("../../db", () => ({ db: { transaction: mockTransaction } }));

vi.mock("../../services/pdfAnalyzer", () => ({
  PDFAnalyzer: class {
    extractMetadata() { return Promise.resolve({}); }
    analyzeAgainstTrustedPatterns() { return Promise.resolve({ result: "genuine", confidence: 90 }); }
  },
}));
vi.mock("../../services/cosAuthenticityChecker", () => ({
  COSAuthenticityChecker: class {
    check() { return { verdict: "genuine" }; }
  },
}));
vi.mock("../../utils/cosVerdictCombiner", () => ({
  combineWithCosVerdict: (result: string, confidence: number) => ({ result, confidence }),
}));
vi.mock("../../utils/dbRetry", () => ({
  withRetry: (fn: () => Promise<unknown>) => fn(),
}));
vi.mock("../../services/socketGateway", () => ({ emitToUser: vi.fn() }));
vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { processPdfVerifyJob } = await import("../pdfVerifyWorker");

function makeJob(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "job-1",
    data: {
      userId: "user-1",
      uploadId: "upload-1",
      originalname: "cos.pdf",
      documentHash: "hash123",
      receiptId: "CBA-AAAAAAAA-BBBBBBBB",
      ipAddress: null,
      useCredits: true,
      useDailyLimit: false,
      ...((overrides.data as object) ?? {}),
    },
    attemptsMade: 0,
    opts: { attempts: 3 },
    updateProgress: vi.fn(() => Promise.resolve()),
    ...overrides,
  } as any;
}

describe("processPdfVerifyJob idempotent short-circuit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("short-circuits without re-processing when a result for this receiptId already exists", async () => {
    mockStorage.getVerificationByReceiptId.mockResolvedValueOnce({
      id: 42,
      receiptId: "CBA-AAAAAAAA-BBBBBBBB",
      result: "genuine",
    });
    const job = makeJob();

    const result = await processPdfVerifyJob(job);

    expect(result).toEqual({ verificationId: 42, receiptId: "CBA-AAAAAAAA-BBBBBBBB", result: "genuine" });
    // Never touched the durable upload, never ran analysis, never opened a
    // DB transaction (which is what would re-deduct a credit).
    expect(mockFetchPdfUpload).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
    // Cleans up the now-redundant durable upload row.
    expect(mockDeletePdfUpload).toHaveBeenCalledWith("upload-1");
  });

  it("does not throw for an already-completed job (closes the stalled-job unique-constraint failure)", async () => {
    mockStorage.getVerificationByReceiptId.mockResolvedValueOnce({
      id: 7,
      receiptId: "CBA-AAAAAAAA-BBBBBBBB",
      result: "fake",
    });
    const job = makeJob();
    await expect(processPdfVerifyJob(job)).resolves.not.toThrow();
  });

  it("proceeds with normal processing when no prior result exists for this receiptId", async () => {
    mockStorage.getVerificationByReceiptId.mockResolvedValueOnce(undefined);
    mockFetchPdfUpload.mockResolvedValueOnce({
      fileBytes: Buffer.from("%PDF-1.4 fake"),
      originalname: "cos.pdf",
    });
    mockTransaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
        select: () => ({ from: () => ({ where: () => Promise.resolve([{}]) }) }),
        insert: () => ({ values: () => ({ returning: () => Promise.resolve([{ id: 99 }]) }) }),
      };
      return fn(tx);
    });

    const job = makeJob();
    const result = await processPdfVerifyJob(job);

    expect(mockFetchPdfUpload).toHaveBeenCalledWith("upload-1");
    expect(result.verificationId).toBe(99);
    expect(mockDeletePdfUpload).toHaveBeenCalledWith("upload-1");
  });
});
