/**
 * Phase 2 robustness matrix — pure comparison logic (no I/O, no PDF parsing).
 *
 * For each (structural feature × synthetic operator) cell we compare the
 * feature value on the genuine seed against the derived case and classify:
 *
 * - `stable-robust`: no movement, none expected — the signal is not spoofable
 *   by this operator. This is the tamper-resistance property Phase 2 seeks.
 * - `sensitive`: moved, and the operator was supposed to move it — the signal
 *   detects the structural change it claims to measure.
 * - `side-effect`: moved, but not expected — needs human reading; may be a
 *   true detection (good) or unwanted coupling (bad). Never auto-judged.
 * - `blind`: expected to move, didn't — the signal misses its target. A gap.
 * - `volatile`: `fileSizeBytes` / `wholeFileEntropyBitsPerByte` move on almost
 *   any byte change by construction — tamper-evident, not tamper-specific.
 *   Reported, never scored.
 * - `rebuild`: `image-only-rebuild` replaces the whole file, so per-feature
 *   stability is meaningless there. Column excluded from scores, reported
 *   separately as a baseline-reset case.
 *
 * The matrix — not accuracy — is the patent-relevant artefact.
 */

import type { StructuralFeatures } from './forensicTypes';

/** Scored structural fields (schemaVersion excluded — constant by design). */
export const MATRIX_FEATURES = [
  'startxrefCount',
  'isLinearized',
  'incrementalUpdatesAboveBaseline',
  'xrefSectionCount',
  'hasPrevChain',
  'objectCountEstimate',
  'streamCount',
  'streamLengthMismatchCount',
  'fontCountEstimate',
  'hasUnembeddedFont',
  'textBlockCount',
  'textOperatorCount',
] as const;

export type MatrixFeature = (typeof MATRIX_FEATURES)[number];

/** Move on any byte change by construction — reported, never scored. */
export const VOLATILE_FEATURES = ['fileSizeBytes', 'wholeFileEntropyBitsPerByte'] as const;

export const ALL_MATRIX_FIELDS = [...MATRIX_FEATURES, ...VOLATILE_FEATURES] as const;

export type MatrixField = (typeof ALL_MATRIX_FIELDS)[number];

/**
 * Features each operator is SUPPOSED to move. Everything else moving is a
 * side-effect (to be read, not auto-judged); everything listed here NOT
 * moving is blindness. Calibrated against the operator implementations in
 * forensicCorpusOps.ts — update together.
 */
export const EXPECTED_MOVES: Readonly<Record<string, readonly MatrixFeature[]>> = {
  'xmp-value-swap': [],
  'xmp-field-drop': [],
  'xmp-order-shuffle': [],
  'xmp-rebuild': [],
  'info-producer-spoof': [],
  'tool-spoof': [],
  'date-skew': [],
  'history-inject': [],
  'xref-rebuild': ['xrefSectionCount'],
  'incremental-append': [
    'startxrefCount',
    'incrementalUpdatesAboveBaseline',
    'hasPrevChain',
    'objectCountEstimate',
  ],
  'linearize-toggle': ['isLinearized'],
  'metadata-strip': [],
  'print-to-pdf': [],
  // image-only-rebuild handled as REBUILD — no per-feature expectations.
};

export type CellClass =
  | 'stable-robust'
  | 'sensitive'
  | 'side-effect'
  | 'blind'
  | 'volatile'
  | 'rebuild';

export function classifyCell(opId: string, field: string, moved: boolean): CellClass {
  if ((VOLATILE_FEATURES as readonly string[]).includes(field)) return 'volatile';
  if (opId === 'image-only-rebuild') return 'rebuild';
  const expected = EXPECTED_MOVES[opId] ?? [];
  if (moved) return (expected as readonly string[]).includes(field) ? 'sensitive' : 'side-effect';
  return (expected as readonly string[]).includes(field) ? 'blind' : 'stable-robust';
}

export interface FeatureDelta {
  field: MatrixField;
  baseline: number | boolean;
  derived: number | boolean;
  moved: boolean;
}

/** Exact-equality diff over all matrix fields (features are deterministic). */
export function diffFeatures(
  baseline: StructuralFeatures,
  derived: StructuralFeatures,
): FeatureDelta[] {
  return ALL_MATRIX_FIELDS.map((field) => {
    const b = baseline[field] as number | boolean;
    const d = derived[field] as number | boolean;
    return { field, baseline: b, derived: d, moved: b !== d };
  });
}

export interface MatrixCell extends FeatureDelta {
  seedId: string;
  operator: string;
  class: CellClass;
}

export interface MatrixScores {
  /** stable-robust / scored cells (volatile + rebuild excluded). */
  robustness: number;
  /** sensitive / (sensitive + blind). Null when no expectations apply. */
  sensitivity: number | null;
  scoredCells: number;
  counts: Record<CellClass, number>;
  /** Per-feature stability fraction (stable-robust / scored appearances). */
  perFeature: Record<string, number>;
  /** Per-operator stability fraction over scored, non-rebuild cells. */
  perOperator: Record<string, number | null>;
}

export function scoreMatrix(cells: MatrixCell[]): MatrixScores {
  const counts: Record<CellClass, number> = {
    'stable-robust': 0,
    sensitive: 0,
    'side-effect': 0,
    blind: 0,
    volatile: 0,
    rebuild: 0,
  };
  for (const c of cells) counts[c.class]++;

  const scored = cells.filter((c) => c.class !== 'volatile' && c.class !== 'rebuild');
  const robustness =
    scored.length === 0 ? 1 : scored.filter((c) => c.class === 'stable-robust').length / scored.length;

  const targetCells = cells.filter((c) => c.class === 'sensitive' || c.class === 'blind');
  const sensitivity =
    targetCells.length === 0
      ? null
      : targetCells.filter((c) => c.class === 'sensitive').length / targetCells.length;

  const perFeature: Record<string, number> = {};
  for (const f of MATRIX_FEATURES) {
    const col = scored.filter((c) => c.field === f);
    perFeature[f] =
      col.length === 0 ? 1 : col.filter((c) => c.class === 'stable-robust').length / col.length;
  }

  const perOperator: Record<string, number | null> = {};
  for (const op of new Set(cells.map((c) => c.operator))) {
    if (op === 'image-only-rebuild') {
      perOperator[op] = null;
      continue;
    }
    const col = scored.filter((c) => c.operator === op);
    perOperator[op] =
      col.length === 0 ? null : col.filter((c) => c.class === 'stable-robust').length / col.length;
  }

  return { robustness, sensitivity, scoredCells: scored.length, counts, perFeature, perOperator };
}
