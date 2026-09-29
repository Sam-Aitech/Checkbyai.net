import { describe, it, expect, vi, beforeEach } from "vitest";

const loggerMock = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }));
vi.mock("../../utils/logger", () => ({ logger: loggerMock }));

import {
  attachPdfVerdictEvidence,
  buildAdminOverrideEvidence,
  buildPatternAndCosForensicChecks,
} from "../verificationShared";
import { emptyStructuralFeatures } from "../forensicTypes";

const baseInput = () => ({
  pdfBinary: "%PDF-1.4",
  extractedMetadata: { producer: "Apache FOP", parsedXmp: { "dc:date": "x" }, rawXmpData: "<x/>" },
  extractStructuralFeatures: () => emptyStructuralFeatures(),
  outcome: { result: "genuine", confidence: 91, checks: [{ name: "a", passed: true, message: "ok" }] },
  cosCheckResult: { checks: [{ name: "b", passed: false, detail: "bad" }] },
  documentHash: "hash-1",
  receiptId: "CBA-1",
  uploadMethod: "api-verify-upload" as const,
  filename: "doc.pdf",
  logTag: "[Test]",
});

describe("attachPdfVerdictEvidence", () => {
  beforeEach(() => vi.clearAllMocks());

  it("attaches a bundle and no error marker on success", () => {
    const analysis: any = {};
    attachPdfVerdictEvidence(analysis, baseInput());

    expect(analysis.forensicEvidence).toBeDefined();
    expect(analysis.forensicEvidence.finalVerdict).toBe("GENUINE");
    expect(analysis.forensicEvidenceError).toBeUndefined();
    expect(loggerMock.error).not.toHaveBeenCalled();
  });

  it("marks the row and logs at error with hash + receipt when the build throws", () => {
    const analysis: any = {};
    attachPdfVerdictEvidence(analysis, {
      ...baseInput(),
      extractStructuralFeatures: () => {
        throw new Error("schema bump");
      },
    });

    expect(analysis.forensicEvidence).toBeUndefined();
    expect(analysis.forensicEvidenceError).toMatchObject({ message: "schema bump" });
    expect(typeof analysis.forensicEvidenceError.at).toBe("string");
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
    expect(loggerMock.error.mock.calls[0][0]).toMatchObject({
      documentHash: "hash-1",
      receiptId: "CBA-1",
      uploadMethod: "api-verify-upload",
    });
  });

  it("records an abstention reason only for suspicious verdicts", () => {
    const analysis: any = {};
    attachPdfVerdictEvidence(analysis, {
      ...baseInput(),
      outcome: { result: "suspicious", confidence: 40, checks: [] },
      cosCheckResult: { checks: [], reason: "needs human" },
    });
    expect(analysis.forensicEvidence.finalVerdict).toBe("SUSPICIOUS");
    expect(analysis.forensicEvidence.abstentionReason).toBe("needs human");
  });
});

describe("buildPatternAndCosForensicChecks", () => {
  it("prefixes ids and reads message for pattern checks and detail for CoS checks", () => {
    const rows = buildPatternAndCosForensicChecks(
      [{ name: "p1", passed: 1, message: "pm" }],
      [{ name: "c1", passed: 0, detail: "cd" }],
    );
    expect(rows).toEqual([
      { checkId: "pattern:p1", passed: true, detail: "pm" },
      { checkId: "cos:c1", passed: false, detail: "cd" },
    ]);
  });

  it("returns [] for non-array input", () => {
    expect(buildPatternAndCosForensicChecks(undefined, null)).toEqual([]);
  });
});

describe("buildAdminOverrideEvidence", () => {
  it("builds a 99-confidence override bundle with override: check ids", () => {
    const bundle = buildAdminOverrideEvidence({
      analysis: { checks: [{ name: "Admin Human Review Override", passed: false, message: "m" }] },
      documentHash: "h",
      uploadMethod: "bullmq-worker",
      filename: "f.pdf",
      verdict: "FAKE",
    });
    expect(bundle.finalVerdict).toBe("FAKE");
    expect(bundle.finalConfidence).toBe(99);
    expect(bundle.inputProvenance.uploadMethod).toBe("bullmq-worker");
    expect(bundle.forensicChecks).toEqual([
      { checkId: "override:Admin Human Review Override", passed: false, detail: "m" },
    ]);
  });

  it("does not throw when analysis has no checks", () => {
    expect(() =>
      buildAdminOverrideEvidence({
        analysis: {},
        documentHash: "h",
        uploadMethod: "api-verify-upload",
        filename: "f.pdf",
        verdict: "GENUINE",
      }),
    ).not.toThrow();
  });
});
