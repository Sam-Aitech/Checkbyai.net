# COS Check — Metadata Inspector (MIS) Feature

**Last Updated:** 2026-09-19
**Status:** Shipped (Beta) — strict SMS 17-gate (replaced the 6-check gate)
**Entry Points:** `/api/verify` endpoint, client COS Check tab

---

## Overview

The Metadata Inspector (MIS) is a forensic PDF analysis engine that audits incoming CoS PDFs against the known Home Office SMS generation profile — **17 ordered checks in 4 sections** (full spec: `docs/FORENSIC_CORPUS.md` §9):

1. **File Format (1–3)** — `%PDF-` magic, `application/pdf`, header version exactly `1.4`
2. **PDF Properties (4–6)** — Creator/Producer exactly `Apache FOP Version 2.3`, valid CreationDate
3. **Document Statistics (7–9)** — 2 pages; 300–700 words; 3500–6000 chars (soft triage: only zero-text fails)
4. **XMP Tags (10–17)** — 8 fields in order (`dc:date`, `dc:format`, `dc:language=x-unknown`, `pdf:PDFVersion=1.4`, `pdf:Producer=2.3`, `xmp:CreateDate≡CreationDate`, `xmp:CreatorTool=2.3`, `xmp:MetadataDate≡xmp:CreateDate`), timestamps compared as instants to the second, timezone-aware

**Verdict:** `GENUINE` (all 17 pass; warnings/notes permitted) or `EDITED` (reason lists failed check numbers, e.g. `EDITED — Check 5, Check 12`)

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              POST /api/verify (Client Upload)           │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
          ┌──────────────────────┐
          │ Read PDF to buffer   │
          │ (single read)        │
          └──────────┬───────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
         ▼                       ▼
    ┌─────────────┐      ┌──────────────────────────┐
    │ AI Analysis │      │ COSAuthenticityChecker   │
    │ (OpenAI)    │      │ .check(pdfBinary, meta)  │
    │             │      └──────────────────────────┘
    └─────────────┘               │
         │                        ▼
         │              ┌──────────────────────┐
         │              │ Parse & verify the   │
         │              │ strict SMS 17-gate   │
         │              │ → verdict + reason   │
         │              └──────────────────────┘
         │                        │
         └───────────┬────────────┘
                     │
                     ▼
         ┌──────────────────────────┐
         │ Merge results into       │
         │ VerificationResult       │
         │ (cosCheck field)         │
         └──────────────────────────┘
                     │
                     ▼
         ┌──────────────────────────┐
         │ Return JSON with:        │
         │ - AI verdict             │
         │ - cosCheck (GENUINE/...)  │
         │ - Admin sees full forensic│
         └──────────────────────────┘
```

---

## Type Definitions

Located in `shared/mis-types.ts`:

```typescript
export type COSVerdict = 'GENUINE' | 'EDITED';

export interface COSCheckResult {
  verdict: COSVerdict;
  reason: string | null;           // null if GENUINE; e.g. "EDITED — Check 5, Check 12"
  checks: COSCheck[];               // 17 check results, in audit order
  xmpTags: COSXmpTags;              // (admin-only in response)
  pdfProperties: COSPdfProperties;  // (admin-only in response)
  docStats: COSDocStats;            // (admin-only in response)
  forensic: COSForensic;            // (admin-only in response)
}

export interface COSCheck {
  checkId?: string;    // "check-01"…"check-17" — stable machine ID, recorded on flag
  name: string;        // "Check 5 (Producer)", "Check 12 (dc:language)", etc.
  passed: boolean;
  detail: string;      // "Producer: Apache FOP Version 2.3", "No XMP block", etc.
}

