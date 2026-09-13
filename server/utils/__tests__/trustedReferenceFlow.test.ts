import { describe, expect, test } from "vitest";
import { resolveVerificationWithTrust } from "../trustedReference";
import { combineWithCosVerdict } from "../cosVerdictCombiner";

const HASH = "c".repeat(64);
const OTHER_HASH = "d".repeat(64);

function validatedRow(id: number, filename: string, documentHash: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    filename,
    patterns: {
      documentHash,
      trustStatus: "VALIDATED",
      trustType: "admin_reference",
      forensicVersion: 1,
      validatedAt: "2026-09-13T00:00:00.000Z",
      ...extra,
    },
  } as any;
}

const PASS_CHECKS = [
  { name: "Apache FOP Producer", passed: true, detail: "Producer: Apache FOP" },
  { name: "XMP Fields Present", passed: true, detail: "All 8 required XMP fields present" },
];

const FAIL_CHECKS = [
  { name: "Apache FOP Producer", passed: true, detail: "Producer: Apache FOP" },
  { name: "XMP Fields Present", passed: false, detail: "Missing: dc:language" },
];

describe("Admin → trusted reference → customer flow", () => {
  test("same bytes + current six PASS → genuine with validated status", () => {
    const outcome = resolveVerificationWithTrust(
      {
        patternResult: "genuine",
        patternConfidence: 95,
        patternChecks: [],
        cosVerdict: "GENUINE",
        cosReason: null,
        cosChecks: PASS_CHECKS,
        trustedPatterns: [validatedRow(1, "cos-ref.pdf", HASH)],
        documentHash: HASH,
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
    const outcome = resolveVerificationWithTrust(
      {
        patternResult: "genuine",
        patternConfidence: 95,
        patternChecks: [],
        cosVerdict: "EDITED",
        cosReason: "EDITED — missing dc:language",
        cosChecks: FAIL_CHECKS,
        trustedPatterns: [validatedRow(1, "cos-ref.pdf", HASH)],
        documentHash: HASH,
      },
      combineWithCosVerdict,
    );
    expect(outcome.result).toBe("suspicious");
    expect(outcome.confidence).toBeLessThanOrEqual(50);
    expect(outcome.trustedReference.matched).toBe(true);
    if (outcome.trustedReference.matched) {
      expect(outcome.trustedReference.status).toBe("conflict");
      expect(outcome.trustedReference.conflictReason).toBe("EDITED — missing dc:language");
      expect(outcome.trustedReference.conflictChecks).toContain("XMP Fields Present");
    }
    expect(outcome.checks.some((c) => c.name === "Admin Trusted Reference Match")).toBe(true);
  });

  test("different bytes + same producer → no match, normal forensics", () => {
    const outcome = resolveVerificationWithTrust(
      {
        patternResult: "genuine",
        patternConfidence: 90,
        patternChecks: [],
        cosVerdict: "EDITED",
        cosReason: "EDITED — missing dc:language",
        cosChecks: FAIL_CHECKS,
        trustedPatterns: [validatedRow(1, "cos-ref.pdf", HASH)],
        documentHash: OTHER_HASH,
      },
      combineWithCosVerdict,
    );
    expect(outcome.result).toBe("suspicious");
    expect(outcome.trustedReference).toEqual({ matched: false, documentHash: OTHER_HASH });
    expect(outcome.checks.some((c) => c.name === "Admin Trusted Reference Match")).toBe(false);
  });

  test("same filename + different bytes → no match", () => {
    const outcome = resolveVerificationWithTrust(
      {
        patternResult: "genuine",
        patternConfidence: 95,
        patternChecks: [],
        cosVerdict: "GENUINE",
        cosReason: null,
        cosChecks: PASS_CHECKS,
        trustedPatterns: [validatedRow(7, "same-name.pdf", HASH)],
        documentHash: OTHER_HASH,
      },
      combineWithCosVerdict,
    );
    expect(outcome.trustedReference.matched).toBe(false);
  });

  test("INVALID reference + same hash → no match, cannot force genuine", () => {
    const outcome = resolveVerificationWithTrust(
      {
        patternResult: "suspicious",
        patternConfidence: 55,
        patternChecks: [],
        cosVerdict: "EDITED",
        cosReason: "EDITED — missing dc:language",
        cosChecks: FAIL_CHECKS,
        trustedPatterns: [validatedRow(4, "bad.pdf", HASH, { trustStatus: "INVALID" })],
        documentHash: HASH,
      },
      combineWithCosVerdict,
    );
    expect(outcome.trustedReference.matched).toBe(false);
    expect(outcome.result).toBe("suspicious");
  });

  test("UNVERIFIED legacy row + same hash → no match", () => {
    const outcome = resolveVerificationWithTrust(
      {
        patternResult: "genuine",
        patternConfidence: 95,
        patternChecks: [],
        cosVerdict: "GENUINE",
        cosReason: null,
        cosChecks: PASS_CHECKS,
        trustedPatterns: [validatedRow(3, "legacy.pdf", HASH, { trustStatus: "UNVERIFIED" })],
        documentHash: HASH,
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
        documentHash: HASH,
      },
      combineWithCosVerdict,
    );
    expect(outcome.result).toBe("suspicious");
    expect(outcome.confidence).toBe(50);
  });
});
