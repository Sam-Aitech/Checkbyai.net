# Forensic Corpus + Adversarial Testing — Conservative Plan (v0)

Deployment target: **user-guidance-only** with explicit `SUSPICIOUS`
abstention. No tribunal-evidential claims until reproducibility, provenance,
immutable evidence capture, model/version pinning, audit logs, hashing and
independent validation are established. The evidence bundle built in
`server/services/forensicTypes.ts` is the foundation for that later hardening —
it is internal-only and never decides the verdict today.

Infrastructure: **Node + Python only**. No render farm, no Rust/WASM rewrite.
The parser is isolated behind `IForensicParser` (`PDFAnalyzer` =
`node-regex-v2`) so a future parser can replace it without touching
`server/routes/verification.ts` or `server/workers/pdfVerifyWorker.ts`.
Early budget goes to **ground-truth data, adversarial testing and
reproducibility**.

## 1. Corpus layout

```
data/forensic-corpus/v0/
  genuine/                     + .provenance.json per file
  synthetic/                   generated, { seedSha256, operator, seed, params }
  redteam/                     engineered to pass the current 6-check gate
  quarantine_confirmed_fake/   EMPTY — see its README for the entry gate
```

Rules: never train on `suspicious` as `fake`; never train without provenance;
split by template/FOP version or date, never random.

## 2. Tampering taxonomy (synthetic operators)

Each operator is deterministic + seeded. For every feature, we mutate and
measure which signals survive (Phase 2 robustness matrix).

| # | Operator | What changes | Expected to break |
|---|----------|--------------|-------------------|
| 1 | xmp-value-swap | one XMP value differs from Info | Info/XMP consistency |
| 2 | xmp-field-drop | remove 1 of the 8 required XMP fields | XMP presence |
| 3 | xmp-order-shuffle | reorder XMP tags | XMP order |
| 4 | xmp-rebuild | strip + re-emit XMP with same values | order/container regex, history |
| 5 | info-producer-spoof | Producer/Creator → `Apache FOP` | producer checks (false negative intended) |
| 6 | tool-spoof | Producer → iLovePDF/Canva/Word etc. | editing-tool fingerprint |
| 7 | date-skew | ModDate +N days / Mod<Create | date consistency |
| 8 | history-inject | append xmpMM:History entry (editor agent) | history check |
| 9 | xref-rebuild | re-emit xref/startxref (same content) | startxref count |
| 10 | incremental-append | append incremental section | incremental-updates |
| 11 | linearize-toggle | add/strip `/Linearized` | linearized baseline |
| 12 | metadata-strip | remove Info + XMP entirely | presence checks → SUSPICIOUS |
| 13 | print-to-pdf | re-export (loses XMP containers) | containers, order, fonts |
| 14 | image-only-rebuild | rasterize + re-embed (no text ops) | BT/ET counts, wordcount, entropy |

Operators 5, 9, 10, 11 are the **red-team core**: combined they simulate an
attacker who read the 6-check logic and cloned all string-level signals.
The question Phase 1 answers is whether `feature-schema-v1` structural
signals (`xrefSectionCount`, `hasPrevChain`, `objectCountEstimate`,
`streamCount`, `streamLengthMismatchCount`, `hasUnembeddedFont`,
`textBlockCount`/`textOperatorCount`, entropy) still discriminate when all
strings are cloned.

## 3. Phase 1 experiment (the only one that matters now)

> Which technically specific PDF-processing mechanism provides measurable
> discrimination that simpler, known PDF-analysis techniques cannot?

Method: champion (current rules, served) vs challenger (rules + structural
features, shadow-logged only). Report PR-AUC, FPR@95%TPR, red-team bypass
rate, P50/P95 + RSS, ECE. Pre-declared promotion bar (proposal): challenger
must cut red-team bypass by ≥50% relative AND not regress FPR or P95 before
any verdict-logic change is even discussed.

## 4. Phase 2 robustness matrix

Rows = features in `StructuralFeatures`; columns = operators above; cells =
survival rate (fraction of mutated docs where the feature still flags or still
matches genuine baseline as appropriate). The matrix — not accuracy — is the
patent-relevant artefact: it evidences a tamper-resistant extraction property
if one exists.

## 5. Phase 3 candidate (only if Phase 1–2 justify)

If `structural state + xref topology + generation invariants + history +
tamper-resistant extraction` shows a demonstrable technical effect, freeze
`feature-schema-v2` + `rule-set-v2` and take the metrics + ablation +
red-team chart to the patent attorney. Claim the **computation**, never
"AI detects fake CoS".

## 6. Phase 1 baseline (2026-09-19, seed 42 — committed artefact)

Regenerate: `npm run forensic:gen -- --seed 42` (byte-identical across runs,
verified by manifest SHA). Measure: `npm run forensic:eval` →
`data/forensic-corpus/v0/SHADOW_BASELINE.json` (57 cases since the
`rt-deep-backdate` addition, zero trusted patterns, zero admin context,
quarantine never read).

| Group | Genuine | Suspicious | Fake |
|-------|---------|------------|------|
| genuine (3) | 3 | 0 | 0 |
| synthetic (42) | 14 | 27 | 1 |
| redteam (12) | **12 (bypass rate 1.0)** | 0 | 0 |

Latency: p50 4ms, p95 7ms. Key surprises (expected → actual):

- `date-skew` → genuine: a single -20 warning (confidence 80) is not enough
  to reach `suspicious` — documents weak-single-warning behaviour.
- `history-inject` (Photoshop agent) → genuine: the pattern layer says fake,
  but the combiner trusts a GENUINE six-check over it — combiner override
  behaviour now measured, not assumed.
