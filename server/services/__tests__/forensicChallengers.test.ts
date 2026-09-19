/**
 * Challenger unit tests — shadow-only mechanisms.
 * No file I/O, no UPLOADS_DIR, no verdict-path imports.
 */
import { describe, it, expect } from 'vitest';
import {
  challengerVerdict,
  checkAnachronism,
  nearReferenceDivergence,
  nearReferenceStructuralDivergence,
  parseDocYear,
  producerFamily,
  type GenerationInvariants,
} from '../forensicChallengers';
import type { PDFMetadata } from '../pdfAnalyzer';

const INVARIANTS: GenerationInvariants = {
  version: 'test-v1',
  pdfVersions: { '1.4': { specYear: 2001 } },
  xmpIntroducedYear: 2001,
};

const meta = (overrides: Partial<PDFMetadata> = {}): PDFMetadata =>
  ({
    producer: 'Apache FOP Version 2.9',
    creator: 'Apache FOP Version 2.9',
    creationDate: 'D:20260810101500Z',
    modificationDate: 'D:20260810101500Z',
    pdfVersion: '1.4',
    title: 'Certificate of Sponsorship',
    rawXmpData: '<x:xmpmeta/>',
    ...overrides,
  }) as PDFMetadata;

describe('parseDocYear', () => {
  it('reads D: and ISO formats, rejects garbage', () => {
    expect(parseDocYear('D:20260810101500Z')).toBe(2026);
    expect(parseDocYear('2026-08-10T10:15:00Z')).toBe(2026);
    expect(parseDocYear('1999-01-15T10:15:00Z')).toBe(1999);
    expect(parseDocYear(undefined)).toBeNull();
    expect(parseDocYear('not a date')).toBeNull();
  });
});

describe('checkAnachronism', () => {
  it('genuine modern document is clean', () => {
    expect(checkAnachronism(meta(), INVARIANTS).anachronistic).toBe(false);
  });

  it('1999 XMP-bearing PDF-1.4 is impossible on two counts', () => {
    const r = checkAnachronism(
      meta({ creationDate: 'D:19990115101500Z', pdfVersion: '1.4' }),
      INVARIANTS,
    );
    expect(r.anachronistic).toBe(true);
    expect(r.reasons).toHaveLength(2);
  });

  it('plausible backdate (2025) passes — residual blindness is explicit', () => {
    const r = checkAnachronism(meta({ creationDate: 'D:20250115101500Z' }), INVARIANTS);
    expect(r.anachronistic).toBe(false);
  });

  it('unparseable dates never condemn', () => {
    expect(checkAnachronism(meta({ creationDate: undefined }), INVARIANTS).anachronistic).toBe(false);
  });

  it('unknown PDF versions are not judged', () => {
    const r = checkAnachronism(meta({ creationDate: 'D:19990115101500Z', pdfVersion: '9.9', rawXmpData: undefined }), INVARIANTS);
    expect(r.anachronistic).toBe(false);
  });
});

describe('nearReferenceDivergence', () => {
  const trusted = meta();

  it('identical documents do not diverge', () => {
    expect(nearReferenceDivergence(meta(), trusted).diverged).toBe(false);
  });

  it('title swap against the same generator diverges', () => {
    const r = nearReferenceDivergence(meta({ title: 'Certificate of Sponsorship - REPLACEMENT' }), trusted);
    expect(r.diverged).toBe(true);
    expect(r.fields).toContain('title');
  });

  it('different producer family never fires (avoids cross-generator false positives)', () => {
    const r = nearReferenceDivergence(meta({ producer: 'iLovePDF', title: 'Something Else' }), trusted);
    expect(r.diverged).toBe(false);
  });

  it('missing fields on either side are ignored, never penalised', () => {
    const r = nearReferenceDivergence(meta({ title: undefined }), trusted);
    expect(r.diverged).toBe(false);
  });

  it('FOP version drift still counts as same family', () => {
    expect(producerFamily('Apache FOP Version 2.3')).toBe('apache-fop');
    const r = nearReferenceDivergence(
      meta({ producer: 'Apache FOP Version 2.3', title: 'Changed' }),
      trusted,
    );
    expect(r.diverged).toBe(true);
  });
});

describe('nearReferenceStructuralDivergence', () => {
  const trusted = [meta()];
  const trustedStruct = [{ objectCountEstimate: 1 }];

  it('matching inventory does not diverge', () => {
    const r = nearReferenceStructuralDivergence(meta(), { objectCountEstimate: 1 }, trusted, trustedStruct);
    expect(r.diverged).toBe(false);
  });

  it('grafted object inventory diverges', () => {
    const r = nearReferenceStructuralDivergence(meta(), { objectCountEstimate: 2 }, trusted, trustedStruct);
    expect(r.diverged).toBe(true);
    expect(r.fields).toContain('objectCountEstimate');
  });

  it('different producer family never fires', () => {
    const r = nearReferenceStructuralDivergence(
      meta({ producer: 'iLovePDF' }), { objectCountEstimate: 9 }, trusted, trustedStruct,
    );
    expect(r.diverged).toBe(false);
  });
});

describe('challengerVerdict', () => {
  const trusted = [meta()];

  it('leaves genuine identical documents untouched', () => {
    const v = challengerVerdict('genuine', 95, meta(), trusted, INVARIANTS);
    expect(v.result).toBe('genuine');
    expect(v.changedByChallenger).toBe(false);
  });

  it('downgrades near-reference title tampering to suspicious', () => {
    const v = challengerVerdict(
      'genuine', 95,
      meta({ title: 'Certificate of Sponsorship - REPLACEMENT' }),
      trusted, INVARIANTS,
    );
    expect(v.result).toBe('suspicious');
    expect(v.changedByChallenger).toBe(true);
  });

  it('condemns impossible dates even when the champion says genuine', () => {
    const v = challengerVerdict(
      'genuine', 95,
      meta({ creationDate: 'D:19990115101500Z' }),
      trusted, INVARIANTS,
    );
    expect(v.result).toBe('fake');
    expect(v.changedByChallenger).toBe(true);
  });

  it('never upgrades: suspicious stays suspicious without new evidence', () => {
    const v = challengerVerdict('suspicious', 50, meta(), trusted, INVARIANTS);
    expect(v.result).toBe('suspicious');
    expect(v.changedByChallenger).toBe(false);
  });

  it('no trusted references → champion passes through', () => {
    const v = challengerVerdict(
      'genuine', 95,
      meta({ title: 'Changed' }),
      [], INVARIANTS,
    );
    expect(v.result).toBe('genuine');
    expect(v.changedByChallenger).toBe(false);
  });

  it('downgrades grafted inventory to suspicious via structural binding', () => {
    const v = challengerVerdict('genuine', 95, meta(), [meta()], INVARIANTS, {
      doc: { objectCountEstimate: 2 },
      trusted: [{ objectCountEstimate: 1 }],
    });
    expect(v.result).toBe('suspicious');
    expect(v.changedByChallenger).toBe(true);
  });

  it('matching inventory leaves genuine untouched', () => {
    const v = challengerVerdict('genuine', 95, meta(), [meta()], INVARIANTS, {
      doc: { objectCountEstimate: 1 },
      trusted: [{ objectCountEstimate: 1 }],
    });
    expect(v.result).toBe('genuine');
    expect(v.changedByChallenger).toBe(false);
  });
});