export interface COSForensic {
  incrementalUpdates: number;        // informational display count only (not a check row)
  infoXmpConsistency: 'MATCH' | 'MISMATCH' | 'XMP_ABSENT';
  toolFingerprint: string;           // Info producer string (identity, not detection)
  suspiciousIndicators: string[];   // pattern-layer indicators, if any
}
```

---

## Core Service

**File:** `server/services/cosAuthenticityChecker.ts`

### Class: `COSAuthenticityChecker`

```typescript
export class COSAuthenticityChecker {
  check(pdfBinary: string, metadata: PDFMetadata): COSCheckResult
}
```

#### 17 SMS Profile Checks (in audit order)

Section 1 — File Format: **Check 1 (Format)** `%PDF-` magic · **Check 2 (MimeType)** strictly `application/pdf` · **Check 3 (PdfVersion)** `%PDF-` header exactly `1.4` (XMP's `pdf:PDFVersion` is check 13's domain — the header snapshot is taken before XMP merge).

Section 2 — PDF Properties: **Check 4 (Creator)** / **Check 5 (Producer)** exactly `Apache FOP Version 2.3` (trimmed, case-sensitive — this subsumes tool detection: no tool list is kept) · **Check 6 (CreationDate)** parses to a real instant.

Section 3 — Document Statistics (soft triage): **Check 7 (Page Count)** 2 expected, otherwise info note · **Check 8 (Word Count)** band 300–700, otherwise warning · **Check 9 (Character Count)** band 3500–6000, otherwise warning; **zero text fails** (flattened raster/scan).

Section 4 — XMP Tags (real `parsedXmp` values only; absent XMP block fails 10–17): **Check 10 (dc:date)** UTC ISO-8601 shape · **Check 11 (dc:format)** strictly `application/pdf` · **Check 12 (dc:language)** strictly `x-unknown` (no `en-GB` fallback in the forensic path) · **Check 13 (pdf:PDFVersion)** strictly `1.4` · **Check 14 (pdf:Producer)** exactly 2.3 · **Check 15 (xmp:CreateDate)** same instant as CreationDate to the second, timezone-aware · **Check 16 (xmp:CreatorTool)** exactly 2.3 · **Check 17 (xmp:MetadataDate)** same instant as CreateDate (`later` = post-issuance alteration, `earlier` = impossible).

XMP field order folds into the field rows (no 18th row): any present field breaking the 10→17 positional monotonicity fails with sequence detail.

#### Verdict Logic

- All 17 rows always emit, in order; warnings/notes permitted
- Zero failed rows: `verdict = 'GENUINE'`, `reason = null`
- ≥1 failed row: `verdict = 'EDITED'`, `reason = 'EDITED — Check 5, Check 12'` (failed numbers only)

---

## API Integration

**File:** `server/routes/verification.ts`

### Endpoint: `POST /api/verify`

Modified to include CoS Check metadata inspector:

```typescript
// Line 193-199 (simplified)
const [analysisResult, cosCheckResult] = await Promise.all([
  pdfAnalyzer.analyze(pdfBuffer, metadata),
  cosChecker.check(pdfBinary, metadata)
]);

analysis.cosCheck = cosCheckResult;
```

#### Response Shape

```json
{
  "result": "genuine",
  "confidence": 91,
  "receiptId": "abc123def456",
  "analysisDetails": { ... },
  "cosCheck": {
    "verdict": "GENUINE",
    "reason": null,
    "checks": [ ... ],
    "xmpTags": { ... },
    "pdfProperties": { ... },
    "docStats": { ... },
    "forensic": { ... }
  },
  "creditsRemaining": 4
}
```

**Access Control:**
- Users with `cosCheckApproved = true` and valid subscription get CoS Check results
- Admins see full forensic details
- Non-admin users see only `verdict` and `reason` (hidden fields filtered in UI)

---

## Client Components

### 1. `COSCheckPanel.tsx`

**Location:** `client/src/components/mis/COSCheckPanel.tsx`

Renders the verdict badge:
- **GENUINE** → Green shield icon + "GENUINE"
- **EDITED** → Red shield icon + reason in tooltip/detail

```tsx
<COSCheckPanel cosCheck={cosCheckResult} />
```

Props: `cosCheck: COSCheckResult | null`

### 2. `COSAdminPanel.tsx`

**Location:** `client/src/components/mis/COSAdminPanel.tsx`

Admin-only forensic details:
- All 6 check results with pass/fail indicators
- XMP tags table
- PDF properties
- Document stats
- Suspicious indicators

```tsx
<COSAdminPanel cosCheck={cosCheckResult} />
```

### 3. `VerificationResultsTabbed.tsx`

**Location:** `client/src/components/VerificationResultsTabbed.tsx`

Wrapper component with two tabs:
1. **"Verification"** — Existing AI analysis results
2. **"Metadata Inspector"** — CoS Check MIS results (COSCheckPanel + COSAdminPanel)

Falls back to plain `VerificationResults` when no `cosCheck` data.

```tsx
<VerificationResultsTabbed cosCheck={cosCheckResult} result={aiResult} />
```

### 4. `FileUploadSimple.tsx`

**Location:** `client/src/components/FileUploadSimple.tsx`

Updated to include `cosCheck` field in `VerificationResult` interface:

```typescript
interface VerificationResult {
  result: string;
  confidence: number;
  analysisDetails: { ... };
  cosCheck?: COSCheckResult;  // NEW FIELD
  creditsRemaining?: number;
}
```

### 5. `COSDashboard.tsx`

**Location:** `client/src/components/COSDashboard.tsx`

Modified to use `VerificationResultsTabbed` instead of plain `VerificationResults`:

```tsx
// BEFORE
<VerificationResults result={verificationResult} />

