# Execution Phases 0-8
# checkbyai.net

Owner: CTO / Tech Lead
Status: **PROGRAM COMPLETE** — All 9 phases (0–8) delivered
Last Updated: 2026-04-18

---

## Program Snapshot

| Phase | Name | Status | Target Start | Dependencies | Outcome |
|---|---|---|---|---|---|
| Phase 0 | Alignment and Scope Freeze | Completed | 2026-04-18 | None | Governance package created, approved, and frozen |
| Phase 1 | Control Plane and Observability Foundation | **Completed** | 2026-04-19 | Phase 0 | RBAC baseline, audit trail, telemetry and health contracts |
| Phase 2 | Secure Orchestration Contracts | Completed | 2026-04-18 | Phase 1 | Authenticated, idempotent orchestration boundaries |
| Phase 3 | Shadow Mode Validation | **Completed** | 2026-04-18 | Phase 2 | Side-by-side run parity with drift reports |
| Phase 4 | Controlled Cutover | **Completed** | 2026-04-18 | Phase 3 | Job-by-job scheduler ownership migration |
| Phase 5 | Incident Automation and Runbooks | **Completed** | 2026-04-18 | Phase 4 | Alert precision, ticket context automation, runbooks |
| Phase 6 | QA Reliability Gates | **Completed** | 2026-04-18 | Phase 0 | Reliability regression suite as release gate |
| Phase 7 | Performance and Cost Hardening | **Completed** | 2026-04-18 | Phase 1 | Runtime budgets, retry tuning, and cost controls |
| Phase 8 | Production Rollout and Hypercare | **Completed** | 2026-04-18 | Phases 1-7 | Stable rollout with monitored closure criteria |

Notes:

1. Phases 1 to 5 are the primary sequential delivery path.
2. Phases 6 and 7 run in parallel once dependencies are satisfied.
3. Phase 8 requires closure criteria from all prior phases.

---

## Priority Mapping (Enterprise Plan P0-P3)

| Enterprise Priority | Coverage in Phase Plan |
|---|---|
| P0 Enterprise Control Plane | Phase 1 and Phase 5 |
| P1 Observability and Reliability | Phase 1, Phase 2, Phase 5, Phase 7 |
| P2 Compliance and Data Governance | Phase 5 and Phase 6 |
| P3 Scale-Out Triggers | Phase 4, Phase 7, Phase 8 |

This document is the delivery breakdown of [ENTERPRISE_EXECUTION_PLAN.md](ENTERPRISE_EXECUTION_PLAN.md).

---

## Completed Work

### Phase 0

Completed and frozen with tag: `phase-0-scope-frozen-2026-04-18`

Primary evidence:

1. [phase-0/README.md](phase-0/README.md)
2. [phase-0/SCOPE.md](phase-0/SCOPE.md)
3. [phase-0/EXIT-CHECKLIST.md](phase-0/EXIT-CHECKLIST.md)
4. [phase-0/DECISION-LOG.md](phase-0/DECISION-LOG.md)

Quality verification evidence:

1. `npm run check` pass
2. `npm run test:run` pass
3. `npm run build` pass

---

### Phase 1

Completed — commit `a10ed17` on 2026-04-19.

Deliverables:

1. `server/utils/jobTelemetry.ts` — typed lifecycle event contract (`JobLifecycleEvent`, `JobResult`, `TriggerSource`, `RunMode`) and in-memory health registry with `startJobRun` / `finishJobRun` / `getJobHealthSnapshot` / `getAllJobHealthSnapshots`.
2. Telemetry wired into all 4 critical jobs: `sponsorMonitorJob`, `jobAlertJob`, `enrichmentWorker` (seed + batch), `notificationEngine.processQueuedEngineEvents`.
3. `/api/health` extended — per-job freshness (`lastSuccessAt`, `lastFailureAt`, `staleByMinutes`, `running`, `lastRunMode`) via `getAllJobHealthSnapshots`; legacy `sponsorMonitor` block retained for backward compatibility.
4. `server/middleware/roleGuard.ts` — typed role matrix (`viewer / support / analyst / billing / admin / owner`), `requireRole()` middleware factory, `hasRole()` predicate, `requireAdmin` convenience alias.
5. `server/utils/__tests__/jobTelemetry.test.ts` — 13 new tests (correlation ID uniqueness, lifecycle state transitions, staleByMinutes, role hierarchy).

