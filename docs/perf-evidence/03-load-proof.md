# Proof 3 — Concurrent API traffic while PDF jobs execute

## What changed
- `server/utils/perfMonitor.ts` (new): per-route latency reservoirs
  (p50/p95/p99/max, 2048-sample cap), `perf_hooks.monitorEventLoopDelay`
  sampler (warns >100 ms p99 every 30 s), heap/RSS tracking, BullMQ
  wait-vs-service timing (`processedOn - timestamp`, service wall time).
- `server/index.ts`: `perfMiddleware` mounted after body parsing.
- `server/services/jobQueue.ts`: `runJobWithSentryTrace` records wait/service
  per queue; new `getQueueCounts()` (waiting/active/completed/failed/delayed).
- `server/services/monitoringService.ts`: `GET /metrics/perf` (+ reset)
  under the existing admin gate — returns the percentile snapshot + queue
  counts. Same `ENABLE_ADMIN_METRICS_ROUTES=true` prod opt-in as `/metrics`.
- `scripts/load/verify-load.mjs` (new, zero-dep): locked 70/20/10 mix per
  worker (reads: health, directory, stats, latest-change; PDF uploads with
  job polling; auth-admin: `/api/auth/user`, `/api/my-verifications`,
  sponsor-monitor status); captures client-side p50/p95/p99, error rate,
  job accepted/completed/failed, and the server `/metrics/perf` snapshot into
  `docs/perf-evidence/load-<label>-<ts>.json` (mix recorded in file).

## Verified in this environment
- `node --check scripts/load/verify-load.mjs` passes.
- `npx tsc --noEmit`: zero errors in new/touched files.

## Live runbook (operator: staging with recorded provenance — see README)
1. `ENABLE_ADMIN_METRICS_ROUTES=true` on the API instance.
2. Baseline: `node scripts/load/verify-load.mjs --base <url> --cookie "<admin+COS>" --label baseline --duration 60 --concurrency 8`
3. Under load: same + `--pdf ./sample-10mb.pdf` (locked profile: 8 workers,
   60 s, 10 MB PDF cap, 70/20/10 reads/uploads/auth mix per worker).
4. Compare the two JSON files: client p50/p95/p99, `server.perf.eventLoopMs`,
   `server.perf.heap`, `server.perf.queues.verification` (waitMs/serviceMs),
   `server.queues` (failed counts), `jobs` accepted/completed/failed.

## Pass thresholds (proposed — confirm before sign-off)
- API p95 degradation ≤ 20% vs baseline; p99 ≤ 2× baseline.
- Event-loop p99 < 100 ms in both runs.
- API error rate 0%; every accepted PDF job reaches `completed` or `failed`
  with a recorded reason (no silent loss).

## Evidence (commit the JSON files before sign-off)
- [ ] `load-baseline-*.json`
- [ ] `load-under-load-*.json`
- [ ] delta table pasted here
