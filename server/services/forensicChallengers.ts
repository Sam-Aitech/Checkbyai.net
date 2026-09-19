/**
 * Phase 3 discrimination challengers — SHADOW ONLY.
 *
 * NEVER import this module from routes, workers, or any served-verdict path.
 * These functions run exclusively in offline scripts (`forensic:discriminate`)
 * and unit tests to measure whether a candidate mechanism adds discrimination
 * over the champion pipeline. Promotion to production requires beating the
 * pre-declared bar (red-team bypass cut ≥50% relative, no FPR/P95 regression)
 * AND a separate tech-lead review — a good shadow number alone is not a merge.
 *
 * Experiment status (see docs/FORENSIC_CORPUS.md §8):
 *  - Exp A (near-reference content binding): executable now.
 *  - Exp B (generation-invariant anachronism): executable now, catches only
 *    impossible dates; subtle backdates remain blind by construction.
 *  - Exp C (text-opcode profile): BLOCKED on real captures (stand-in seeds
 *    carry no text content streams); measured as all-zeros, not implemented.
 */

import type { PDFMetadata } from './pdfAnalyzer';
import { producerFamily } from './forensicTypes';

// Re-exported for existing importers; canonical home is forensicTypes.ts
// (production-safe — this module itself stays shadow-only).
export { producerFamily };

export interface GenerationInvariants {
  version: string;
  pdfVersions: Record<string, { specYear: number }>;
  xmpIntroducedYear: number;
}

export interface AnachronismResult {
  anachronistic: boolean;
  reasons: string[];
}

/** Extract a 4-digit year from `D:YYYY...` or ISO `YYYY-MM-DD...`. Null if unparseable. */
export function parseDocYear(dateStr: unknown): number | null {
  if (typeof dateStr !== 'string') return null;
  const pdf = dateStr.match(/D:(\d{4})/);
  if (pdf) return parseInt(pdf[1], 10);
  const iso = dateStr.match(/^(\d{4})-\d{2}/);
  if (iso) return parseInt(iso[1], 10);
  return null;
}

/**
 * Flags IMPOSSIBLE dates only (not merely suspicious ones):
 *  - real XMP packet + creation year before XMP existed, or
 *  - declared PDF version newer than the creation year allows.
 * A consistent backdate to a plausible year (e.g. 2025) passes cleanly —
 * that residual blindness is documented, not hidden.
 */
export function checkAnachronism(
  metadata: PDFMetadata,
  invariants: GenerationInvariants,
): AnachronismResult {
  const reasons: string[] = [];
  const year = parseDocYear(metadata.creationDate);
  if (year === null) return { anachronistic: false, reasons };

  const hasRealXmp = !!(metadata as { rawXmpData?: unknown }).rawXmpData;
  if (hasRealXmp && year < invariants.xmpIntroducedYear) {
    reasons.push(
      `Creation year ${year} predates the XMP specification (${invariants.xmpIntroducedYear}) but the file carries an XMP packet`,
    );
  }

  const spec = metadata.pdfVersion ? invariants.pdfVersions[metadata.pdfVersion] : undefined;
  if (spec && year < spec.specYear) {
    reasons.push(
      `Creation year ${year} predates PDF ${metadata.pdfVersion} (${spec.specYear})`,
    );
  }

  return { anachronistic: reasons.length > 0, reasons };
}

export interface ContentDivergence {
  diverged: boolean;
  fields: string[];
}

/**
 * Near-reference content binding: when a document matches a trusted reference
 * on producer family + PDF version (i.e. it claims to come from the same
 * generator) but disagrees on human-meaningful content fields present in both,
 * that divergence is evidence of tampering — even though every string-level
 * forensic check passes. Fields absent on either side are ignored (never
 * penalise missing data).
 */
