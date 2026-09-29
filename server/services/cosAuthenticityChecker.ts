import type { PDFMetadata } from './pdfAnalyzer';
import type { COSCheckResult, COSCheck, COSForensic } from '../../shared/mis-types';

/**
 * UK Home Office SMS (Sponsorship Management System) technical screening —
 * 17 ordered checks in 4 sections:
 *
 *   Section 1  File Format          Check  1–3
 *   Section 2  PDF Properties       Check  4–6
 *   Section 3  Document Statistics  Check  7–9   (soft triage: only zero-text fails)
 *   Section 4  XMP Tags             Check 10–17  (evaluated in XMP order)
 *
 * Decision logic: PASS (GENUINE) iff all 17 pass — warnings/notes permitted.
 * FAIL (EDITED) on any failed row; reason lists failed check numbers.
 *
 * Deliberate strictness notes:
 *  - Producer/creator/tool must equal `Apache FOP Version 2.3` EXACTLY
 *    (trimmed, case-sensitive). Any other version or tool fails — this
 *    subsumes tool-fingerprint detection, so no tool list is kept.
 *  - Timestamp equality is instant comparison (epoch millis, whole-second
 *    resolution), never string comparison: Info `20:59:56+01:00` and XMP
 *    `21:59:56Z` are the same instant and PASS.
 *  - `dc:language` must be `x-unknown`. The old `en-GB` display fallback must
 *    never leak into this gate — only real `parsedXmp` values are read.
 *  - No revision/startxref check here by design (strict profile replacement):
 *    re-saves surface via version/timestamp divergence; revision topology
 *    remains measured in the structural evidence layer, not this gate.
 */

const SMS_PRODUCER = 'Apache FOP Version 2.3';
const SMS_PDF_VERSION = '1.4';
const SMS_LANGUAGE = 'x-unknown';

/** The 8 XMP fields in mandated audit order (Checks 10–17). */
const XMP_FIELD_ORDER = [
  'dc:date',
  'dc:format',
  'dc:language',
  'pdf:PDFVersion',
  'pdf:Producer',
  'xmp:CreateDate',
  'xmp:CreatorTool',
  'xmp:MetadataDate',
] as const;

/** `YYYY-MM-DDTHH:mm:ss[.sss]Z` — UTC ISO-8601 as the SMS emits it. */
const UTC_ISO_SHAPE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

const WORD_BAND = { min: 300, max: 700 };
const CHAR_BAND = { min: 3500, max: 6000 };

function exact(value: unknown, expected: string): boolean {
  return typeof value === 'string' && value.trim() === expected;
}

/**
 * Parse a PDF date (`D:YYYYMMDDHHmmss` + optional `Z`/`+HH'mm'`/`-HH'mm'`)
 * or ISO-8601 string to epoch millis. Missing tz suffix = UTC (documented
 * assumption — the gate compares instants, and SMS output always carries
 * either `Z`-equivalent XMP or an explicit PDF offset). Null when unparseable.
 */
export function parseDocInstant(dateStr: unknown): number | null {
  if (typeof dateStr !== 'string') return null;
  const s = dateStr.trim();
  const pdf = s.match(
    /^D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(Z|[+-]\d{2}'?\d{2}'?)?$/,
  );
  if (pdf) {
    const [, Y, Mo, D, h, mi, sec, tz] = pdf;
    let suffix = 'Z';
    if (tz && tz !== 'Z') {
      const m = tz.match(/^([+-])(\d{2})'?(\d{2})'?$/);
      if (!m) return null;
      suffix = `${m[1]}${m[2]}:${m[3]}`;
    }
    const ms = Date.parse(`${Y}-${Mo}-${D}T${h}:${mi}:${sec}${suffix}`);
    return Number.isNaN(ms) ? null : ms;
  }
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? null : ms;
}

/** Whole-second instant equality. */
function sameInstant(a: number | null, b: number | null): boolean {
  return a !== null && b !== null && Math.floor(a / 1000) === Math.floor(b / 1000);
}

