import type { COSVerdict } from "@shared/mis-types";

export type PatternResult = "genuine" | "suspicious" | "fake";

export interface CombinedVerdict {
  result: PatternResult;
  confidence: number;
}

/**
 * Reconciles the pattern-matching analysis against the COS (Certificate of
 * Sponsorship) authenticity check. Two rules, applied in order:
 *
 *  - cosCheck says GENUINE but pattern analysis disagrees: trust cosCheck,
 *    upgrade to genuine (confidence floor 85).
 *  - cosCheck says EDITED but pattern analysis says genuine: don't trust the
 *    pattern match, downgrade to suspicious (confidence ceiling 50) for human
 *    review. Previously this branch didn't exist — an EDITED verdict against
 *    a 'genuine' pattern result was silently discarded and the document
 *    still came back marked genuine.
 *
 * Any other combination keeps the pattern-analysis result unchanged.
 */
export function combineWithCosVerdict(
  patternResult: PatternResult,
  patternConfidence: number,
  cosVerdict: COSVerdict,
): CombinedVerdict {
  if (cosVerdict === "GENUINE" && patternResult !== "genuine") {
    return { result: "genuine", confidence: Math.max(patternConfidence, 85) };
  }
  if (cosVerdict === "EDITED" && patternResult === "genuine") {
    return { result: "suspicious", confidence: Math.min(patternConfidence, 50) };
  }
  return { result: patternResult, confidence: patternConfidence };
}
