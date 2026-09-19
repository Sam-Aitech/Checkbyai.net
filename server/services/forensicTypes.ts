/**
 * Forensic evidence boundary — Phase 1 of the conservative hardening plan.
 *
 * Goals (no behaviour change to verdicts):
 *  1. Isolate the PDF parser behind `IForensicParser` so a future Rust/WASM or
 *     Python-backed parser can replace `PDFAnalyzer` without touching routes/workers.
 *  2. Emit one immutable internal `ForensicEvidence` object per verification with
 *     pinned versions, so reproducibility + auditability + patent review are
 *     possible without exposing trade-secret logic to the user.
 *  3. Keep the user-facing response deliberately small (GENUINE/SUSPICIOUS/FAKE +
 *     summary). The full bundle is internal-only, persisted inside `analysisDetails`.
 *
 * Corpus discipline (enforced by convention + eval harness, not by this file):
 *  - Train/eval on genuine + synthetic + red-team only.
 *  - `quarantine_confirmed_fake/` entries require documented provenance before use.
 *  - NEVER train on `suspicious` outputs as though they were fake.
 */

import * as crypto from 'crypto';

// ── Version pins ─────────────────────────────────────────────────────────────
// Bump independently. `parserVersion` changes when byte-level extraction changes;
// `ruleSetVersion` when verify/check logic changes; `featureSchemaVersion` when
// the extracted feature dict gains/loses/renames a key.
export const FORENSIC_PARSER_NAME = 'node-regex-parser' as const;
export const FORENSIC_PARSER_VERSION = 'node-regex-v2' as const;
export const FORENSIC_RULE_SET_VERSION = 'cos-rules-v1' as const;
export const FORENSIC_FEATURE_SCHEMA_VERSION = 'feature-schema-v1' as const;
export const FORENSIC_MODEL_VERSION = 'deterministic-v1' as const;

// ── Parser interface ─────────────────────────────────────────────────────────
// NOTE: return types are intentionally `Promise<any>` / structural to avoid a
// type-level cycle with pdfAnalyzer.ts (which imports this file one-way).
export interface IForensicParser {
  readonly parserName: string;
  readonly parserVersion: string;
  extractMetadata(filePath: string): Promise<any>;
  extractStructuralFeatures(pdfBinary: string): StructuralFeatures;
}

// ── Feature schema v1 ────────────────────────────────────────────────────────
// All fields are deterministic, cheap to compute in Node (single pass over the
// binary string, no rendering, no native deps). They complement — never replace
// — the existing Info/XMP signals. Every field documents its spoofability:
// strings are trivially spoofed; counts/topology survive naive rewrites.
export interface StructuralFeatures {
  /** Schema version for this dict. Must equal FORENSIC_FEATURE_SCHEMA_VERSION. */
  schemaVersion: string;
  /** Raw count of `startxref` tokens (not baseline-adjusted). Spoofable by rebuild. */
  startxrefCount: number;
  /** True when a linearization dict appears in the first 4KB. Spoofable. */
  isLinearized: boolean;
  /** Baseline-adjusted incremental-update count (linearized ? 2 : 1). */
  incrementalUpdatesAboveBaseline: number;
  /** Count of `xref` section markers. Survives string-only spoofing. */
  xrefSectionCount: number;
  /** True when a `Prev` key exists (chained trailer = prior revision). Structural. */
  hasPrevChain: boolean;
  /** Estimated object count via `N 0 obj` markers. Structural. */
  objectCountEstimate: number;
  /** Count of `stream`…`endstream` bodies. Structural. */
  streamCount: number;
  /** Streams whose declared `/Length` disagrees with measured bytes. Strong signal. */
  streamLengthMismatchCount: number;
  /** Distinct `/BaseFont|/FontName` entries. Survives metadata cloning. */
  fontCountEstimate: number;
  /** True when any font descriptor lacks an embedded file (`/FontFile`). */
  hasUnembeddedFont: boolean;
  /** `BT…ET` text-block count. Collapses when text is outlined to curves. */
  textBlockCount: number;
  /** Count of `Tj|TJ|Tm|Tf` text-showing operators. Behavioural signature. */
  textOperatorCount: number;
  /** Shannon entropy (bits/byte) over the whole file, 2dp. Tamper-evidence. */
  wholeFileEntropyBitsPerByte: number;
  /** File size in bytes (from the binary handed to the parser). */
  fileSizeBytes: number;
}

// ── Evidence bundle ──────────────────────────────────────────────────────────
export type ForensicVerdict = 'GENUINE' | 'SUSPICIOUS' | 'FAKE';

export interface ForensicProvenance {
  uploadMethod: 'api-verify-upload' | 'bullmq-worker' | 'admin-ingest';
  filenameSanitized: string;
  magicVerified: boolean;
  processingTimestamp: string;
}

