/**
 * Phase 1 harness: parser isolation + immutable evidence bundle + structural
 * feature sanity. Verdict logic is NOT under test here — see
 * cosVerification.test.ts / cosVerdict.test.ts for that.
 *
 * Corpus discipline: fixtures only (genuine + derived). No confirmed fakes,
 * no `suspicious`-as-fake. The red-team case below (string-level spoof) is a
 * derived mutation of a genuine seed.
 */
import { describe, it, expect } from 'vitest';
import { PDFAnalyzer } from '../pdfAnalyzer';
import {
  FORENSIC_FEATURE_SCHEMA_VERSION,
  FORENSIC_PARSER_NAME,
  FORENSIC_PARSER_VERSION,
  buildForensicEvidence,
  canonicalJson,
  emptyStructuralFeatures,
  summarizeEvidenceForUser,
  toEvidenceVerdict,
  type StructuralFeatures,
} from '../forensicTypes';
import {
  genuinePdfBinary,
  linearizedPdfBinary,
  incrementallyUpdatedPdfBinary,
} from './fixtures/cosFixtures';

const analyzer = new PDFAnalyzer();

function testFeatures(binary: string): StructuralFeatures {
  return analyzer.extractStructuralFeatures(binary);
}

describe('IForensicParser isolation', () => {
  it('exposes a stable parser name + version', () => {
    expect(analyzer.parserName).toBe(FORENSIC_PARSER_NAME);
    expect(analyzer.parserVersion).toBe(FORENSIC_PARSER_VERSION);
  });

  it('extractStructuralFeatures is deterministic', () => {
    const binary = genuinePdfBinary();
    expect(testFeatures(binary)).toEqual(testFeatures(binary));
  });

  it('never throws on empty / garbage input', () => {
    expect(() => testFeatures('')).not.toThrow();
    expect(() => testFeatures('not a pdf at all')).not.toThrow();
    const empty = testFeatures('');
    expect(empty.schemaVersion).toBe(FORENSIC_FEATURE_SCHEMA_VERSION);
    expect(empty.fileSizeBytes).toBe(0);
    expect(empty.wholeFileEntropyBitsPerByte).toBe(0);
  });
});

describe('feature-schema-v1 structural signals', () => {
  it('genuine single-revision PDF sits on the incremental baseline', () => {
    const f = testFeatures(genuinePdfBinary());
    expect(f.schemaVersion).toBe(FORENSIC_FEATURE_SCHEMA_VERSION);
    expect(f.startxrefCount).toBe(1);
    expect(f.isLinearized).toBe(false);
    expect(f.incrementalUpdatesAboveBaseline).toBe(0);
    expect(f.hasPrevChain).toBe(false);
    expect(f.fileSizeBytes).toBeGreaterThan(0);
    expect(f.wholeFileEntropyBitsPerByte).toBeGreaterThan(0);
    expect(f.wholeFileEntropyBitsPerByte).toBeLessThanOrEqual(8);
  });

  it('linearized baseline (2x startxref) is not counted as a re-save', () => {
    const f = testFeatures(linearizedPdfBinary());
    expect(f.isLinearized).toBe(true);
    expect(f.startxrefCount).toBe(2);
    expect(f.incrementalUpdatesAboveBaseline).toBe(0);
  });

  it('a true incremental update with Prev chain is detected structurally', () => {
    const f = testFeatures(incrementallyUpdatedPdfBinary());
    expect(f.hasPrevChain).toBe(true);
    expect(f.incrementalUpdatesAboveBaseline).toBeGreaterThanOrEqual(1);
  });

  it('structural features survive string-level metadata stripping', () => {
    // Attacker strips XMP: string checks fail, but body topology remains.
    const stripped = genuinePdfBinary('');
    const f = testFeatures(stripped);
    expect(f.startxrefCount).toBe(1);
    expect(f.objectCountEstimate).toBe(
      testFeatures(genuinePdfBinary()).objectCountEstimate,
    );
  });

  it('string-level producer spoof does not move structural features', () => {
    // Core red-team property: cloning `Apache FOP` strings must not change
    // body-topology signals. If it does, the feature is string-coupled.
    const genuine = genuinePdfBinary();
    const spoofed = genuine.replace(/Apache FOP Version 2\.9/g, 'Apache FOP Version 2.9');
    expect(testFeatures(spoofed)).toEqual(testFeatures(genuine));
  });
});