// AFTER
<VerificationResultsTabbed 
  result={verificationResult} 
  cosCheck={verificationResult?.cosCheck}
/>
```

---

## Data Flow

1. **User uploads PDF** → `POST /api/verify`
2. **Server reads PDF once** → Single buffer passed to both analyzers
3. **Parallel execution** → `Promise.all([aiAnalysis, cosCheck])`
4. **AI analysis** → Returns `{ result, confidence, analysisDetails, ... }`
5. **CoS Check** → Returns `{ verdict, reason, checks, xmpTags, ... }`
6. **Merge results** → `analysis.cosCheck = cosCheckResult`
7. **Return response** → Full verification result with embedded cosCheck
8. **Client renders tabs** → AI analysis in "Verification" tab, MIS in "Metadata Inspector" tab
9. **Admin view** → Shows full forensic details in COSAdminPanel

---

## File Locations Summary

| File | Purpose |
|------|---------|
| `shared/mis-types.ts` | Type definitions (COSCheckResult, COSVerdict, etc.) |
| `server/services/cosAuthenticityChecker.ts` | Core 6-check authenticity engine |
| `server/routes/verification.ts` | API endpoint integration |
| `client/src/components/mis/COSCheckPanel.tsx` | User verdict badge |
| `client/src/components/mis/COSAdminPanel.tsx` | Admin forensic details |
| `client/src/components/VerificationResultsTabbed.tsx` | Tab wrapper (Verification + MIS) |
| `client/src/components/COSDashboard.tsx` | Dashboard integration |
| `client/src/components/FileUploadSimple.tsx` | Updated VerificationResult interface |

---

## Testing Checklist

- [ ] 17-gate runs first (synchronous); failed check IDs feed signal matching in pattern analysis
- [ ] GENUINE verdict returns when all 17 checks pass (warnings/notes permitted)
- [ ] EDITED verdict lists failed check numbers (e.g. `EDITED — Check 5, Check 12`)
- [ ] Missing XMP block fails exactly checks 10–17
- [ ] Misordered XMP fields fail with sequence detail, still 17 rows total
- [ ] `D:…+01'00'` Info instant equals `Z` XMP instant (timezone-aware, to the second)
- [ ] `MetadataDate > CreateDate` fails check 17 as post-issuance alteration
- [ ] Dublin Core values inside `rdf:Seq` / `rdf:Bag` containers are read as present
- [ ] `x-unknown` required — no `en-GB` fallback in the forensic path
- [ ] Zero-text document fails check 9; thin-but-nonempty warns only
- [ ] Admin sees full forensic data; non-admin sees verdict only
- [ ] cosCheckApproved gate blocks users without access
- [ ] API response includes cosCheck field in JSON
- [ ] Trusted reference: real `genuinePdfBinary()` bytes yield all seventeen mandatory
  checks passing (`trustedReferenceFlow.test.ts` derives fixtures from the live
  chain — no hand-stubbed check lists)
- [ ] Trusted reference: same bytes → `VALIDATED` row → exact SHA-256 match →
  `GENUINE` end to end (admin-upload simulation → customer-upload simulation,
  `server/utils/__tests__/trustedReferenceFlow.test.ts` byte-level block)
- [ ] Trusted reference: one flipped byte → different hash → no match
- [ ] Trusted reference: match + current `EDITED` → `TRUSTED_REFERENCE_CONFLICT`
  sub-state, never auto-genuine (byte-level conflict is unconstructible —
  identical bytes re-derive identical verdicts — so conflict is covered at
  resolver level with a real derived `EDITED` run)
- [ ] Trusted reference: missing `trustType` never matches (strictly required)

---

## Trusted COS Reference (exact SHA-256)

Locked forensic policy: the seventeen checks above are mandatory acceptance criteria
and are never weakened, removed, downgraded, bypassed, or reclassified.
A document is GENUINE only when these requirements pass — except for one
narrow, audited path: an exact byte match to a previously forensic-validated
admin reference (see below).

### Admin upload — `POST /api/admin/trusted-patterns`

1. Compute `SHA-256` over the exact uploaded PDF bytes.
2. Run the same `COSAuthenticityChecker` (all seventeen checks) against the upload.
3. Only when `verdict === 'GENUINE'` store the reference with:
   `patterns = { metadata, documentType: 'trusted_cos', trustType:
   'admin_reference', documentHash, forensicVersion: 2, trustStatus:
   'VALIDATED', validatedAt, cosVerdict }` (no schema migration; JSONB only;
   v2 = 17-gate — v1 references were judged by the retired 6-check gate).
4. If any check fails, return `422` with `failedChecks` and create nothing.
   The admin UI shows the exact failed check(s) and blocks approval until a
   valid reference is uploaded.

### Customer verification — `POST /api/verify` + `pdfVerifyWorker`

1. Compute `documentHash = SHA-256(bytes)` (already done).
2. `findValidatedTrustedMatch(trustedPatterns, documentHash)` matches only
   when `patterns.documentHash === documentHash AND trustStatus ===
   'VALIDATED' AND trustType === 'admin_reference'` (`trustType` strictly
   required; a missing `trustType` never matches).
3. Always run the 17-gate first, then pattern analysis (which receives the
   failed check IDs for signal matching), then `combineWithCosVerdict()` —
   the hash alone never overrides the final verdict. An exact match only
   appends an `Admin Trusted Reference Match` evidence check (reference
   identity, verdict-neutral).
4. Match + current seventeen-check `GENUINE` → `genuine`, with
   `analysisDetails.trustedReference = { matched: true, status: 'validated',
   patternId, filename, documentHash }`.
5. Match + current seventeen-check `EDITED` → `TRUSTED_REFERENCE_CONFLICT`
   sub-state: `result`/`confidence` follow the normal forensic path
   (typically `suspicious`, counted as suspicious in dashboards);
   `trustedReference = { matched: true, status: 'conflict', conflictReason,
   conflictChecks }`; all MIS findings retained for human review.
6. No match (different hash, same producer/metadata, same filename/different
   bytes, legacy `UNVERIFIED`/`INVALID` rows): existing forensic logic runs
   unchanged, including the `EDITED + genuine → suspicious / 50%` downgrade.

### Migration — `POST /api/admin/trusted-patterns/revalidate`

Existing `trusted_patterns` rows are never auto-trusted. The revalidate
endpoint marks every row without a 64-char `documentHash` + `trustStatus ===
'VALIDATED'` as `UNVERIFIED` (JSONB-only update). Only `VALIDATED` references
participate in exact-hash matching. Re-upload a forensic-valid PDF to mint a
new `VALIDATED` reference.

### AI reasoning — `POST /api/admin/analyze-reasoning/:id` (SSE)

- `hasAnyProvider()` is checked before SSE headers; no provider → `503 JSON`
  with an actionable message (verification itself already succeeded).
- Provider create-failure → `502 JSON`; mid-stream failure → `data: { error }`
  diagnostic. No API keys/secrets are exposed; provider fallback preserved.
- Prompt includes trusted-reference context (matched true/false, filename,
  hash), deterministic MIS checks, and the final deterministic result, with an
  explicit instruction to explain only and never rewrite the verdict.
- Client (`SimpleAdmin runAiAnalysis()`) uses a persistent SSE buffer with
  `TextDecoder(..., { stream: true })`, `\n\n` framing, handles
  `provider/content/done/error` events, distinguishes
  unavailable/provider-failed/stream-failed/not-found, and offers
  `[Retry AI analysis]`.

### Admin UX

- Patterns list shows `Admin trusted reference · VALIDATED` vs `UNVERIFIED —
  re-upload a forensic-valid reference`, plus filename, upload date, and the
  SHA-256 fingerprint. Copy states exact-hash trust only; metadata/producer
  similarity alone never grants trust.
- Exact-match + current PASS shows `GENUINE` + `Trusted reference match`,
  with forensic checks underneath (never hidden). Exact-match + current FAIL
  shows the normal forensic result plus a `TRUSTED_REFERENCE_CONFLICT`
  indicator (conflict reason + failing checks) for human review. AI failures
  show `AI analysis unavailable / verification completed successfully /
  [Retry AI analysis]`.

## Related Documentation

- [API_REFERENCE.md](API_REFERENCE.md) — `/api/verify` endpoint details
- [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) — Architecture and component design
- [DATA_MODEL.md](DATA_MODEL.md) — Database schema (if verification results stored)
