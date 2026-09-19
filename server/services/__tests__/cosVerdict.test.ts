/**
 * Regression tests for verdict assembly in PDFAnalyzer.analyzeAgainstTrustedPatterns.
 *
 * Regression origin (production rule id 4, 2026-03-03): an admin marking any
 * single document fake auto-created a `hitl-override` rule, and every rule of
 * that category was then treated as relevant to EVERY document and injected as
 * a `critical` check — forcing a fake verdict on all subsequent verifications.
 */
import { describe, it, expect } from 'vitest';
import {
  PDFAnalyzer,
  parseAdminSignal,
  storedFailedCheckIds,
  type PDFMetadata,
} from '../pdfAnalyzer';

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

const analyse = (
  metadata: PDFMetadata,
  globalRules: any[] = [],
  hitlKnowledge: any[] = [],
  currentFailedCheckIds: string[] = [],
) =>
  analyzer.analyzeAgainstTrustedPatterns(metadata, [], { globalRules, hitlKnowledge, currentFailedCheckIds });

/** Auto-created rule shape with a machine signal block (see admin.ts flag handler). */
const signalRule = (ids = 'check-15, check-17', family = 'apache-fop') => ({
  category: 'hitl-override',
  ruleText:
    `ADMIN NOTE [2026-09-14]: Document initially verified as 'suspicious' (50% confidence) was confirmed FAKE by a human expert.\n` +
    `Producer: Apache FOP Version 2.3\n` +
    `Admin reasoning: creationdate & moddate is different.\n` +
    `Applies to documents failing the same checks; otherwise displayed as context only.\n` +
    `Signal(check-ids): ${ids}\n` +
    `Signal(producer-family): ${family}`,
  priority: 100,
});

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

describe('admin notes are display-only context', () => {
  it('a rule naming this document\'s producer is surfaced as an advisory note', async () => {
    const r = await analyse(genuineCos(), [
      { category: 'red_flag', ruleText: 'Documents from Apache FOP Version 2.9 need review.', priority: 50 },
    ]);
    const injected = r.checks.find(c => c.name.startsWith('Admin Note'));
    expect(injected).toBeDefined();
    expect((injected as any).severity).toBe('warning');
    expect((injected as any).kind).toBe('advisory');
    expect(r.result).toBe('genuine');
  });

  it('admin notes never move confidence or verdict, however many match', async () => {
    const r = await analyse(genuineCos(), [
      { category: 'red_flag', ruleText: 'Documents from Apache FOP Version 2.9 need review.', priority: 50 },
      { category: 'policy',   ruleText: 'Apply extra scrutiny to all documents this quarter.', priority: 20 },
    ]);
    expect(r.result).toBe('genuine');
    expect(r.confidence).toBe(100);
    expect(r.checks.filter(c => (c as any).kind === 'advisory')).toHaveLength(2);
  });

  it('rules addressed to all documents still apply as notes', async () => {
    const r = await analyse(genuineCos(), [
      { category: 'policy', ruleText: 'Apply extra scrutiny to all documents this quarter.', priority: 20 },
    ]);
    expect(r.checks.some(c => c.name.startsWith('Admin Note'))).toBe(true);
    expect(r.result).toBe('genuine');
  });

  it('duplicate rules collapse to a single note row', async () => {
    const dup = { category: 'red_flag', ruleText: 'Documents from Apache FOP Version 2.9 need review.', priority: 50 };
    const r = await analyse(genuineCos(), [dup, { ...dup }]);
    expect(r.checks.filter(c => c.name.startsWith('Admin Note'))).toHaveLength(1);
    expect(r.result).toBe('genuine');
  });

  it('duplicate HITL cases collapse to a single note row with no penalty', async () => {
    const hitlCase = {
      filename: 'forged.pdf',
      result: 'fake',
      confidence: 20,
      adminFeedback: 'Employer name altered',
      metadata: { producer: 'Apache FOP Version 2.3' },
    };
    const r = await analyse(
      genuineCos({ producer: 'Apache FOP Version 2.3', creator: 'Apache FOP Version 2.3' }),
      [],
      [hitlCase, { ...hitlCase }, { ...hitlCase }],
    );
    expect(r.checks.filter(c => c.name.startsWith('Human Expert Note'))).toHaveLength(1);
    expect(r.result).toBe('genuine');
    expect(r.confidence).toBe(100);
  });
});

