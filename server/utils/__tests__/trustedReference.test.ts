import { describe, expect, test } from "vitest";
import { findValidatedTrustedMatch, buildTrustedReferenceCheck } from "../trustedReference";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function row(id: number, filename: string, inner: any) {
  return { id, filename, patterns: inner };
}

describe("findValidatedTrustedMatch", () => {
  test("exact VALIDATED hash match returns genuine reference", () => {
    const patterns = [
      row(1, "cos-ref.pdf", {
        documentHash: HASH_A,
        trustStatus: "VALIDATED",
        trustType: "admin_reference",
        forensicVersion: 1,
      }),
    ];
    const m = findValidatedTrustedMatch(patterns as any, HASH_A);
    expect(m).not.toBeNull();
    expect(m?.patternId).toBe(1);
    expect(m?.filename).toBe("cos-ref.pdf");
    expect(m?.documentHash).toBe(HASH_A);
  });

  test("different hash with same producer does NOT match", () => {
    const patterns = [
      row(1, "cos-ref.pdf", {
        documentHash: HASH_A,
        trustStatus: "VALIDATED",
        trustType: "admin_reference",
        producer: "Apache FOP",
      }),
    ];
    expect(findValidatedTrustedMatch(patterns as any, HASH_B)).toBeNull();
  });

  test("same filename but different bytes does NOT match", () => {
    const patterns = [
      row(7, "same-name.pdf", { documentHash: HASH_A, trustStatus: "VALIDATED", trustType: "admin_reference" }),
    ];
    expect(findValidatedTrustedMatch(patterns as any, HASH_B)).toBeNull();
  });

  test("legacy row without trustStatus does NOT auto-trust", () => {
    const patterns = [row(2, "legacy.pdf", { metadata: {}, documentType: "trusted_cos" })];
    expect(findValidatedTrustedMatch(patterns as any, HASH_A)).toBeNull();
  });

  test("UNVERIFIED row with same hash does NOT match", () => {
    const patterns = [
      row(3, "legacy.pdf", { documentHash: HASH_A, trustStatus: "UNVERIFIED", trustType: "admin_reference" }),
    ];
    expect(findValidatedTrustedMatch(patterns as any, HASH_A)).toBeNull();
  });

  test("INVALID reference cannot force GENUINE", () => {
    const patterns = [
      row(4, "bad.pdf", { documentHash: HASH_A, trustStatus: "INVALID", trustType: "admin_reference" }),
    ];
    expect(findValidatedTrustedMatch(patterns as any, HASH_A)).toBeNull();
  });

  test("non-admin_reference trustType does NOT match", () => {
    const patterns = [
      row(5, "x.pdf", { documentHash: HASH_A, trustStatus: "VALIDATED", trustType: "other" }),
    ];
    expect(findValidatedTrustedMatch(patterns as any, HASH_A)).toBeNull();
  });

  test("empty inputs return null", () => {
    expect(findValidatedTrustedMatch([], HASH_A)).toBeNull();
    expect(findValidatedTrustedMatch(null as any, HASH_A)).toBeNull();
    expect(findValidatedTrustedMatch([], "")).toBeNull();
  });

  test("missing trustType does NOT match (strictly required)", () => {
    const patterns = [
      row(6, "no-trust-type.pdf", { documentHash: HASH_A, trustStatus: "VALIDATED" }),
    ];
    expect(findValidatedTrustedMatch(patterns as any, HASH_A)).toBeNull();
  });

  test("evidence helper is verdict-neutral reference identity", () => {
    const check = buildTrustedReferenceCheck({
      patternId: 1,
      filename: "cos-ref.pdf",
      documentHash: HASH_A,
    });
    expect(check.name).toBe("Admin Trusted Reference Match");
    expect(check.passed).toBe(true);
    expect(check.message).toContain("cos-ref.pdf");
    expect(check.message).not.toMatch(/genuine 99|override/i);
  });
});
