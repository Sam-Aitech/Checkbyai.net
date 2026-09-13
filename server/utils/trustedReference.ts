import type { TrustedPattern } from "@shared/schema";

export type TrustedReferenceStatus = "validated" | "conflict";

export interface ValidatedTrustedMatch {
  patternId: number;
  filename: string;
  documentHash: string;
  forensicVersion?: number;
  validatedAt?: string;
}

export interface TrustedReferenceInfo extends ValidatedTrustedMatch {
  matched: true;
  status: TrustedReferenceStatus;
  conflictReason?: string;
  conflictChecks?: string[];
}

interface TrustedInner {
  documentHash?: unknown;
  trustStatus?: unknown;
  trustType?: unknown;
  forensicVersion?: unknown;
  validatedAt?: unknown;
}

function asInner(p: TrustedPattern): TrustedInner {
  const inner = (p as { patterns?: unknown }).patterns;
  if (typeof inner !== "object" || inner === null) return {};
  return inner as TrustedInner;
}

export function findValidatedTrustedMatch(patterns: TrustedPattern[], documentHash: string): ValidatedTrustedMatch | null {
  if (!documentHash || !Array.isArray(patterns)) return null;
  for (const p of patterns) {
    const inner = asInner(p);
    if (inner.documentHash !== documentHash) continue;
    if (inner.trustStatus !== "VALIDATED") continue;
    if (inner.trustType !== "admin_reference") continue;
    const match: ValidatedTrustedMatch = {
      patternId: p.id,
      filename: p.filename,
      documentHash,
    };
    if (typeof inner.forensicVersion === "number") match.forensicVersion = inner.forensicVersion;
    if (typeof inner.validatedAt === "string") match.validatedAt = inner.validatedAt;
    return match;
  }
  return null;
}

export function buildTrustedReferenceCheck(match: ValidatedTrustedMatch): {
  name: string;
  passed: boolean;
  severity: string;
  message: string;
} {
  return {
    name: "Admin Trusted Reference Match",
    passed: true,
    severity: "info",
    message: `Exact SHA-256 match to admin-approved document "${match.filename}" (${match.documentHash.slice(0, 16)}…). Reference identity only — verdict follows the current six-check forensic result below.`,
  };
}

export interface TrustAwareInputs {
  patternResult: "genuine" | "suspicious" | "fake";
  patternConfidence: number;
  patternChecks: Array<{ name: string; passed: boolean; severity?: string; message?: string }>;
  cosVerdict: "GENUINE" | "EDITED";
  cosReason: string | null;
  cosChecks: Array<{ name: string; passed: boolean; detail: string }>;
  trustedPatterns: TrustedPattern[];
  documentHash: string;
}

export interface TrustAwareOutcome {
  result: "genuine" | "suspicious" | "fake";
  confidence: number;
  checks: Array<{ name: string; passed: boolean; severity?: string; message?: string }>;
  trustedReference:
    | ({ matched: false; documentHash: string })
    | ({ matched: true } & ValidatedTrustedMatch & {
        status: TrustedReferenceStatus;
        conflictReason?: string | null;
        conflictChecks?: string[];
      });
}

export function resolveVerificationWithTrust(inputs: TrustAwareInputs, combine: (patternResult: "genuine" | "suspicious" | "fake", patternConfidence: number, cosVerdict: "GENUINE" | "EDITED") => { result: "genuine" | "suspicious" | "fake"; confidence: number }): TrustAwareOutcome {
  const combined = combine(inputs.patternResult, inputs.patternConfidence, inputs.cosVerdict);
  const match = findValidatedTrustedMatch(inputs.trustedPatterns, inputs.documentHash);
  if (!match) {
    return {
      result: combined.result,
      confidence: combined.confidence,
      checks: inputs.patternChecks,
      trustedReference: { matched: false, documentHash: inputs.documentHash },
    };
  }
  const checks = [...inputs.patternChecks, buildTrustedReferenceCheck(match)];
  if (inputs.cosVerdict === "GENUINE") {
    return {
      result: combined.result,
      confidence: combined.confidence,
      checks,
      trustedReference: { matched: true, status: "validated", ...match },
    };
  }
  const conflictChecks = inputs.cosChecks.filter((c) => !c.passed).map((c) => c.name);
  return {
    result: combined.result,
    confidence: combined.confidence,
    checks,
    trustedReference: {
      matched: true,
      status: "conflict",
      ...match,
      conflictReason: inputs.cosReason,
      conflictChecks,
    },
  };
}