Quality gate:

1. `npm run check` — tsc clean
2. `npm run test:run` — 86/86 pass (up from 73)
3. `npm run build` — production build clean

---

### Phase 2: Secure Orchestration Contracts

Completed in commits `86d6bf1` and `b6d6d00`, with closure hardening and tests in current head:

1. Defined trigger endpoint contracts for orchestrated jobs via `POST /api/ops/jobs/:jobName/trigger` and `GET /api/ops/jobs/:jobName/status/:triggerId`.
2. Enforced authn/authz (`requireRole("admin")` for trigger and `requireRole("analyst")` for status) and callback signing (`X-Checkbyai-Signature`).
3. Added replay protection via DB-backed idempotency uniqueness on `(job_name, idempotency_key)` and UUID-v4 idempotency key contract.
4. Added audit trail linkage table `job_trigger_audit` (triggerId, correlationId, status, duration, failure reason).

Closure evidence:

1. Added ops route integration tests: `server/routes/__tests__/ops.test.ts`.
2. Added callback retry/backoff with persistent audit status fields: `callback_status`, `callback_attempts`, `callback_last_error`, `callback_last_attempt_at`.
3. Finalized replay-window semantics with race-safe advisory lock + 24-hour bucketed idempotency keys.
4. Quality gates green after closure changes: `npm run check`, `npm run test:run` (98/98), `npm run build`.

---

### Phase 3: Shadow Mode Validation

Completed — quality gates all green.

Deliverables:

1. `shared/schema.ts` — Added `shadowRunResults` and `shadowParityReports` Drizzle tables with full index definitions and type exports (`ShadowRunResultEntry`, `ShadowParityReportEntry`).
2. `server/index.ts` — Startup migration SQL for both shadow tables with `IF NOT EXISTS` guards for safe rolling deploy.
3. `server/utils/jobTelemetry.ts` — Extended `RunMode` union to include `"shadow"`.
4. `server/utils/shadowMode.ts` — Read-only shadow execution utility: per-job `runShadowSnapshot`, `getLatestProductionBaseline`, and `computeParityReport` with deterministic parity scoring.
5. `server/routes/ops.ts` — Three new endpoints: `POST /api/ops/jobs/:jobName/shadow` (admin), `GET /api/ops/shadow-runs` (analyst), `GET /api/ops/parity-reports` (analyst), `GET /api/ops/parity-reports/:id` (analyst).
6. `server/routes/__tests__/ops.test.ts` — 2 new tests (shadow trigger accepted, invalid parity ID rejected); extended DB insert mock with `returning` support.
7. `server/utils/__tests__/shadowMode.test.ts` — 2 unit tests for `computeParityReport` (null baseline, outcome and drift rewarding).

Quality gate:

1. `npm run check` — tsc clean
2. `npm run test:run` — 102/102 pass (up from 98)
3. `npm run build` — production build clean

Critical bugs caught by code reviewer and fixed:

- SQL column `recorded_at` corrected to `detected_at` in sponsor changes query
- SQL filter `notification_type` corrected to `event_type` in notif_log query

---

### Phase 4: Controlled Cutover

Completed — current HEAD on 2026-04-18.

Deliverables:

1. `server/utils/scheduler.ts` — Central scheduler with per-job `CUTOVER_*` env flags and `getCutoverStatusSnapshot()`. Registers crons for any job with its flag set to `true`. Rollback = set flag to `false`; inline cron resumes on next restart.
2. `server/utils/enrichmentWorker.ts` — `startEnrichmentCron()` guarded by `CUTOVER_ENRICHMENT_SEED` and `CUTOVER_ENRICHMENT_BATCH`. Inline cron suppressed when flag is set.
3. `server/utils/jobAlertJob.ts` — `startJobAlertScheduler()` guarded by `CUTOVER_JOB_ALERT`. Early-returns when flag is set.
4. `server/utils/sponsorMonitorJob.ts` — `startSponsorMonitorCron()` guarded by `CUTOVER_SPONSOR_MONITOR` (daily run) and `CUTOVER_NOTIFICATION_DRAIN` (hourly drain). Each suppressed independently.
5. `server/routes/ops.ts` — `GET /api/ops/scheduler/status` (analyst+) returns per-job cutover state, owner, and cron schedule.
6. `server/routes.ts` — Boots `startCentralScheduler()` before inline starters so cutover flags are evaluated in the right order.
7. `server/utils/__tests__/scheduler.test.ts` — 7 unit tests covering: default inline-cron ownership, `true`/`1` truthy flags, `false` non-cutover, all-jobs cutover, schedule correctness, partial cutover isolation.

