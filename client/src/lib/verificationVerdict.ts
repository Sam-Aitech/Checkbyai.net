import type { VerificationResultType } from "./verificationResultTone";

const BACKEND_VERDICT_MAPPING: Readonly<Record<string, VerificationResultType>> = {
  genuine: "genuine",
  suspicious: "suspicious",
  fake: "fake",
  inconclusive: "inconclusive",
};

/**
 * Maps a raw backend `result` value to a user-facing verdict type.
 * Fail-closed: unknown, missing, or miscased values return `inconclusive`
 * (neutral "needs human review") — never `fake`, so a backend typo or new
 * enum value cannot render as a maximally alarming false accusation.
 */
export function mapBackendVerdict(raw: unknown, source: string): VerificationResultType {
  const key = typeof raw === "string" ? raw.toLowerCase() : "";
  const mapped = BACKEND_VERDICT_MAPPING[key];
  if (!mapped) {
    console.error(`[${source}] Unknown verdict from backend, showing inconclusive:`, raw);
    return "inconclusive";
  }
  return mapped;
}

/**
 * Normalizes backend confidence to a 0-1 fraction for display components
 * (which render `Math.round(confidence * 100)`). Accepts either the 0-100
 * or 0-1 scale so receipt (0-100) and verify (0-100) responses cannot
 * render as a 0.92% sliver bar. Non-numeric input becomes 0.
 */
export function normalizeBackendConfidence(raw: unknown): number {
  const value = typeof raw === "number" ? raw : 0;
  if (value > 1) {
    return value / 100;
  }
  return value;
}