export interface ForensicCheckRecord {
  checkId: string;
  passed: boolean;
  detail?: string;
}

export interface ForensicEvidence {
  documentHash: string;
  parserName: string;
  parserVersion: string;
  ruleSetVersion: string;
  modelVersion: string;
  featureSchemaVersion: string;
  extractedFeatures: Record<string, unknown>;
  structuralFeatures: StructuralFeatures;
  forensicChecks: ForensicCheckRecord[];
  inputProvenance: ForensicProvenance;
  processingTimestamp: string;
  finalVerdict: ForensicVerdict;
  finalConfidence: number;
  /** `suspicious` must carry a reason — abstention is explicit, never silent. */
  abstentionReason: string | null;
  /** SHA-256 over the canonical JSON of this object minus this field. */
  evidenceBundleHash: string;
}

export interface BuildEvidenceInputs {
  documentHash: string;
  extractedFeatures: Record<string, unknown>;
  structuralFeatures: StructuralFeatures;
  forensicChecks: ForensicCheckRecord[];
  provenance: ForensicProvenance;
  finalVerdict: ForensicVerdict;
  finalConfidence: number;
  abstentionReason?: string | null;
  processingTimestamp?: string;
}

/** Stable key order for hashing — JSON.stringify with sorted keys, recursive. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

export function hashEvidenceBundle(bundleWithoutHash: Omit<ForensicEvidence, 'evidenceBundleHash'>): string {
  return crypto.createHash('sha256').update(canonicalJson(bundleWithoutHash)).digest('hex');
}

export function buildForensicEvidence(inputs: BuildEvidenceInputs): ForensicEvidence {
  const processingTimestamp = inputs.processingTimestamp ?? new Date().toISOString();
  const withoutHash: Omit<ForensicEvidence, 'evidenceBundleHash'> = {
    documentHash: inputs.documentHash,
    parserName: FORENSIC_PARSER_NAME,
    parserVersion: FORENSIC_PARSER_VERSION,
    ruleSetVersion: FORENSIC_RULE_SET_VERSION,
    modelVersion: FORENSIC_MODEL_VERSION,
    featureSchemaVersion: FORENSIC_FEATURE_SCHEMA_VERSION,
    extractedFeatures: inputs.extractedFeatures,
    structuralFeatures: inputs.structuralFeatures,
    forensicChecks: inputs.forensicChecks,
    inputProvenance: inputs.provenance,
    processingTimestamp,
    finalVerdict: inputs.finalVerdict,
    finalConfidence: Math.max(0, Math.min(100, Math.floor(inputs.finalConfidence))),
    abstentionReason:
      inputs.finalVerdict === 'SUSPICIOUS'
        ? (inputs.abstentionReason ?? 'Unverifiable or conflicting signals — routed for human review.')
        : null,
  };
  return { ...withoutHash, evidenceBundleHash: hashEvidenceBundle(withoutHash) };
}

/** Minimal user-facing projection — never include the full feature dict. */
export function summarizeEvidenceForUser(evidence: ForensicEvidence): {
  result: ForensicVerdict;
  confidence: number;
  evidenceBundleHash: string;
  summary: string;
} {
  const summary =
    evidence.finalVerdict === 'GENUINE'
      ? 'Document passed forensic checks.'
      : evidence.finalVerdict === 'FAKE'
        ? 'Document shows signs of tampering.'
        : (evidence.abstentionReason ?? 'Could not determine authenticity — human review recommended.');
  return {
    result: evidence.finalVerdict,
    confidence: evidence.finalConfidence,
    evidenceBundleHash: evidence.evidenceBundleHash,
    summary,
  };
}

/** Zero-value structural features for paths where the parser did not run (admin override). */
export function emptyStructuralFeatures(): StructuralFeatures {
  return {
    schemaVersion: FORENSIC_FEATURE_SCHEMA_VERSION,
    startxrefCount: 0,
    isLinearized: false,
    incrementalUpdatesAboveBaseline: 0,
    xrefSectionCount: 0,
    hasPrevChain: false,
    objectCountEstimate: 0,
    streamCount: 0,
    streamLengthMismatchCount: 0,
    fontCountEstimate: 0,
    hasUnembeddedFont: false,
    textBlockCount: 0,
    textOperatorCount: 0,
    wholeFileEntropyBitsPerByte: 0,
    fileSizeBytes: 0,
  };
}

/** Map the lowercase pattern-layer result to the evidence-layer verdict. */
export function toEvidenceVerdict(
  patternResult: 'genuine' | 'suspicious' | 'fake',
): ForensicVerdict {
  return patternResult === 'genuine' ? 'GENUINE' : patternResult === 'fake' ? 'FAKE' : 'SUSPICIOUS';
}