export class COSAuthenticityChecker {
  // Accepts the raw PDF binary string (passed from the route — avoids a second file read).
  check(pdfBinary: string, metadata: PDFMetadata): COSCheckResult {
    const rows: COSCheck[] = [];
    const fail = (id: string, name: string, detail: string): void => {
      rows.push({ checkId: id, name, passed: false, detail });
    };
    const pass = (
      id: string,
      name: string,
      detail: string,
      soft: 'pass' | 'note' | 'review' = 'pass',
    ): void => {
      // Soft rows (statistics triage) stay `passed: true` — they inform, never condemn.
      rows.push({ checkId: id, name, passed: true, detail: soft === 'pass' ? detail : `[${soft}] ${detail}` });
    };

    const parsedXmp: Record<string, string> = metadata.parsedXmp ?? {};
    const hasRealXmp = !!metadata.rawXmpData;

    // ── Section 1: File Format (Checks 1–3) ─────────────────────────────────
    const magicOk = pdfBinary.replace(/^\uFEFF/, '').trimStart().startsWith('%PDF-');
    if (magicOk) pass('check-01', 'Check 1 (Format)', 'Format: Pdf');
    else fail('check-01', 'Check 1 (Format)', 'Missing %PDF- magic — not a PDF');
    if (magicOk) pass('check-02', 'Check 2 (MimeType)', 'MimeType: application/pdf (magic-verified at upload)');
    else fail('check-02', 'Check 2 (MimeType)', 'Not a PDF — no MIME to attest');

    const headerVersion = metadata.pdfVersionHeader ?? metadata.pdfVersion;
    if (headerVersion === SMS_PDF_VERSION) pass('check-03', 'Check 3 (PdfVersion)', `PdfVersion: ${headerVersion}`);
    else fail('check-03', 'Check 3 (PdfVersion)', `Expected 1.4, found: ${headerVersion ?? 'absent'} — re-save suspected`);

    // ── Section 2: PDF Properties (Checks 4–6) ──────────────────────────────
    if (exact(metadata.creator, SMS_PRODUCER)) pass('check-04', 'Check 4 (Creator)', `Creator: ${metadata.creator!.trim()}`);
    else fail('check-04', 'Check 4 (Creator)', `Expected "${SMS_PRODUCER}", found: ${metadata.creator ?? 'absent'}`);
    if (exact(metadata.producer, SMS_PRODUCER)) pass('check-05', 'Check 5 (Producer)', `Producer: ${metadata.producer!.trim()}`);
    else fail('check-05', 'Check 5 (Producer)', `Expected "${SMS_PRODUCER}", found: ${metadata.producer ?? 'absent'}`);
    const creationInstant = parseDocInstant(metadata.creationDate);
    if (creationInstant !== null) pass('check-06', 'Check 6 (CreationDate)', `CreationDate: ${metadata.creationDate}`);
    else fail('check-06', 'Check 6 (CreationDate)', `Invalid or absent CreationDate: ${metadata.creationDate ?? 'absent'}`);

    // ── Section 3: Document Statistics (Checks 7–9, soft triage) ────────────
    const pages = metadata.pages ?? 0;
    if (pages === 2) pass('check-07', 'Check 7 (Page Count)', 'Pages: 2 (standard CoS form)');
    else pass('check-07', 'Check 7 (Page Count)', `Pages: ${pages} — manual page-boundary review`, 'note');

    const words = metadata.wordCount ?? 0;
    const chars = metadata.characterCount ?? 0;
    if (words === 0 && chars === 0) {
      pass('check-08', 'Check 8 (Word Count)', 'Words: 0 — see Check 9');
      fail('check-09', 'Check 9 (Character Count)', 'No extractable text — flattened raster/scan');
    } else {
      if (words >= WORD_BAND.min && words <= WORD_BAND.max) pass('check-08', 'Check 8 (Word Count)', `Words: ${words} (band 300–700)`);
      else pass('check-08', 'Check 8 (Word Count)', `Words: ${words} outside typical band 300–700 — review`, 'review');
      if (chars >= CHAR_BAND.min && chars <= CHAR_BAND.max) pass('check-09', 'Check 9 (Character Count)', `Characters: ${chars} (band 3500–6000)`);
      else pass('check-09', 'Check 9 (Character Count)', `Characters: ${chars} outside typical band 3500–6000 — review`, 'review');
    }

    // ── Section 4: XMP Tags (Checks 10–17) ──────────────────────────────────
    if (!hasRealXmp) {
      for (let i = 0; i < XMP_FIELD_ORDER.length; i++) {
        fail(`check-${10 + i}`, `Check ${10 + i} (${XMP_FIELD_ORDER[i]})`, 'No XMP block');
      }
    } else {
      const fieldPass = new Array<boolean>(8).fill(true);

      const dcDate = parsedXmp['dc:date'];
      if (dcDate && UTC_ISO_SHAPE.test(dcDate.trim())) pass('check-10', 'Check 10 (dc:date)', `dc:date: ${dcDate.trim()}`);
      else { fail('check-10', 'Check 10 (dc:date)', `Expected UTC ISO-8601, found: ${dcDate ?? 'absent'}`); fieldPass[0] = false; }

      if (exact(parsedXmp['dc:format'], 'application/pdf')) pass('check-11', 'Check 11 (dc:format)', 'dc:format: application/pdf');
      else { fail('check-11', 'Check 11 (dc:format)', `Expected "application/pdf", found: ${parsedXmp['dc:format'] ?? 'absent'}`); fieldPass[1] = false; }

      if (exact(parsedXmp['dc:language'], SMS_LANGUAGE)) pass('check-12', 'Check 12 (dc:language)', 'dc:language: x-unknown');
      else { fail('check-12', 'Check 12 (dc:language)', `Expected "x-unknown", found: ${parsedXmp['dc:language'] ?? 'absent'}`); fieldPass[2] = false; }

      if (exact(parsedXmp['pdf:PDFVersion'], SMS_PDF_VERSION)) pass('check-13', 'Check 13 (pdf:PDFVersion)', 'pdf:PDFVersion: 1.4');
      else { fail('check-13', 'Check 13 (pdf:PDFVersion)', `Expected "1.4", found: ${parsedXmp['pdf:PDFVersion'] ?? 'absent'}`); fieldPass[3] = false; }

      if (exact(parsedXmp['pdf:Producer'], SMS_PRODUCER)) pass('check-14', 'Check 14 (pdf:Producer)', `pdf:Producer: ${parsedXmp['pdf:Producer']!.trim()}`);
      else { fail('check-14', 'Check 14 (pdf:Producer)', `Expected "${SMS_PRODUCER}", found: ${parsedXmp['pdf:Producer'] ?? 'absent'}`); fieldPass[4] = false; }

      const xmpCreate = parseDocInstant(parsedXmp['xmp:CreateDate']);
      if (sameInstant(creationInstant, xmpCreate)) pass('check-15', 'Check 15 (xmp:CreateDate)', 'xmp:CreateDate matches CreationDate to the second');
      else { fail('check-15', 'Check 15 (xmp:CreateDate)', `Mismatch: Info=${metadata.creationDate ?? 'absent'} XMP=${parsedXmp['xmp:CreateDate'] ?? 'absent'}`); fieldPass[5] = false; }

      if (exact(parsedXmp['xmp:CreatorTool'], SMS_PRODUCER)) pass('check-16', 'Check 16 (xmp:CreatorTool)', `xmp:CreatorTool: ${parsedXmp['xmp:CreatorTool']!.trim()}`);
      else { fail('check-16', 'Check 16 (xmp:CreatorTool)', `Expected "${SMS_PRODUCER}", found: ${parsedXmp['xmp:CreatorTool'] ?? 'absent'}`); fieldPass[6] = false; }

      const xmpMeta = parseDocInstant(parsedXmp['xmp:MetadataDate']);
      if (sameInstant(xmpCreate, xmpMeta)) pass('check-17', 'Check 17 (xmp:MetadataDate)', 'xmp:MetadataDate identical to xmp:CreateDate');
      else {
        fieldPass[7] = false;
        if (xmpCreate !== null && xmpMeta !== null && xmpMeta > xmpCreate) {
          fail('check-17', 'Check 17 (xmp:MetadataDate)', 'MetadataDate later than CreateDate — post-issuance alteration');
        } else if (xmpCreate !== null && xmpMeta !== null) {
          fail('check-17', 'Check 17 (xmp:MetadataDate)', 'MetadataDate earlier than CreateDate — impossible ordering');
        } else {
          fail('check-17', 'Check 17 (xmp:MetadataDate)', `Unparseable or absent: CreateDate=${parsedXmp['xmp:CreateDate'] ?? 'absent'} MetadataDate=${parsedXmp['xmp:MetadataDate'] ?? 'absent'}`);
        }
      }

      // Order folding (no 18th row): every present field that breaks the
      // mandated 10→17 positional monotonicity fails with sequence detail.
      const rawXmp = metadata.rawXmpData!;
      let lastIdx = -1;
      XMP_FIELD_ORDER.forEach((field, i) => {
        const idx = rawXmp.indexOf(field);
        if (idx === -1 || !fieldPass[i]) {
          if (idx !== -1) lastIdx = Math.max(lastIdx, idx);
          return;
        }
        if (idx <= lastIdx) {
          const row = rows.find((r) => r.checkId === `check-${10 + i}`);
          if (row) {
            row.passed = false;
            row.detail = `Out of sequence: expected after ${previousPresentField(XMP_FIELD_ORDER, rawXmp, i)}`;
          }
        } else {
          lastIdx = idx;
        }
      });
    }

    const failed = rows.filter((r) => !r.passed);
    const verdict = failed.length === 0 ? 'GENUINE' : 'EDITED';

    const infoXmpConsistency: COSForensic['infoXmpConsistency'] =
      !hasRealXmp ? 'XMP_ABSENT' :
      rows.some((r) => (r.checkId === 'check-15' || r.checkId === 'check-17') && !r.passed)
        ? 'MISMATCH' : 'MATCH';

    const forensic: COSForensic = {
      // Informational only (admin panel display) — NOT a check row. Revision
      // topology is judged structurally in the evidence layer, never here.
      incrementalUpdates: countRevisionsAboveBaseline(pdfBinary),
      infoXmpConsistency,
      toolFingerprint: metadata.producer ?? 'Unknown',
      suspiciousIndicators: metadata.forensic?.suspiciousIndicators ?? [],
    };

    const xmpTags = {
      'dc:date':          parsedXmp['dc:date']          ?? null,
      'dc:format':        parsedXmp['dc:format']        ?? null,
      'dc:language':      parsedXmp['dc:language']      ?? null,
      'pdf:PDFVersion':   parsedXmp['pdf:PDFVersion']   ?? null,
      'pdf:Producer':     parsedXmp['pdf:Producer']     ?? null,
      'xmp:CreateDate':   parsedXmp['xmp:CreateDate']   ?? null,
      'xmp:CreatorTool':  parsedXmp['xmp:CreatorTool']  ?? null,
      'xmp:MetadataDate': parsedXmp['xmp:MetadataDate'] ?? null,
    } as const;

    return {
      verdict,
      reason: verdict === 'GENUINE' ? null : `EDITED — ${failed.map((r) => r.checkId!.replace('check-', 'Check ')).join(', ')}`,
      checks: rows,
      xmpTags,
      pdfProperties: {
        author:       metadata.author           ?? null,
        title:        metadata.title            ?? null,
        subject:      metadata.subject          ?? null,
        keywords:     null,
        creationDate: metadata.creationDate     ?? null,
        creator:      metadata.creator          ?? null,
        producer:     metadata.producer         ?? null,
        modDate:      metadata.modificationDate ?? null,
      },
      docStats: {
        characters:    metadata.characterCount ?? 0,
        words:         metadata.wordCount      ?? 0,
        pages:         metadata.pages          ?? 0,
        fileSizeBytes: metadata.fileSize       ?? 0,
      },
      forensic,
    };
  }
}

/** Baseline-adjusted revision count for display only (see forensic summary). */
function countRevisionsAboveBaseline(pdfBinary: string): number {
  const count = (pdfBinary.match(/startxref/g) ?? []).length;
  const linearized = /\/Linearized[\s/]/.test(pdfBinary.slice(0, 4096));
  return Math.max(0, count - (linearized ? 2 : 1));
}

function previousPresentField(order: readonly string[], rawXmp: string, i: number): string {
  for (let j = i - 1; j >= 0; j--) {
    if (rawXmp.indexOf(order[j]) !== -1) return order[j];
  }
  return 'document start';
}
