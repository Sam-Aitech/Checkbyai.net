# Execution Phases 0-8
# checkbyai.net

Owner: CTO / Tech Lead
Status: Active Program Plan
Last Updated: 2026-04-18

---

## Program Snapshot

| Phase | Name | Status | Target Start | Dependencies | Outcome |
|---|---|---|---|---|---|
| Phase 0 | Alignment and Scope Freeze | Completed | 2026-04-18 | None | Governance package created, approved, and frozen |
| Phase 1 | Control Plane and Observability Foundation | **Completed** | 2026-04-19 | Phase 0 | RBAC baseline, audit trail, telemetry and health contracts |
| Phase 2 | Secure Orchestration Contracts | In Progress | 2026-04-18 | Phase 1 | Authenticated, idempotent orchestration boundaries |
| Phase 3 | Shadow Mode Validation | Planned | 2026-05-20 | Phase 2 | Side-by-side run parity with drift reports |
| Phase 4 | Controlled Cutover | Planned | 2026-06-03 | Phase 3 | Job-by-job scheduler ownership migration |
| Phase 5 | Incident Automation and Runbooks | Planned | 2026-06-17 | Phase 4 | Alert precision, ticket context automation, runbooks |
| Phase 6 | QA Reliability Gates | Planned (Parallel) | 2026-04-22 | Phase 0 | Reliability regression suite as release gate |
| Phase 7 | Performance and Cost Hardening | Planned (Parallel) | 2026-05-20 | Phase 1 | Runtime budgets, retry tuning, and cost controls |
| Phase 8 | Production Rollout and Hypercare | Planned | 2026-07-01 | Phases 1-7 | Stable rollout with monitored closure criteria |

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

## Left To Build (Phase 2-8)

### Phase 2: Secure Orchestration Contracts

Completed in commit `86d6bf1`:

1. Defined trigger endpoint contracts for orchestrated jobs via `POST /api/ops/jobs/:jobName/trigger` and `GET /api/ops/jobs/:jobName/status/:triggerId`.
2. Enforced authn/authz (`requireRole("admin")` for trigger and `requireRole("analyst")` for status) and callback signing (`X-Checkbyai-Signature`).
3. Added replay protection via DB-backed idempotency uniqueness on `(job_name, idempotency_key)` and UUID-v4 idempotency key contract.
4. Added audit trail linkage table `job_trigger_audit` (triggerId, correlationId, status, duration, failure reason).

Remaining to close Phase 2:

1. Add integration tests for the `/api/ops/jobs/*` contracts (authz paths, replay response semantics, callback behaviors).
2. Add retry/backoff for failed callback delivery and persistent callback failure status.
3. Finalize 24-hour replay-window semantics (current implementation enforces strict uniqueness by idempotency key).

### Phase 3: Shadow Mode Validation

1. Run parallel orchestration checks without full cutover.
2. Compare parity by run outcome, latency, and retries.
3. Produce drift report and remediation list.

### Phase 4: Controlled Cutover

1. Cut over delayed notification drain.
2. Cut over enrichment batch.
3. Cut over job alerts.
4. Cut over sponsor monitor last.
5. Preserve one-command rollback path for each job.

### Phase 5: Incident Automation and Runbooks

1. Add severity matrix and alert thresholds.
2. Auto-create context-rich incident tickets.
3. Add bounded auto-remediation actions.
4. Publish operator runbooks with decision trees.

### Phase 6: QA Reliability Gates

1. Add integration tests for trigger, retry, cancel, callback flows.
2. Add outage and fault-injection tests.
3. Enforce release blocking on reliability suite failures.

### Phase 7: Performance and Cost Hardening

1. Define runtime budgets per critical job.
2. Tune retries and backoff policies.
3. Add weekly reliability and cost review loop.

### Phase 8: Production Rollout and Hypercare

1. Execute progressive rollout with rollback guardrails.
2. Run 14-day hypercare with daily checkpoint.
3. Close only after zero critical regressions in window.

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
