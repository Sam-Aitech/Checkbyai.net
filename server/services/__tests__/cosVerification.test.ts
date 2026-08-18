/**
 * End-to-end regression tests for the CoS authenticity chain:
 *   PDF binary -> PDFAnalyzer.extractMetadata -> COSAuthenticityChecker.check
 *
 * Regression origin: genuine Home Office CoS PDFs were reported as EDITED
 * because Dublin Core values inside rdf:Seq/rdf:Bag containers parsed as
 * absent, and because linearized PDFs were counted as re-saved.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  FOP_XMP_WITH_CONTAINERS,
  FOP_XMP_PLAIN,
  genuinePdfBinary,
  linearizedPdfBinary,
  incrementallyUpdatedPdfBinary,
} from './fixtures/cosFixtures';

const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-uploads-'));
process.env.UPLOADS_DIR = uploadsDir;

// Imported dynamically so UPLOADS_DIR is set before uploadGuard resolves it.
let PDFAnalyzer: typeof import('../pdfAnalyzer').PDFAnalyzer;
let COSAuthenticityChecker: typeof import('../cosAuthenticityChecker').COSAuthenticityChecker;

beforeAll(async () => {
  ({ PDFAnalyzer } = await import('../pdfAnalyzer'));
  ({ COSAuthenticityChecker } = await import('../cosAuthenticityChecker'));
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

describe('XMP extraction — Dublin Core RDF containers', () => {
  it('reads dc:date from an rdf:Seq container', async () => {
    const { metadata } = await checkDocument(genuinePdfBinary(), 'seq.pdf');
    expect(metadata.parsedXmp['dc:date']).toBe('2026-08-10T10:15:00Z');
  });

  it('reads dc:language from an rdf:Bag container', async () => {
    const { metadata } = await checkDocument(genuinePdfBinary(), 'bag.pdf');
    expect(metadata.parsedXmp['dc:language']).toBe('en-GB');
  });

  it('still reads plain text DC nodes', async () => {
    const { metadata } = await checkDocument(genuinePdfBinary(FOP_XMP_PLAIN), 'plain.pdf');
    expect(metadata.parsedXmp['dc:date']).toBe('2026-08-10T10:15:00Z');
    expect(metadata.parsedXmp['dc:language']).toBe('en-GB');
    expect(metadata.parsedXmp['dc:format']).toBe('application/pdf');
  });
});

describe('COSAuthenticityChecker — genuine documents must pass', () => {
  it('genuine Apache FOP CoS with RDF containers is GENUINE', async () => {
    const { result } = await checkDocument(genuinePdfBinary(), 'genuine.pdf');
    expect(result.verdict).toBe('GENUINE');
    expect(result.reason).toBeNull();
  });

  it('linearized genuine CoS is GENUINE — two startxref is standard', async () => {
    const { result } = await checkDocument(linearizedPdfBinary(), 'linearized.pdf');
    const incremental = result.checks.find(c => c.name === 'Incremental Updates');
    expect(incremental?.passed).toBe(true);
    expect(result.verdict).toBe('GENUINE');
  });

  it('reports all eight required XMP fields as present', async () => {
    const { result } = await checkDocument(genuinePdfBinary(), 'fields.pdf');
    expect(result.checks.find(c => c.name === 'XMP Fields Present')?.passed).toBe(true);
    expect(result.xmpTags['dc:date']).toBe('2026-08-10T10:15:00Z');
    expect(result.xmpTags['dc:language']).toBe('en-GB');
  });
});

describe('COSAuthenticityChecker — tampered documents must still fail', () => {
  it('a genuine incremental update (true re-save) is EDITED', async () => {
    const { result } = await checkDocument(incrementallyUpdatedPdfBinary(), 'resaved.pdf');
    expect(result.checks.find(c => c.name === 'Incremental Updates')?.passed).toBe(false);
    expect(result.verdict).toBe('EDITED');
  });

  it('a non-Apache-FOP producer is EDITED', async () => {
    const tampered = genuinePdfBinary().replace(/Apache FOP Version 2\.9/g, 'iLovePDF');
    const { result } = await checkDocument(tampered, 'ilovepdf.pdf');
    expect(result.verdict).toBe('EDITED');
  });

  it('a document with no XMP block at all is EDITED', async () => {
    const { result } = await checkDocument(genuinePdfBinary(''), 'noxmp.pdf');
    expect(result.verdict).toBe('EDITED');
  });

  it('genuinely missing DC fields are still reported missing', async () => {
    const stripped = FOP_XMP_WITH_CONTAINERS
      .replace(/<dc:date>[\s\S]*?<\/dc:date>/, '')
      .replace(/<dc:language>[\s\S]*?<\/dc:language>/, '');
    const { result } = await checkDocument(genuinePdfBinary(stripped), 'stripped.pdf');
    const fields = result.checks.find(c => c.name === 'XMP Fields Present');
    expect(fields?.passed).toBe(false);
    expect(fields?.detail).toContain('dc:date');
  });
});