export function nearReferenceDivergence(
  doc: PDFMetadata,
  trusted: PDFMetadata,
): ContentDivergence {
  if (producerFamily(doc.producer) === 'unknown') return { diverged: false, fields: [] };
  if (producerFamily(doc.producer) !== producerFamily(trusted.producer)) {
    return { diverged: false, fields: [] };
  }
  if (doc.pdfVersion && trusted.pdfVersion && doc.pdfVersion !== trusted.pdfVersion) {
    return { diverged: false, fields: [] };
  }
  const fields: string[] = [];
  for (const key of ['title', 'author', 'subject'] as const) {
    const a = typeof doc[key] === 'string' ? (doc[key] as string).trim().toLowerCase() : '';
    const b =
      typeof trusted[key] === 'string' ? (trusted[key] as string).trim().toLowerCase() : '';
    if (a && b && a !== b) fields.push(key);
  }
  return { diverged: fields.length > 0, fields };
}

export interface StructuralInventory {
  objectCountEstimate: number;
}

/**
 * Near-reference structural binding: when the document claims the same
 * generator (producer family) as a trusted reference but its object inventory
 * matches NONE of the trusted inventories, the body was grafted or rebuilt.
 * Brittle by construction — a generator version change could shift counts —
 * so this stays challenger-only until calibrated on real captures.
 */
export function nearReferenceStructuralDivergence(
  doc: PDFMetadata,
  docStructural: StructuralInventory,
  trusted: PDFMetadata[],
  trustedStructurals: StructuralInventory[],
): ContentDivergence {
  if (producerFamily(doc.producer) === 'unknown') return { diverged: false, fields: [] };
  const families = new Set(trusted.map((t) => producerFamily(t.producer)));
  if (!families.has(producerFamily(doc.producer))) return { diverged: false, fields: [] };
  const knownCounts = new Set(trustedStructurals.map((s) => s.objectCountEstimate));
  if (knownCounts.has(docStructural.objectCountEstimate)) return { diverged: false, fields: [] };
  return { diverged: true, fields: ['objectCountEstimate'] };
}

export type ChampionResult = 'genuine' | 'suspicious' | 'fake';

export interface ChallengerVerdict {
  result: ChampionResult;
  confidence: number;
  challengerReasons: string[];
  changedByChallenger: boolean;
}

/**
 * Applies challenger mechanisms ON TOP of an already-computed champion
 * verdict. Monotone except for anachronism: may only downgrade
 * (genuine→suspicious), never upgrade, with one exception — a hard
 * impossibility condemns regardless of the champion. Confidence constants
 * are uncalibrated shadow values, not production thresholds.
 */
export function challengerVerdict(
  championResult: ChampionResult,
  championConfidence: number,
  doc: PDFMetadata,
  trustedMetas: PDFMetadata[],
  invariants: GenerationInvariants,
  structural?: { doc: StructuralInventory; trusted: StructuralInventory[] },
): ChallengerVerdict {
  const anachronism = checkAnachronism(doc, invariants);
  if (anachronism.anachronistic) {
    return {
      result: 'fake',
      confidence: 90,
      challengerReasons: anachronism.reasons.map((r) => `Anachronism: ${r}`),
      changedByChallenger: championResult !== 'fake',
    };
  }

  if (championResult === 'genuine' && trustedMetas.length > 0) {
    for (const trusted of trustedMetas) {
      const div = nearReferenceDivergence(doc, trusted);
      if (div.diverged) {
        return {
          result: 'suspicious',
          confidence: Math.min(championConfidence, 60),
          challengerReasons: [
            `Near-reference content divergence vs trusted generator output in: ${div.fields.join(', ')} — human review recommended (user-guidance-only, not evidence)`,
          ],
          changedByChallenger: true,
        };
      }
    }
    if (structural) {
      const sdiv = nearReferenceStructuralDivergence(
        doc,
        structural.doc,
        trustedMetas,
        structural.trusted,
      );
      if (sdiv.diverged) {
        return {
          result: 'suspicious',
          confidence: Math.min(championConfidence, 60),
          challengerReasons: [
            `Near-reference structural divergence: object inventory ${structural.doc.objectCountEstimate} matches no trusted inventory — possible graft or rebuild (user-guidance-only, not evidence)`,
          ],
          changedByChallenger: true,
        };
      }
    }
  }

  return {
    result: championResult,
    confidence: championConfidence,
    challengerReasons: [],
    changedByChallenger: false,
  };
}
