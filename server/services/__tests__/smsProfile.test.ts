/**
 * SMS 17-gate regression tests — the strict UK Home Office profile.
 *
 *   PDF binary -> PDFAnalyzer.extractMetadata -> COSAuthenticityChecker.check
 *
 * Ground truth: docs/FORENSIC_CORPUS.md + the SMS audit brief (17 ordered
 * checks, exact FOP 2.3, x-unknown, to-the-second timezone-aware timestamp
 * equality, soft statistics where only zero-text fails).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  FOP_XMP_PLAIN,
  FOP_XMP_WITH_CONTAINERS,
  genuinePdfBinary,
  linearizedPdfBinary,
  incrementallyUpdatedPdfBinary,
} from './fixtures/cosFixtures';

const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sms-uploads-'));
process.env.UPLOADS_DIR = uploadsDir;

// Imported dynamically so UPLOADS_DIR is set before uploadGuard resolves it.
let PDFAnalyzer: typeof import('../pdfAnalyzer').PDFAnalyzer;
let checkerModule: typeof import('../cosAuthenticityChecker');
let COSAuthenticityChecker: typeof import('../cosAuthenticityChecker').COSAuthenticityChecker;

beforeAll(async () => {
  ({ PDFAnalyzer } = await import('../pdfAnalyzer'));
  checkerModule = await import('../cosAuthenticityChecker');
  ({ COSAuthenticityChecker } = checkerModule);
});

afterAll(() => fs.rmSync(uploadsDir, { recursive: true, force: true }));

/** Writes a PDF into the uploads dir and runs the full analyse + check chain. */
async function checkDocument(binary: string, name: string) {
  const filePath = path.join(uploadsDir, name);
  fs.writeFileSync(filePath, Buffer.from(binary, 'binary'));
  const metadata = await new PDFAnalyzer().extractMetadata(filePath);
  const result = new COSAuthenticityChecker().check(binary, metadata);
  return { metadata, result };
}

function failedIds(result: { checks: Array<{ checkId?: string; passed: boolean }> }): string[] {
  return result.checks.filter((c) => !c.passed).map((c) => c.checkId ?? '?');
}

describe('gate shape', () => {
  it('emits exactly 17 ordered rows with stable checkIds', async () => {
    const { result } = await checkDocument(genuinePdfBinary(), 'shape.pdf');
    expect(result.checks).toHaveLength(17);
    expect(result.checks.map((c) => c.checkId)).toEqual(
      Array.from({ length: 17 }, (_, i) => `check-${String(i + 1).padStart(2, '0')}`),
    );
  });
});

describe('genuine SMS output passes 17/17', () => {
  it('container-form XMP is GENUINE with null reason', async () => {
    const { result } = await checkDocument(genuinePdfBinary(), 'genuine.pdf');
    expect(result.verdict).toBe('GENUINE');
    expect(result.reason).toBeNull();
    expect(failedIds(result)).toEqual([]);
  });

  it('plain-text DC nodes are GENUINE', async () => {
    const { result } = await checkDocument(genuinePdfBinary(FOP_XMP_PLAIN), 'plain.pdf');
    expect(result.verdict).toBe('GENUINE');
  });

  it('linearized genuine CoS is GENUINE (revisions are not judged by this gate)', async () => {
    const { result } = await checkDocument(linearizedPdfBinary(), 'linearized.pdf');
    expect(result.verdict).toBe('GENUINE');
  });

  it('incremental revision preserving the profile is GENUINE here (topology lives in the evidence layer)', async () => {
    const { result } = await checkDocument(incrementallyUpdatedPdfBinary(), 'resaved.pdf');
    expect(result.verdict).toBe('GENUINE');
  });
});

describe('exact-match strictness', () => {
  it('consumer tool producer fails exactly checks 4, 5, 14, 16 — dates still pass', async () => {
    const tampered = genuinePdfBinary().split('Apache FOP Version 2.3').join('iLovePDF');
    const { result } = await checkDocument(tampered, 'ilovepdf.pdf');
    expect(result.verdict).toBe('EDITED');
    expect(failedIds(result).sort()).toEqual(['check-04', 'check-05', 'check-14', 'check-16']);
  });

  it('FOP version drift (2.3 → 2.9) fails the exact-match checks', async () => {
    const tampered = genuinePdfBinary().split('Apache FOP Version 2.3').join('Apache FOP Version 2.9');
    const { result } = await checkDocument(tampered, 'drift.pdf');
    expect(result.verdict).toBe('EDITED');
    expect(failedIds(result)).toContain('check-05');
    expect(failedIds(result)).toContain('check-14');
  });

  it('modern header version fails check 3', async () => {
    const tampered = genuinePdfBinary().replace('%PDF-1.4', '%PDF-1.7');
    const { result } = await checkDocument(tampered, 'v17.pdf');
    expect(failedIds(result)).toContain('check-03');
    expect(result.verdict).toBe('EDITED');
  });

  it('en-GB in place of x-unknown fails check 12 (no fallback masking)', async () => {
    const tampered = genuinePdfBinary().replace('x-unknown', 'en-GB');
    const { result } = await checkDocument(tampered, 'lang.pdf');
    expect(failedIds(result)).toContain('check-12');
  });
});

