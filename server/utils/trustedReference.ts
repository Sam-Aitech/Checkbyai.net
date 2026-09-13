import type { TrustedPattern } from "@shared/schema";

export interface ValidatedTrustedMatch {
  patternId: number;
  filename: string;
  documentHash: string;
  forensicVersion?: number;
  validatedAt?: string;
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
    if (typeof inner.trustType === "string" && inner.trustType !== "admin_reference") continue;
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