- `linearize-toggle` on the linearized seed → suspicious: stripping the
  `/Linearized` header while leaving 2x `startxref` correctly reads as a
  re-save. The gate is smarter here than the operator author assumed.
- All four red-team operators (`rt-content-swap`, `rt-hidden-object`,
  `rt-date-clone`, `rt-deep-backdate`) pass the gate while changing content,
  object count, and dates respectively — including a backdate to 1999, before
  XMP and PDF 1.4 existed. `rt-hidden-object` moves `objectCountEstimate` +1
  while the gate stays GENUINE — first proof that a structural signal sees
  what strings miss.

Promotion bar for any challenger (unchanged): cut red-team bypass by ≥50%
relative with no FPR or P95 regression before any verdict-logic change is
discussed.

## 7. Phase 2 robustness matrix (2026-09-19, parser v2 — committed artefact)

Regenerate: `npm run forensic:matrix` → `data/forensic-corpus/v0/ROBUSTNESS_MATRIX.json`
(588 cells, deterministic across runs — verified by report SHA).
Method: per (feature × operator × seed) cell, exact-equality diff of
`feature-schema-v1` values between seed and derived case, classified as
`stable-robust / sensitive / side-effect / blind / volatile / rebuild`
(see `server/services/forensicRobustness.ts` for the expected-move map).

Result: **robustness 96%, sensitivity 100%, 0 blinds.**

- All 10 string-level operators (XMP edits, producer spoofs, date-skew,
  history-inject, metadata-strip, print-to-pdf): **100% stability** on every
  scored structural field. Body topology is not spoofable by string edits.
- `xref-rebuild` 92%, `linearize-toggle` 89%, `incremental-append` 67% —
  lower because they genuinely move structure (that is their sensitivity,
  recorded as `sensitive`, not instability).
- 1 remaining side-effect, read as true detection: stripping the
  `/Linearized` header without removing the extra `startxref` raises
  `incrementalUpdatesAboveBaseline` 0→1 (a naive linearization-strip really
  does look like a re-save).
- `fileSizeBytes` + entropy are `volatile` by construction (move on any byte
  change): tamper-evident, not tamper-specific — reported, never scored.
- `image-only-rebuild` is a baseline-reset (`rebuild` column, excluded).

Red-team movement exhibit (structural fields moved per attack, all 3 seeds):

| Attack | Scored signals moved | Only volatile moved |
|--------|---------------------|---------------------|
| `rt-content-swap` (Title altered) | none | fileSize, entropy |
| `rt-hidden-object` (grafted obj 99) | **objectCountEstimate 1→2** | fileSize |
| `rt-date-clone` (consistent backdate) | none | entropy only |

So: the graft is already caught structurally (`objectCountEstimate`), while
content-swap and consistent backdating move nothing scored — the precise,
measured gap Phase 3 must close. Note the parser fix this phase exposed:
the `xref` counter double-counted the substring inside `startxref`
(`incremental-append` appeared to add an xref table for the wrong reason);
fixed with a lookbehind (`node-regex-v1` → `v2`) and both baselines
regenerated. A confounded counter in a patent exhibit is worse than none.

## 8. Phase 3 discrimination experiments (2026-09-19 — committed artefact)

Run: `npm run forensic:discriminate` → `data/forensic-corpus/v0/DISCRIMINATION.json`
(57 cases, trusted set = the 3 genuine seeds simulating `admin_reference`
ingestion). Challenger mechanisms live in `server/services/forensicChallengers.ts`,
which is **shadow-only and must never be imported from served-verdict paths**.

| Experiment | Mechanism | Result |
|------------|-----------|--------|
| Exp A (near-reference binding) | Content fields (title/author/subject) + object inventory must agree with a same-generator trusted reference; divergence downgrades genuine→suspicious | Champion bypass 12/12 → challenger 3/12 (**75% cut**), 0 genuine regressions |
| Exp B (generation invariants) | `generation-invariants.json` (PDF spec years, XMP 2001); impossible dates condemn | `rt-deep-backdate` (1999) → fake on all seeds; plausible 2025 backdate still passes (documented residual blindness) |
| Exp C (text-opcode profile) | `textBlockCount`/`textOperatorCount` distribution over corpus | **BLOCKED**: all cases 0/0 — stand-in seeds carry no text streams; requires real captures |

Per-attack challenger outcomes (all 3 seeds identical): `rt-content-swap` →
suspicious (content), `rt-hidden-object` → suspicious (structural),
`rt-date-clone` → genuine (**residual bypass**), `rt-deep-backdate` → fake
(anachronism).

Promotion verdict: **BLOCKED**. The bypass-cut (75% ≥ 50%) and zero-regression
legs are met, but FPR on confirmed fakes is unmeasurable with an empty
quarantine, and the challengers are uncalibrated on real generator diversity
(a FOP version change could shift object counts and trip the structural
binding). No verdict-logic change without those measurements. Honest bottom
line: near-reference binding + impossibility checks are a real, measured
improvement in guidance quality, but subtle consistent forgeries remain
detectable only through trusted provenance — and no technical invention
separable from that has yet been demonstrated for the patent attorney.

## 9. Evidence bundle contract

Every verification persists `analysisDetails.forensicEvidence`:

```
document_hash, parser_version, rule_set_version, model_version,
feature_schema_version, extracted_features, structural_features,
forensic_checks, input_provenance, processing_timestamp,
final_verdict, final_confidence, abstention_reason, evidence_bundle_hash
```

User-facing stays: `GENUINE | SUSPICIOUS | FAKE` + short summary.
`SUSPICIOUS` always carries an `abstentionReason`.
