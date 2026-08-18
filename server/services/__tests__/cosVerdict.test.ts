/**
 * Regression tests for verdict assembly in PDFAnalyzer.analyzeAgainstTrustedPatterns.
 *
 * Regression origin (production rule id 4, 2026-03-03): an admin marking any
 * single document fake auto-created a `hitl-override` rule, and every rule of
 * that category was then treated as relevant to EVERY document and injected as
 * a `critical` check — forcing a fake verdict on all subsequent verifications.
 */
import { describe, it, expect } from 'vitest';
import { PDFAnalyzer, type PDFMetadata } from '../pdfAnalyzer';

const analyzer = new PDFAnalyzer();

/** A clean, genuine UK Home Office CoS: Apache FOP, no edits, no anomalies. */
const genuineCos = (overrides: Partial<PDFMetadata> = {}): PDFMetadata => ({
  fileSize: 84210,
  pages: 2,
  format: 'application/pdf',
  fonts: ['Helvetica'],
  fontCount: 1,
  isEncrypted: false,
  hasDigitalSignature: false,
  producer: 'Apache FOP Version 2.9',
  creator: 'Apache FOP Version 2.9',
  creationDate: 'D:20260810101500Z',
  modificationDate: 'D:20260810101500Z',
  pdfVersion: '1.4',
  xmp_tags: { 'xmpMM:History': [] },
  ...overrides,
} as PDFMetadata);

/** The rule shape auto-created by the admin fake-override handler. */
const hitlOverrideRule = (producer = 'Apache FOP Version 2.3') => ({
  category: 'hitl-override',
  ruleText:
    `CRITICAL ADMIN OVERRIDE [2026-03-03]: Document initially verified as 'genuine' (90% confidence) ` +
    `was confirmed FAKE by a human expert.\nProducer: ${producer}\n` +
    `Admin reasoning: No DC:data available in XMP tags = 100% edited.\n` +
    `Action required: Apply heightened scrutiny to documents with similar metadata patterns.`,
  priority: 100,
});

const analyse = (metadata: PDFMetadata, globalRules: any[] = [], hitlKnowledge: any[] = []) =>
  analyzer.analyzeAgainstTrustedPatterns(metadata, [], { globalRules, hitlKnowledge });

describe('baseline', () => {
  it('a clean genuine CoS with no admin context is genuine', async () => {
    expect((await analyse(genuineCos())).result).toBe('genuine');
  });
});

describe('admin rules must not single-handedly condemn a document', () => {
  it('an unrelated hitl-override rule does not make a genuine CoS fake', async () => {
    const r = await analyse(genuineCos(), [hitlOverrideRule()]);
    expect(r.result).toBe('genuine');
  });

  it('a rule about a different producer is not treated as relevant', async () => {
    const r = await analyse(genuineCos(), [
      { category: 'red_flag', ruleText: 'Flag documents produced by Canva.', priority: 50 },
    ]);
    expect(r.checks.some(c => c.name.startsWith('Admin Rule'))).toBe(false);
    expect(r.result).toBe('genuine');
  });

  it('an unextractable Producer does not make every rule match', async () => {
    const r = await analyse(
      genuineCos({ producer: undefined, creator: undefined } as Partial<PDFMetadata>),
      [
        { category: 'red_flag', ruleText: 'Flag documents produced by Canva.', priority: 50 },
        { category: 'metadata_check', ruleText: 'No DC:data in XMP tags is a red flag.', priority: 10 },
      ],
    );
    expect(r.checks.some(c => c.name.startsWith('Admin Rule'))).toBe(false);
    expect(r.result).not.toBe('fake');
  });

  it('a past Apache FOP fake does not condemn every Apache FOP CoS', async () => {
    const r = await analyse(genuineCos(), [], [
      {
        filename: 'forged.pdf',
        result: 'fake',
        confidence: 20,
        adminFeedback: 'Employer name altered',
        metadata: { producer: 'Apache FOP Version 2.7' },
      },
    ]);
    expect(r.result).toBe('genuine');
  });
});

describe('admin rules must still influence the outcome', () => {
  it('a rule naming this document\'s producer is surfaced as a warning', async () => {
    const r = await analyse(genuineCos(), [
      { category: 'red_flag', ruleText: 'Documents from Apache FOP Version 2.9 need review.', priority: 50 },
    ]);
    const injected = r.checks.find(c => c.name.startsWith('Admin Rule'));
    expect(injected).toBeDefined();
    expect((injected as any).severity).toBe('warning');
    expect(r.result).not.toBe('fake');
  });

  it('rules addressed to all documents still apply', async () => {
    const r = await analyse(genuineCos(), [
      { category: 'policy', ruleText: 'Apply extra scrutiny to all documents this quarter.', priority: 20 },
    ]);
    expect(r.checks.some(c => c.name.startsWith('Admin Rule'))).toBe(true);
  });

  it('two admin warnings together downgrade the verdict to suspicious', async () => {
    const r = await analyse(genuineCos(), [
      { category: 'red_flag', ruleText: 'Documents from Apache FOP Version 2.9 need review.', priority: 50 },
      { category: 'policy',   ruleText: 'Apply extra scrutiny to all documents this quarter.', priority: 20 },
    ]);
    expect(r.result).toBe('suspicious');
  });
});

describe('genuine fraud signals still produce a fake verdict', () => {
  it('image editing software in the producer is fake', async () => {
    const r = await analyse(genuineCos({ producer: 'Adobe Photoshop 25.0' }));
    expect(r.result).toBe('fake');
  });

  it('a modification date before the creation date is fake', async () => {
    const r = await analyse(genuineCos({
      creationDate: 'D:20260810101500Z',
      modificationDate: 'D:20260709101500Z',
    }));
    expect(r.result).toBe('fake');
  });
});

describe('unverifiable documents must not pass as genuine', () => {
  it('a document with no Producer metadata is suspicious, not genuine', async () => {
    const r = await analyse(genuineCos({ producer: undefined, creator: undefined } as Partial<PDFMetadata>));
    expect(r.result).toBe('suspicious');
    expect(r.checks.some(c => c.name === 'Known Producer' && !c.passed)).toBe(true);
  });

  it('a document whose metadata extraction failed is suspicious, not genuine', async () => {
    const r = await analyse({ fileSize: 0, pages: 0, xmp_tags: {}, error: 'Unexpected end of file' } as unknown as PDFMetadata);
    expect(r.result).toBe('suspicious');
    expect(r.checks.some(c => c.name === 'Metadata Extraction' && !c.passed)).toBe(true);
  });

  it('an unreadable document is not double-penalised', async () => {
    const r = await analyse({ fileSize: 0, pages: 0, xmp_tags: {}, error: 'boom' } as unknown as PDFMetadata);
    expect(r.checks.filter(c => !c.passed)).toHaveLength(1);
  });
});
