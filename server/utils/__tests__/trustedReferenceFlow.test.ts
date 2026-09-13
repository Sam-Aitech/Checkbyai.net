import { describe, expect, test, beforeAll, afterAll } from "vitest";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { resolveVerificationWithTrust, findValidatedTrustedMatch } from "../trustedReference";
import { combineWithCosVerdict } from "../cosVerdictCombiner";
import {
  genuinePdfBinary,
  incrementallyUpdatedPdfBinary,
} from "../../services/__tests__/fixtures/cosFixtures";

// Mirrors TRUSTED_COS_FORENSIC_VERSION in server/routes/admin.ts. Compared by
// value (not imported) to keep this test free of the route module's side
// effects (express, db, storage). Bump alongside the source constant.
const EXPECTED_FORENSIC_VERSION = 1;

const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), "trusted-ref-flow-"));
process.env.UPLOADS_DIR = uploadsDir;

// Imported dynamically so UPLOADS_DIR is set before uploadGuard resolves it.
let PDFAnalyzer: typeof import("../../services/pdfAnalyzer").PDFAnalyzer;
let COSAuthenticityChecker: typeof import("../../services/cosAuthenticityChecker").COSAuthenticityChecker;

const SIX_MANDATORY = [
  "Apache FOP Producer",
  "XMP Fields Present",
  "XMP Field Order",
  "Info/XMP Consistency",
  "Incremental Updates",
  "Editing Tools",
];

let adminBytes: Buffer;
let adminMetadata: any;
let SIX_PASS: Array<{ name: string; passed: boolean; detail: string }>;
let REAL_FAIL: Array<{ name: string; passed: boolean; detail: string }>;
let editedReason: string | null;

