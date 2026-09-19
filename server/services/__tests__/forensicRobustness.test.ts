/**
 * Unit tests for the Phase 2 cell classifier + scorer.
 * Pure logic — no fixtures, no file I/O.
 */
import { describe, it, expect } from 'vitest';
import {
  ALL_MATRIX_FIELDS,
  EXPECTED_MOVES,
  MATRIX_FEATURES,
  classifyCell,
  diffFeatures,
  scoreMatrix,
  type MatrixCell,
} from '../forensicRobustness';
import { emptyStructuralFeatures } from '../forensicTypes';

// Test-only helper lives here (not in the module) to keep the module free of
// non-production code.
function emptyBaseline() {
  return emptyStructuralFeatures();
}

describe('field catalogue', () => {
  it('covers every scored structural field exactly once', () => {
    expect(new Set(ALL_MATRIX_FIELDS).size).toBe(ALL_MATRIX_FIELDS.length);
    expect(ALL_MATRIX_FIELDS).toContain('objectCountEstimate');
    expect(ALL_MATRIX_FIELDS).not.toContain('schemaVersion');
  });

  it('every synthetic operator except image-only-rebuild has an expectation entry', () => {
    const ops = [
      'xmp-value-swap', 'xmp-field-drop', 'xmp-order-shuffle', 'xmp-rebuild',
      'info-producer-spoof', 'tool-spoof', 'date-skew', 'history-inject',
      'xref-rebuild', 'incremental-append', 'linearize-toggle',
      'metadata-strip', 'print-to-pdf',
    ];
    for (const op of ops) expect(EXPECTED_MOVES[op], op).toBeDefined();
  });
});

describe('classifyCell', () => {
  it('string-only operator, nothing moved → stable-robust', () => {
    expect(classifyCell('tool-spoof', 'objectCountEstimate', false)).toBe('stable-robust');
  });

  it('expected structural move → sensitive', () => {
    expect(classifyCell('incremental-append', 'hasPrevChain', true)).toBe('sensitive');
    expect(classifyCell('xref-rebuild', 'xrefSectionCount', true)).toBe('sensitive');
    expect(classifyCell('linearize-toggle', 'isLinearized', true)).toBe('sensitive');
  });

  it('unexpected move → side-effect (read, never auto-judged)', () => {
    expect(classifyCell('tool-spoof', 'objectCountEstimate', true)).toBe('side-effect');
  });

  it('expected move absent → blind', () => {
    expect(classifyCell('incremental-append', 'hasPrevChain', false)).toBe('blind');
  });

  it('volatile fields are never scored', () => {
    expect(classifyCell('tool-spoof', 'fileSizeBytes', true)).toBe('volatile');
    expect(classifyCell('tool-spoof', 'fileSizeBytes', false)).toBe('volatile');
    expect(classifyCell('incremental-append', 'wholeFileEntropyBitsPerByte', true)).toBe('volatile');
  });

  it('image-only-rebuild column is always rebuild', () => {
    expect(classifyCell('image-only-rebuild', 'objectCountEstimate', true)).toBe('rebuild');
    expect(classifyCell('image-only-rebuild', 'objectCountEstimate', false)).toBe('rebuild');
    expect(classifyCell('image-only-rebuild', 'fileSizeBytes', true)).toBe('volatile');
  });
});

describe('diffFeatures', () => {
  it('identical features → nothing moved', () => {
    const deltas = diffFeatures(emptyBaseline(), emptyBaseline());
    expect(deltas.every((d) => !d.moved)).toBe(true);
    expect(deltas).toHaveLength(ALL_MATRIX_FIELDS.length);
  });

  it('detects single-field movement exactly', () => {
    const derived = { ...emptyBaseline(), objectCountEstimate: 5 };
    const deltas = diffFeatures(emptyBaseline(), derived);
    const moved = deltas.filter((d) => d.moved);
    expect(moved).toHaveLength(1);
    expect(moved[0].field).toBe('objectCountEstimate');
    expect(moved[0].baseline).toBe(0);
    expect(moved[0].derived).toBe(5);
  });
});

describe('scoreMatrix', () => {
  const cell = (overrides: Partial<MatrixCell>): MatrixCell => ({
    seedId: 's',
    operator: 'tool-spoof',
    field: 'objectCountEstimate',
    baseline: 1,
    derived: 1,
    moved: false,
    class: 'stable-robust',
    ...overrides,
  });

  it('perfect stability scores robustness 1', () => {
    const cells = MATRIX_FEATURES.map((f) => cell({ field: f }));
    const scores = scoreMatrix(cells);
    expect(scores.robustness).toBe(1);
    expect(scores.sensitivity).toBeNull();
  });

  it('excludes volatile + rebuild from scoring, counts them separately', () => {
    const cells = [
      cell({}),
      cell({ field: 'fileSizeBytes', class: 'volatile', moved: true }),
      cell({ operator: 'image-only-rebuild', class: 'rebuild', moved: true }),
    ];
    const scores = scoreMatrix(cells);
    expect(scores.scoredCells).toBe(1);
    expect(scores.robustness).toBe(1);
    expect(scores.counts.volatile).toBe(1);
    expect(scores.counts.rebuild).toBe(1);
  });

  it('sensitivity reflects caught vs missed expectations', () => {
    const cells = [
      cell({ operator: 'incremental-append', field: 'hasPrevChain', class: 'sensitive', moved: true }),
      cell({ operator: 'incremental-append', field: 'startxrefCount', class: 'blind', moved: false }),
    ];
    expect(scoreMatrix(cells).sensitivity).toBe(0.5);
  });
});
