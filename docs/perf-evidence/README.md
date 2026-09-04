# Optimisation Verification Programme — Proof Index

Do not mark the programme complete until every checkbox below is satisfied.
Code-side work is done; unchecked items require a live environment
(Docker + staging DB + deployed URL) that this build machine lacks.

| # | Proof | Code/test evidence (done) | Live evidence (operator) | Status |
|---|---|---|---|---|
| 1 | Separate API/worker processes + CPU/RAM limits | `01-process-proof.md`: entrypoint, ROLE split, compose limits, dual-bundle build | `docker stats`, boot logs, kill-worker transcript | ⏳ live run |
| 2 | Durable document key across instances | `02-storage-proof.md`: DocumentStore (local/S3), key-only jobs, orphan purge | two-host run, restart-mid-job, empty bucket | ⏳ live run |
| 3 | API p50/p95/p99 + loop/heap/queue under load | `03-load-proof.md`: perf reservoirs, `/metrics/perf`, `scripts/load/verify-load.mjs` | `load-baseline-*.json`, `load-under-load-*.json`, delta table | ⏳ live run |
| 4 | EXPLAIN (ANALYZE, BUFFERS) before/after | `04-db-proof.md`: `scripts/db/explain-sponsors.sh` (4 real shapes) | `explain/before|after/*.txt`, index-usage table | ⏳ live run |
| 5 | Double upload, evict first, poll both | `05-status-correctness.md` + `verifyJobs.test.ts` 3/3 pass | staging double-upload transcript | ⏳ live run |
| 6 | Redis down → safe 503 reject | `06-failure-mode.md` + `verifyJobs.test.ts` 2 failure tests pass | 503 transcript, flat perf, recovery, no orphans | ⏳ live run |
| 7 | Bundle + Lighthouse/CWV before/after | `07-frontend-proof.md`: bundle table + budget CI gate (this machine) | LHCI reports, DOM counts, 7-day field RUM | ⏳ live run |

## Pass thresholds (confirm before sign-off)
- API p95 ≤ +20% under load; p99 ≤ 2×; event-loop p99 < 100 ms; 0 API errors.
- Q1/Q2 EXPLAIN selects the 0024 indexes; no residual seq scans.
- LCP ≤ 2.5 s (warn), CLS ≤ 0.1 (error), INP ≤ 300 ms (warn) — see `lighthouserc.cjs`.
- All live transcripts committed under this directory.