function sha256(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function validatedRow(id: number, filename: string, documentHash: string, metadata: any, extra: Record<string, unknown> = {}) {
  return {
    id,
    filename,
    metadata,
    patterns: {
      metadata,
      documentType: "trusted_cos",
      trustType: "admin_reference",
      documentHash,
      forensicVersion: EXPECTED_FORENSIC_VERSION,
      trustStatus: "VALIDATED",
      validatedAt: "2026-09-13T00:00:00.000Z",
      cosVerdict: "GENUINE",
      ...extra,
    },
  } as any;
}

beforeAll(async () => {
  ({ PDFAnalyzer } = await import("../../services/pdfAnalyzer"));
  ({ COSAuthenticityChecker } = await import("../../services/cosAuthenticityChecker"));

  adminBytes = Buffer.from(genuinePdfBinary(), "binary");
  const adminPath = path.join(uploadsDir, "admin-ref.pdf");
  fs.writeFileSync(adminPath, adminBytes);
  adminMetadata = await new PDFAnalyzer().extractMetadata(adminPath);
  const adminCos = new COSAuthenticityChecker().check(adminBytes.toString("binary"), adminMetadata);
  if (adminCos.verdict !== "GENUINE") throw new Error(`Fixture no longer passes all six: ${adminCos.reason}`);
  SIX_PASS = adminCos.checks;

  const editedBinary = incrementallyUpdatedPdfBinary();
  const editedPath = path.join(uploadsDir, "edited.pdf");
  fs.writeFileSync(editedPath, Buffer.from(editedBinary, "binary"));
  const editedMetadata = await new PDFAnalyzer().extractMetadata(editedPath);
  const editedCos = new COSAuthenticityChecker().check(editedBinary, editedMetadata);
  REAL_FAIL = editedCos.checks;
  editedReason = editedCos.reason;
});

afterAll(() => fs.rmSync(uploadsDir, { recursive: true, force: true }));

describe("real forensic chain — six mandatory checks", () => {
  test("genuine fixture yields all six checks passing with GENUINE verdict", () => {
    expect(SIX_PASS).toHaveLength(6);
    expect(SIX_PASS.map((c) => c.name).sort()).toEqual([...SIX_MANDATORY].sort());
    expect(SIX_PASS.every((c) => c.passed)).toBe(true);
  });
});

describe("Admin → trusted reference → customer flow", () => {
  test("same bytes + current six PASS → genuine with validated status", () => {
    const hash = sha256(adminBytes);
    const outcome = resolveVerificationWithTrust(
      {
        patternResult: "genuine",
        patternConfidence: 95,
        patternChecks: [],
        cosVerdict: "GENUINE",
        cosReason: null,
        cosChecks: SIX_PASS,
        trustedPatterns: [validatedRow(1, "cos-ref.pdf", hash, adminMetadata)],
        documentHash: hash,
      },
      combineWithCosVerdict,
    );
    expect(outcome.result).toBe("genuine");
    expect(outcome.trustedReference.matched).toBe(true);
    if (outcome.trustedReference.matched) {
      expect(outcome.trustedReference.status).toBe("validated");
      expect(outcome.trustedReference.patternId).toBe(1);
    }
    expect(outcome.checks.some((c) => c.name === "Admin Trusted Reference Match")).toBe(true);
  });

  test("same bytes + current six FAIL → conflict, never auto-genuine", () => {
    const hash = sha256(adminBytes);
    const outcome = resolveVerificationWithTrust(
      {
        patternResult: "genuine",
        patternConfidence: 95,
        patternChecks: [],
        cosVerdict: "EDITED",
        cosReason: editedReason,
        cosChecks: REAL_FAIL,
        trustedPatterns: [validatedRow(1, "cos-ref.pdf", hash, adminMetadata)],
        documentHash: hash,
      },
      combineWithCosVerdict,
    );
    expect(outcome.result).toBe("suspicious");
    expect(outcome.confidence).toBeLessThanOrEqual(50);
    expect(outcome.trustedReference.matched).toBe(true);
    if (outcome.trustedReference.matched) {
      expect(outcome.trustedReference.status).toBe("conflict");
      expect(outcome.trustedReference.conflictReason).toBe(editedReason);
      expect(outcome.trustedReference.conflictChecks).toContain("Incremental Updates");
    }
    expect(outcome.checks.some((c) => c.name === "Admin Trusted Reference Match")).toBe(true);
  });

  test("different bytes + same producer → no match, normal forensics", () => {
    const hash = sha256(adminBytes);
    const otherBytes = Buffer.from(incrementallyUpdatedPdfBinary(), "binary");
    const outcome = resolveVerificationWithTrust(
      {
        patternResult: "genuine",
        patternConfidence: 90,
        patternChecks: [],
        cosVerdict: "EDITED",
        cosReason: editedReason,
        cosChecks: REAL_FAIL,
        trustedPatterns: [validatedRow(1, "cos-ref.pdf", hash, adminMetadata)],
        documentHash: sha256(otherBytes),
      },
      combineWithCosVerdict,
    );
    expect(outcome.result).toBe("suspicious");
    expect(outcome.trustedReference.matched).toBe(false);
    expect(outcome.checks.some((c) => c.name === "Admin Trusted Reference Match")).toBe(false);
  });

  test("same filename + different bytes → no match", () => {
    const hash = sha256(adminBytes);
    const otherBytes = Buffer.from(incrementallyUpdatedPdfBinary(), "binary");
    const outcome = resolveVerificationWithTrust(
      {
        patternResult: "genuine",
        patternConfidence: 95,
        patternChecks: [],
        cosVerdict: "GENUINE",
        cosReason: null,
        cosChecks: SIX_PASS,
        trustedPatterns: [validatedRow(7, "same-name.pdf", hash, adminMetadata)],
        documentHash: sha256(otherBytes),
      },
      combineWithCosVerdict,
    );
    expect(outcome.trustedReference.matched).toBe(false);
  });

  test("INVALID reference + same hash → no match, cannot force genuine", () => {
    const hash = sha256(adminBytes);
    const outcome = resolveVerificationWithTrust(
      {
        patternResult: "suspicious",
        patternConfidence: 55,
        patternChecks: [],
        cosVerdict: "EDITED",
        cosReason: editedReason,
        cosChecks: REAL_FAIL,
        trustedPatterns: [validatedRow(4, "bad.pdf", hash, adminMetadata, { trustStatus: "INVALID" })],
        documentHash: hash,
      },
      combineWithCosVerdict,
    );
    expect(outcome.trustedReference.matched).toBe(false);
    expect(outcome.result).toBe("suspicious");
  });

  test("UNVERIFIED legacy row + same hash → no match", () => {
    const hash = sha256(adminBytes);
    const outcome = resolveVerificationWithTrust(
      {
        patternResult: "genuine",
        patternConfidence: 95,
        patternChecks: [],
        cosVerdict: "GENUINE",
        cosReason: null,
        cosChecks: SIX_PASS,
        trustedPatterns: [validatedRow(3, "legacy.pdf", hash, adminMetadata, { trustStatus: "UNVERIFIED" })],
        documentHash: hash,
      },
      combineWithCosVerdict,
    );
    expect(outcome.trustedReference.matched).toBe(false);
    expect(outcome.checks.some((c) => c.name === "Admin Trusted Reference Match")).toBe(false);
  });

  test("downgrade still fires on the no-match path", () => {
    const outcome = resolveVerificationWithTrust(
      {
        patternResult: "genuine",
        patternConfidence: 90,
        patternChecks: [{ name: "Pattern", passed: true }],
        cosVerdict: "EDITED",
        cosReason: "EDITED — re-saved after initial creation",
        cosChecks: [{ name: "Incremental Updates", passed: false, detail: "1 re-save(s) detected" }],
        trustedPatterns: [],
        documentHash: sha256(adminBytes),
      },
      combineWithCosVerdict,
    );
    expect(outcome.result).toBe("suspicious");
    expect(outcome.confidence).toBe(50);
  });
});

describe("byte-level pipeline — Admin upload → customer upload", () => {
  test("same PDF bytes → VALIDATED reference → exact SHA-256 match → GENUINE", async () => {
    // ── Admin upload (mirrors POST /api/admin/trusted-patterns) ──
    const uploadedBytes = Buffer.from(genuinePdfBinary(), "binary");
    const adminPath = path.join(uploadsDir, "admin-upload.pdf");
    fs.writeFileSync(adminPath, uploadedBytes);
    const extracted = await new PDFAnalyzer().extractMetadata(adminPath);
    const documentHash = sha256(uploadedBytes);
    const gate = new COSAuthenticityChecker().check(uploadedBytes.toString("binary"), extracted);
    expect(gate.verdict).toBe("GENUINE");
    const reference = validatedRow(1, "admin-cos.pdf", documentHash, extracted);
    expect(reference.patterns.trustStatus).toBe("VALIDATED");

    // ── Customer upload of the exact same bytes ──
    const customerBytes = Buffer.from(genuinePdfBinary(), "binary");
    const customerHash = sha256(customerBytes);
    expect(customerHash).toBe(documentHash);
    const customerPath = path.join(uploadsDir, "customer-upload.pdf");
    fs.writeFileSync(customerPath, customerBytes);
    const customerMetadata = await new PDFAnalyzer().extractMetadata(customerPath);
    const customerCos = new COSAuthenticityChecker().check(customerBytes.toString("binary"), customerMetadata);
    expect(customerCos.verdict).toBe("GENUINE");

    expect(findValidatedTrustedMatch([reference], customerHash)).not.toBeNull();

    const analysisResult = await new PDFAnalyzer().analyzeAgainstTrustedPatterns(customerMetadata, [reference]);
    expect(analysisResult.result).toBe("genuine");

    const outcome = resolveVerificationWithTrust(
      {
        patternResult: analysisResult.result,
        patternConfidence: analysisResult.confidence,
        patternChecks: analysisResult.checks ?? [],
        cosVerdict: customerCos.verdict,
        cosReason: customerCos.reason,
        cosChecks: customerCos.checks,
        trustedPatterns: [reference],
        documentHash: customerHash,
      },
      combineWithCosVerdict,
    );
    expect(outcome.result).toBe("genuine");
    expect(outcome.trustedReference).toMatchObject({
      matched: true,
      status: "validated",
      patternId: 1,
      filename: "admin-cos.pdf",
      documentHash,
    });
    for (const name of SIX_MANDATORY) {
      expect(customerCos.checks.some((c) => c.name === name && c.passed)).toBe(true);
    }
  });

  test("one flipped byte → different hash → no trust, normal forensics", async () => {
    const uploadedBytes = Buffer.from(genuinePdfBinary(), "binary");
    const documentHash = sha256(uploadedBytes);
    const reference = validatedRow(1, "admin-cos.pdf", documentHash, adminMetadata);

    const tampered = Buffer.from(uploadedBytes);
    tampered[tampered.length - 10] ^= 0xff;
    const tamperedHash = sha256(tampered);
    expect(tamperedHash).not.toBe(documentHash);
    expect(findValidatedTrustedMatch([reference], tamperedHash)).toBeNull();
  });
});