describe('timestamp logic (instants, not strings)', () => {
  it('offset Info date equals UTC XMP instant — string comparison would fail this', async () => {
    // Info 22:59:56+01:00 IS 21:59:56Z. String comparison fails this; instant comparison passes.
    const bst = genuinePdfBinary()
      .split('(D:20250708215956Z)')
      .join("(D:20250708225956+01'00')");
    const { result } = await checkDocument(bst, 'bst.pdf');
    expect(failedIds(result)).not.toContain('check-15');
    expect(failedIds(result)).not.toContain('check-17');
    expect(result.verdict).toBe('GENUINE');
  });

  it('MetadataDate later than CreateDate fails check 17 as post-issuance alteration', async () => {
    const tampered = genuinePdfBinary(FOP_XMP_WITH_CONTAINERS.replace(
      /<xmp:MetadataDate>.*?<\/xmp:MetadataDate>/,
      '<xmp:MetadataDate>2025-07-08T22:05:00Z</xmp:MetadataDate>',
    ));
    const { result } = await checkDocument(tampered, 'metadate.pdf');
    expect(failedIds(result)).toContain('check-17');
    expect(result.checks.find((c) => c.checkId === 'check-17')!.detail).toMatch(/post-issuance/i);
    expect(result.verdict).toBe('EDITED');
  });

  it('xmp:CreateDate differing from CreationDate fails check 15', async () => {
    const tampered = genuinePdfBinary(FOP_XMP_WITH_CONTAINERS.replace(
      /<xmp:CreateDate>.*?<\/xmp:CreateDate>/,
      '<xmp:CreateDate>2025-01-15T21:59:56Z</xmp:CreateDate>',
    ));
    const { result } = await checkDocument(tampered, 'createdate.pdf');
    expect(failedIds(result)).toContain('check-15');
  });
});

describe('XMP absence and order', () => {
  it('no XMP block fails exactly checks 10–17', async () => {
    const { result } = await checkDocument(genuinePdfBinary(''), 'noxmp.pdf');
    expect(result.verdict).toBe('EDITED');
    expect(failedIds(result).sort()).toEqual([
      'check-10', 'check-11', 'check-12', 'check-13',
      'check-14', 'check-15', 'check-16', 'check-17',
    ]);
  });

  it('genuinely missing dc:language is reported on check 12', async () => {
    const stripped = FOP_XMP_WITH_CONTAINERS.replace(/<dc:language>[\s\S]*?<\/dc:language>/, '');
    const { result } = await checkDocument(genuinePdfBinary(stripped), 'stripped.pdf');
    expect(failedIds(result)).toContain('check-12');
  });

  it('reordered XMP blocks fail the misplaced fields with sequence detail', async () => {
    const blocks = FOP_XMP_WITH_CONTAINERS.match(/<rdf:Description[\s\S]*?<\/rdf:Description>/g)!;
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    const shuffled = FOP_XMP_WITH_CONTAINERS
      .replace(blocks[0], '\u0001')
      .replace(blocks[1], blocks[0])
      .replace('\u0001', blocks[1]);
    const { result } = await checkDocument(genuinePdfBinary(shuffled), 'shuffled.pdf');
    expect(result.verdict).toBe('EDITED');
    const orderFails = result.checks.filter((c) => !c.passed && /sequence/i.test(c.detail));
    expect(orderFails.length).toBeGreaterThan(0);
    // Still exactly 17 rows — order folds into field rows, never adds one.
    expect(result.checks).toHaveLength(17);
  });
});

describe('soft statistics triage', () => {
  it('thin but non-empty text body warns only — verdict stays GENUINE', async () => {
    const thin = genuinePdfBinary().replace(/\(CoS record .*?\) Tj/g, '(CoS) Tj');
    const { result } = await checkDocument(thin, 'thin.pdf');
    expect(result.verdict).toBe('GENUINE');
    expect(result.checks.filter((c) => !c.passed)).toHaveLength(0);
  });
});

describe('parseDocInstant', () => {
  it('reads Z, explicit offsets, and missing-tz (UTC assumption)', () => {
    const { parseDocInstant } = checkerModule;
    expect(parseDocInstant('D:20250708215956Z')).toBe(Date.parse('2025-07-08T21:59:56Z'));
    expect(parseDocInstant("D:20250708225956+01'00'")).toBe(Date.parse('2025-07-08T21:59:56Z'));
    expect(parseDocInstant('D:20250708165956-0500')).toBe(Date.parse('2025-07-08T21:59:56Z'));
    expect(parseDocInstant('D:20250708215956')).toBe(Date.parse('2025-07-08T21:59:56Z'));
    expect(parseDocInstant('2025-07-08T21:59:56Z')).toBe(Date.parse('2025-07-08T21:59:56Z'));
  });

  it('returns null for garbage', () => {
    const { parseDocInstant } = checkerModule;
    expect(parseDocInstant(undefined)).toBeNull();
    expect(parseDocInstant('not a date')).toBeNull();
    expect(parseDocInstant('D:20')).toBeNull();
  });
});
