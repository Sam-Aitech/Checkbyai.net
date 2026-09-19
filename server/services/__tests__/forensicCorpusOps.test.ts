/**
 * Operator unit tests — corpus generator building blocks.
 *
 * Pure string surgery only (no file I/O, no UPLOADS_DIR). The two tests that
 * assert gate behaviour (bypass vs detection) run the real
 * COSAuthenticityChecker over metadata extracted via a temp uploads dir —
 * same pattern as cosVerification.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ALL_OPERATORS,
  REDTEAM_OPERATORS,
  SYNTHETIC_OPERATORS,
  createRng,
  findOperator,
} from '../forensicCorpusOps';
import { genuinePdfBinary } from './fixtures/cosFixtures';

const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-ops-uploads-'));
process.env.UPLOADS_DIR = uploadsDir;

let PDFAnalyzer: typeof import('../pdfAnalyzer').PDFAnalyzer;
let COSAuthenticityChecker: typeof import('../cosAuthenticityChecker').COSAuthenticityChecker;

beforeAll(async () => {
  ({ PDFAnalyzer } = await import('../pdfAnalyzer'));
  ({ COSAuthenticityChecker } = await import('../cosAuthenticityChecker'));
});

afterAll(() => fs.rmSync(uploadsDir, { recursive: true, force: true }));

async function gateVerdict(binary: string, name: string): Promise<string> {
  const filePath = path.join(uploadsDir, name);
  fs.writeFileSync(filePath, Buffer.from(binary, 'binary'));
  const metadata = await new PDFAnalyzer().extractMetadata(filePath);
  return new COSAuthenticityChecker().check(binary, metadata).verdict;
}

describe('catalogue', () => {
  it('has 14 synthetic + 4 red-team operators, all with unique ids', () => {
    expect(SYNTHETIC_OPERATORS).toHaveLength(14);
    expect(REDTEAM_OPERATORS).toHaveLength(4);
    expect(ALL_OPERATORS).toHaveLength(18);
    const ids = ALL_OPERATORS.map((op) => op.opId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('findOperator resolves every catalogue id', () => {
    for (const op of ALL_OPERATORS) expect(findOperator(op.opId)).toBe(op);
    expect(findOperator('no-such-op')).toBeUndefined();
  });
});

describe('determinism', () => {
  it('same (input, seed) → same output for every operator', () => {
    const seed = genuinePdfBinary();
    for (const op of ALL_OPERATORS) {
      const a = op.apply(seed, createRng(42));
      const b = op.apply(seed, createRng(42));
      expect(a.binary, op.opId).toBe(b.binary);
      expect(a.skipped, op.opId).toBe(b.skipped);
    }
  });

  it('rng-dependent operators vary across seeds', () => {
    const seed = genuinePdfBinary();
    const tools = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map(
        (s) => findOperator('tool-spoof')!.apply(seed, createRng(s)).params.tool,
      ),
    );
    expect(tools.size).toBeGreaterThan(1);
  });
});

describe('synthetic operators apply cleanly to the canonical seed', () => {
  it('every synthetic operator changes bytes without skipping', () => {
    const seed = genuinePdfBinary();
    for (const op of SYNTHETIC_OPERATORS) {
      const result = op.apply(seed, createRng(42));
      expect(result.skipped, op.opId).toBe(false);
      expect(result.binary === seed, op.opId).toBe(false);
    }
  });

  it('tag-dependent operators skip honestly on garbage input', () => {
    const garbage = 'not a pdf at all';
    for (const opId of ['xmp-value-swap', 'xmp-field-drop', 'metadata-strip', 'rt-content-swap']) {
      const result = findOperator(opId)!.apply(garbage, createRng(42));
      expect(result.skipped, opId).toBe(true);
      expect(result.binary, opId).toBe(garbage);
    }
  });
});

describe('gate behaviour — detection holds where expected', () => {
  it('incremental-append is EDITED with a Prev chain', async () => {
    const seed = genuinePdfBinary();
    const { binary } = findOperator('incremental-append')!.apply(seed, createRng(42));
    expect(await gateVerdict(binary, 'incr.pdf')).toBe('EDITED');
    const features = new PDFAnalyzer().extractStructuralFeatures(binary);
    expect(features.hasPrevChain).toBe(true);
    expect(features.incrementalUpdatesAboveBaseline).toBeGreaterThanOrEqual(1);
  });

  it('tool-spoof is EDITED', async () => {
    const seed = genuinePdfBinary();
    const { binary } = findOperator('tool-spoof')!.apply(seed, createRng(1));
    expect(await gateVerdict(binary, 'spoof.pdf')).toBe('EDITED');
  });

  it('metadata-strip is EDITED', async () => {
    const seed = genuinePdfBinary();
    const { binary } = findOperator('metadata-strip')!.apply(seed, createRng(42));
    expect(await gateVerdict(binary, 'stripped-op.pdf')).toBe('EDITED');
  });
});

describe('gate behaviour — red-team bypass baseline (the exhibit)', () => {
  it('rt-content-swap passes the gate (semantic change, invisible)', async () => {
    const seed = genuinePdfBinary();
    const { binary, skipped } = findOperator('rt-content-swap')!.apply(seed, createRng(42));
    expect(skipped).toBe(false);
    expect(await gateVerdict(binary, 'rt-content.pdf')).toBe('GENUINE');
  });

  it('rt-hidden-object passes the gate but moves the object count', async () => {
    const seed = genuinePdfBinary();
    const { binary, skipped } = findOperator('rt-hidden-object')!.apply(seed, createRng(42));
    expect(skipped).toBe(false);
    expect(await gateVerdict(binary, 'rt-hidden.pdf')).toBe('GENUINE');
    const analyzer = new PDFAnalyzer();
    const before = analyzer.extractStructuralFeatures(seed).objectCountEstimate;
    const after = analyzer.extractStructuralFeatures(binary).objectCountEstimate;
    expect(after).toBe(before + 1);
  });

  it('rt-date-clone passes the gate (consistent backdate, invisible)', async () => {
    const seed = genuinePdfBinary();
    const { binary, skipped } = findOperator('rt-date-clone')!.apply(seed, createRng(42));
    expect(skipped).toBe(false);
    expect(await gateVerdict(binary, 'rt-date.pdf')).toBe('GENUINE');
  });
});