describe('immutable evidence bundle', () => {
  const baseInputs = {
    documentHash: 'ab'.repeat(32),
    extractedFeatures: { producer: 'Apache FOP Version 2.9' },
    structuralFeatures: emptyStructuralFeatures(),
    forensicChecks: [{ checkId: 'cos:Apache FOP Producer', passed: true }],
    provenance: {
      uploadMethod: 'api-verify-upload' as const,
      filenameSanitized: 'cos.pdf',
      magicVerified: true,
      processingTimestamp: '2026-09-19T00:00:00.000Z',
    },
    processingTimestamp: '2026-09-19T00:00:00.000Z',
  };

  it('hashes deterministically (same inputs → same hash)', () => {
    const a = buildForensicEvidence({ ...baseInputs, finalVerdict: 'GENUINE', finalConfidence: 90 });
    const b = buildForensicEvidence({ ...baseInputs, finalVerdict: 'GENUINE', finalConfidence: 90 });
    expect(a.evidenceBundleHash).toBe(b.evidenceBundleHash);
    expect(a.evidenceBundleHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('any verdict/field change changes the hash', () => {
    const a = buildForensicEvidence({ ...baseInputs, finalVerdict: 'GENUINE', finalConfidence: 90 });
    const b = buildForensicEvidence({ ...baseInputs, finalVerdict: 'SUSPICIOUS', finalConfidence: 50 });
    expect(a.evidenceBundleHash).not.toBe(b.evidenceBundleHash);
  });

  it('pins all versions', () => {
    const e = buildForensicEvidence({ ...baseInputs, finalVerdict: 'GENUINE', finalConfidence: 90 });
    expect(e.parserName).toBe(FORENSIC_PARSER_NAME);
    expect(e.parserVersion).toBe(FORENSIC_PARSER_VERSION);
    expect(e.featureSchemaVersion).toBe(FORENSIC_FEATURE_SCHEMA_VERSION);
    expect(e.ruleSetVersion).toBeTruthy();
    expect(e.modelVersion).toBeTruthy();
  });

  it('SUSPICIOUS always carries an explicit abstention reason', () => {
    const e = buildForensicEvidence({ ...baseInputs, finalVerdict: 'SUSPICIOUS', finalConfidence: 50 });
    expect(e.abstentionReason).toBeTruthy();
    const genuine = buildForensicEvidence({ ...baseInputs, finalVerdict: 'GENUINE', finalConfidence: 90 });
    expect(genuine.abstentionReason).toBeNull();
  });

  it('clamps confidence into [0,100]', () => {
    expect(
      buildForensicEvidence({ ...baseInputs, finalVerdict: 'GENUINE', finalConfidence: 999 }).finalConfidence,
    ).toBe(100);
    expect(
      buildForensicEvidence({ ...baseInputs, finalVerdict: 'FAKE', finalConfidence: -5 }).finalConfidence,
    ).toBe(0);
  });

  it('canonical JSON is key-order stable', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });
});

describe('user-facing projection', () => {
  it('never leaks the full feature dict', () => {
    const e = buildForensicEvidence({
      documentHash: 'cd'.repeat(32),
      extractedFeatures: { producer: 'secret-tool-xyz', nested: { a: 1 } },
      structuralFeatures: emptyStructuralFeatures(),
      forensicChecks: [],
      provenance: {
        uploadMethod: 'bullmq-worker',
        filenameSanitized: 'cos.pdf',
        magicVerified: true,
        processingTimestamp: '2026-09-19T00:00:00.000Z',
      },
      finalVerdict: 'SUSPICIOUS',
      finalConfidence: 50,
      processingTimestamp: '2026-09-19T00:00:00.000Z',
    });
    const summary = summarizeEvidenceForUser(e);
    const asText = JSON.stringify(summary);
    expect(asText).not.toContain('secret-tool-xyz');
    expect(summary.result).toBe('SUSPICIOUS');
    expect(summary.evidenceBundleHash).toBe(e.evidenceBundleHash);
  });

  it('maps pattern-layer results to evidence verdicts', () => {
    expect(toEvidenceVerdict('genuine')).toBe('GENUINE');
    expect(toEvidenceVerdict('suspicious')).toBe('SUSPICIOUS');
    expect(toEvidenceVerdict('fake')).toBe('FAKE');
  });
});