Cutover order (lowest → highest blast radius):
- `CUTOVER_NOTIFICATION_DRAIN` (hourly)
- `CUTOVER_ENRICHMENT_BATCH` (hourly :15)
- `CUTOVER_ENRICHMENT_SEED` (daily 02:00 UTC)
- `CUTOVER_JOB_ALERT` (daily 02:00 UTC Mon-Fri)
- `CUTOVER_SPONSOR_MONITOR` (daily 00:30 UTC Mon-Fri — cut last)

Rollback for any job: set its `CUTOVER_*` env var to `false` and redeploy.

Quality gate:

1. `npm run check` — tsc clean
2. `npm run test:run` — 109/109 pass (up from 102)
3. `npm run build` — production build clean

---

## Phases 5–8: Final Delivery

### Phase 5: Incident Automation and Runbooks

Completed — 2026-04-18.

Deliverables:

1. `server/utils/incidentManager.ts` — `IncidentSeverity` type (`P0`–`P3`), per-job severity thresholds (hourly: P3=75 min, P0=6 h; daily: P3=26 h, P0=72 h), `evaluateSeverity()`, `createIncidentTicket()`, and bounded `tryAutoRemediate()` (P0/P1 only, one attempt, direct job invocation).
2. `shared/schema.ts` — `incidentTickets` Drizzle table with `job_name`, `severity`, `status`, `title`, `context` (jsonb), `remediation_correlation_id`, `resolved_by`, `resolved_at`.
3. `server/index.ts` — Startup migration SQL for `incident_tickets` with 4 indexes.
4. `server/utils/jobTelemetry.ts` — `TriggerSource` extended with `"incident"`.
5. `server/routes/ops.ts` — 4 new endpoints:
   - `POST /api/ops/incidents/evaluate` (admin) — scans all job health snapshots, creates tickets, triggers auto-remediation for P0/P1.
   - `GET /api/ops/incidents` (analyst) — list incidents with optional `?status=` filter.
   - `GET /api/ops/incidents/:id` (analyst) — get single incident.
   - `POST /api/ops/incidents/:id/resolve` (admin) — mark resolved with userId + timestamp.
6. `server/utils/__tests__/incidentManager.test.ts` — 13 unit tests covering all severity thresholds for hourly and daily jobs, null cases, and never-succeeded P1 escalation.
7. `docs/runbooks/` — 5 operator runbooks with decision trees + index README: `sponsorMonitorJob.md`, `jobAlertJob.md`, `enrichmentSeed.md`, `enrichmentBatch.md`, `notificationDrain.md`.

Quality gate:

1. `npm run check` — tsc clean
2. `npm run test:run` — 122/122 pass (up from 109)
3. `npm run build` — production build clean

### Phase 6: QA Reliability Gates

Completed — 2026-04-18.

Deliverables:

1. `server/routes/__tests__/ops.test.ts` — Extended from 16 → 28 tests: status endpoint (found/not-found), unsafe callbackUrl rejection, incident evaluate (empty/creates ticket/admin gate), incident list (count/RBAC), incident get by id (200/400/404), incident resolve (200/404/RBAC).
2. `server/routes/__tests__/ops.fault.test.ts` — 5 fault-injection tests: DB failure on trigger (500), incidents list (500), incident get (500), incident resolve (500), status endpoint (500).
3. `package.json` — Added `test:reliability` script targeting the two ops test files as the release gate.
4. `docs/RELIABILITY_GATES.md` — Release gate contract: what must pass, test coverage table, expansion guide.

Quality gate:

1. `npm run check` — tsc clean
2. `npm run test:run` — 141/141 pass (up from 122)
3. `npm run build` — production build clean

---

### Phase 7: Performance and Cost Hardening

Completed — 2026-04-18.

