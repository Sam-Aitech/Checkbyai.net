# Forensic Corpus v0 — Genuine + Derived Only (No Confirmed Fakes Yet)

Conservative discipline: there is **no sufficiently large, legally usable
confirmed-fake corpus** at this stage. v0 therefore contains only:

- `genuine/` — known genuine CoS PDFs across FOP versions/years. Each file MUST
  ship with a `.provenance.json` sidecar: `{ source, collectedAt, whyGenuine,
  sha256 }`. Dedupe by SHA-256. No file without provenance.
- `synthetic/` — deterministic, scripted mutations of genuine seeds (see
  `docs/FORENSIC_CORPUS.md` taxonomy). Generated, never hand-edited. Each file
  records `{ seedSha256, operator, seed, params }`.
- `redteam/` — adversarial clones engineered to pass the current 6-check gate
  (correct 8 XMP in order + FOP producer + baseline startxref + Info/XMP
  consistency). Used to measure **bypass rate** of the champion pipeline.
- `quarantine_confirmed_fake/` — EMPTY scaffold. Expert-labelled cases enter
  ONLY with documented chain-of-custody + independent review. Quarantined files
  are **held-out validation first, never training**, until the provenance gate
  passes. See `quarantine_confirmed_fake/README.md`.

Hard rules:

1. NEVER train on `suspicious` outputs as though they were fake.
2. NEVER copy a file into training without provenance.
3. Splits are by template/FOP version or collection date — never random — to
   avoid leakage.
4. Every eval reports: PR-AUC, FPR@95%TPR, red-team bypass rate, P50/P95
   latency + RSS, and (when probabilities exist) ECE.