describe('check-ID signal matching', () => {
  // NOTE: signal rules name producer 2.3, so the doc under test uses 2.3 —
  // keyword relevance requires the doc's producer string in the rule text.
  const fop23 = (overrides: Partial<PDFMetadata> = {}) =>
    genuineCos({ producer: 'Apache FOP Version 2.3', creator: 'Apache FOP Version 2.3', ...overrides });

  it('same failed checks + same family → matched advisory with capped influence', async () => {
    const r = await analyse(fop23(), [signalRule()], [], ['check-15']);
    const matched = r.checks.filter(c => (c as any).signalMatched);
    expect(matched).toHaveLength(1);
    expect(r.confidence).toBe(80);
    // A lone matched warning cannot condemn on its own.
    expect(r.result).toBe('genuine');
  });

  it('signal rule with no check-ID overlap stays silent', async () => {
    const r = await analyse(fop23(), [signalRule()], [], ['check-04']);
    expect(r.checks.some(c => c.name.startsWith('Admin Note'))).toBe(false);
    expect(r.confidence).toBe(100);
  });

  it('signal rule with overlap but different family stays silent', async () => {
    const doc = genuineCos({ producer: 'Canva' });
    const r = await analyse(doc, [signalRule()], [], ['check-15']);
    expect(r.checks.some(c => (c as any).signalMatched)).toBe(false);
  });

  it('matched influence is capped at -20 no matter how many rows match', async () => {
    const r = await analyse(fop23(), [signalRule(), signalRule('check-15')], [], ['check-15', 'check-17']);
    expect(r.checks.filter(c => (c as any).signalMatched).length).toBeGreaterThanOrEqual(1);
    expect(r.confidence).toBe(80);
  });

  it('matched warning joins the suspicious tally but can never fake alone', async () => {
    // A 36-day mod skew gives exactly 1 forensic warning (confidence 80):
    // alone it stays genuine; plus one matched advisory it reaches suspicious.
    const doc = fop23({ modificationDate: 'D:20260915101500Z' });
    const r = await analyse(doc, [signalRule()], [], []);
    expect(r.result).toBe('genuine');
    const r2 = await analyse(doc, [signalRule()], [], ['check-15']);
    expect(r2.result).toBe('suspicious');
    expect(r2.checks.some(c => (c as any).signalMatched)).toBe(true);
  });

  it('forensic criticals still drive fake; advisories never do', async () => {
    const r = await analyse(genuineCos({ producer: 'Adobe Photoshop 25.0' }), [signalRule()], [], ['check-15']);
    expect(r.result).toBe('fake');
    expect(r.checks.some(c => !c.passed && c.severity === 'critical' && (c as any).kind !== 'advisory')).toBe(true);
  });

  it('HITL row with stored overlapping failure signature gains influence', async () => {
    const hitl = {
      filename: 'forged.pdf',
      result: 'fake',
      confidence: 20,
      adminFeedback: 'creationdate & moddate is different',
      metadata: { producer: 'Apache FOP Version 2.3' },
      analysisDetails: {
        cosCheck: {
          checks: [
            { checkId: 'check-15', name: 'Check 15 (xmp:CreateDate)', passed: false },
            { checkId: 'check-04', name: 'Check 4 (Creator)', passed: true },
          ],
        },
      },
    };
    const r = await analyse(fop23(), [], [hitl], ['check-15']);
    expect(r.checks.some(c => (c as any).signalMatched)).toBe(true);
    expect(r.confidence).toBe(80);
  });

  it('HITL row without stored signature stays display-only', async () => {
    const hitl = {
      filename: 'forged.pdf',
      result: 'fake',
      confidence: 20,
      adminFeedback: 'creationdate & moddate is different',
      metadata: { producer: 'Apache FOP Version 2.3' },
    };
    const r = await analyse(fop23(), [], [hitl], ['check-15']);
    expect(r.checks.some(c => (c as any).signalMatched)).toBe(false);
    expect(r.confidence).toBe(100);
    expect(r.result).toBe('genuine');
  });
});

describe('parseAdminSignal + storedFailedCheckIds', () => {
  it('parses a machine block', () => {
    expect(parseAdminSignal(signalRule().ruleText)).toEqual({
      checkIds: ['check-15', 'check-17'],
      producerFamily: 'apache-fop',
    });
  });

  it('returns null for legacy free-text rows and garbage', () => {
    expect(parseAdminSignal('Documents from Apache FOP need review.')).toBeNull();
    expect(parseAdminSignal(undefined)).toBeNull();
    expect(parseAdminSignal('Signal(check-ids): nonsense here')).toBeNull();
  });

  it('extracts failed IDs from a stored row, [] when absent', () => {
    const row = { analysisDetails: { cosCheck: { checks: [
      { checkId: 'check-15', passed: false },
      { checkId: 'check-04', passed: true },
      { name: 'Legacy Check', passed: false },
    ] } } };
    expect(storedFailedCheckIds(row)).toEqual(['check-15', 'Legacy Check']);
    expect(storedFailedCheckIds({})).toEqual([]);
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