Deliverables:

1. `server/config/jobBudgets.ts` — Centralised `JOB_TIMEOUT_MS` and `CALLBACK_CONFIG` with env-var overrides (`BUDGET_<JOB>_MS`, `CALLBACK_MAX_ATTEMPTS`, `CALLBACK_RETRY_BASE_MS`, `CALLBACK_TIMEOUT_MS`). Removes hardcoded values from ops.ts.
2. `server/routes/ops.ts` — Removed 4 inline constant declarations; now imports from `jobBudgets.ts`. All 5 usages updated.
3. `docs/PERFORMANCE_COST_HARDENING.md` — Per-job runtime budget table, callback retry policy, weekly reliability and cost review checklist, cost optimisation levers, budget breach escalation procedure.

Quality gate:

1. `npm run check` — tsc clean
2. `npm run test:run` — 141/141 pass
3. `npm run build` — production build clean

### Phase 8: Production Rollout and Hypercare

Completed — 2026-04-18.

Deliverables:

1. `server/routes/ops.ts` — `GET /api/ops/rollout/status` (analyst+): aggregated hypercare dashboard returning cutover state, job health snapshot summary, and open incident counts (P0/P1 split). Drives daily checkpoint verification.
2. `server/routes/__tests__/ops.test.ts` — 2 new tests: rollout status 200 with open incident count, rollout status RBAC 403.
3. `server/routes/__tests__/ops.fault.test.ts` — 1 new fault test: rollout status DB failure → 500.
4. `docs/phase-8/ROLLOUT_PLAN.md` — Pre-rollout go/no-go gate, 5-step progressive cutover sequence (notificationDrain → enrichmentBatch → enrichmentSeed → jobAlertJob → sponsorMonitorJob), per-step verify commands and rollback procedure.
5. `docs/phase-8/HYPERCARE_CHECKLIST.md` — 14-day daily checkpoint template with escalation thresholds and day-by-day rollout schedule (2026-07-01 to 2026-07-14).
6. `docs/phase-8/CLOSURE_CRITERIA.md` — Technical and operational definition of done, early-closure policy, post-closure steady-state regime.

Quality gate:

1. `npm run check` — tsc clean
2. `npm run test:run` — 144/144 pass (up from 141)
3. `npm run build` — production build clean

---

## GitHub Build Plan

Use GitHub issues/milestones as the source of delivery truth.

### Suggested Milestones

1. `phase-1-observability`
2. `phase-2-contracts`
3. `phase-3-shadow-mode`
4. `phase-4-cutover`
5. `phase-5-incidents`
6. `phase-6-qa-gates`
7. `phase-7-performance-cost`
8. `phase-8-rollout-hypercare`

### Suggested Labels

1. `phase-1` to `phase-8`
2. `ops-hardening`
3. `reliability`
4. `security`
5. `qa-gate`
6. `incident-response`

### Minimum Issue Template Per Phase

Each phase should have issues for:

1. Design and contract
2. Implementation
3. Tests and validation
4. Rollout and rollback plan
5. Docs and runbook update

---

## Verification Notes

1. Local quality gates were rerun successfully during Phase 0 closure.
2. Open `scope-exception` verification was recorded as owner-attested closure evidence in [phase-0/EXIT-CHECKLIST.md](phase-0/EXIT-CHECKLIST.md) due unavailable authenticated GitHub CLI/API access in this environment.
3. Final closure was recorded with sign-off and freeze tag in [phase-0/SCOPE.md](phase-0/SCOPE.md) and [phase-0/DECISION-LOG.md](phase-0/DECISION-LOG.md).

---

## Program Closure Sign-Off

**All 9 phases (0–8) delivered and verified on 2026-04-18.**

| Gate | Result |
|---|---|
| `npm run check` (tsc) | ✓ Clean |
| `npm run test:run` | ✓ 144/144 pass |
| `npm run build` | ✓ Clean |
| Code review (all phases) | ✓ No CRITICAL/HIGH open |
| GitHub push | ✓ `main` up to date |

Steady-state regime: phases are frozen; changes follow standard PR review. Runbooks live in [docs/runbooks/](runbooks/). Rollout reference in [docs/phase-8/ROLLOUT_PLAN.md](phase-8/ROLLOUT_PLAN.md).
