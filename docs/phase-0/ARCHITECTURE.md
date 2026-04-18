# Architecture Snapshot (Phase 0)

Version: 1.3
Status: FROZEN
Last Updated: 2026-04-18

## Current Shape

Checkbyai is a Node/Express + React monolith.

1. Backend services and routes: server
2. Frontend app: client/src
3. Shared schema and contracts: shared

## Current Critical Job Execution Paths

1. Sponsor monitor + delayed queue drain scheduler in [server/utils/sponsorMonitorJob.ts](../../server/utils/sponsorMonitorJob.ts)
2. Job alert scheduler in [server/utils/jobAlertJob.ts](../../server/utils/jobAlertJob.ts)
3. Enrichment seed and batch scheduler in [server/utils/enrichmentWorker.ts](../../server/utils/enrichmentWorker.ts)
4. Queue fallback behavior in [server/services/jobQueue.ts](../../server/services/jobQueue.ts)
5. Health route in [server/routes/health.ts](../../server/routes/health.ts)

## Data Flow (Current)

1. Scheduler triggers run function.
2. Run acquires lock or checks queue availability.
3. Pipeline executes and writes logs and DB updates.
4. Notifications and delayed events are dispatched or queued.
5. Health endpoint exposes basic status.

## Known Bottlenecks and Constraints

1. Multiple cron schedulers are spread across modules.
2. Reliability telemetry is not centralized in one operational view.
3. Queue fallback to inline execution can hide operational differences across environments.
4. Route and schema complexity increase change risk for operations-heavy updates.

## Day 2 Architecture Workshop Outcomes

1. Scheduler ownership remains in-app during current phase, with explicit telemetry contract for each critical job.
2. Sponsor monitor remains the source of truth for sponsor-state transitions and lock semantics.
3. Health endpoint contract will be expanded in Phase 1 to include per-job lastSuccessAt, lastFailureAt, and current state.
4. Queue fallback behavior remains supported, but run mode must be emitted in every execution record.

## Phase 1 Target Contract (Approved)

### Job Lifecycle Event Contract

Required fields for each critical job execution event:

1. correlationId
2. jobName
3. triggerSource
4. runMode
5. startedAt
6. completedAt
7. durationMs
8. result: success or failed or skipped or retried
9. failureReason (nullable)

### Health Contract Additions

Required health payload additions per job:

1. lastSuccessAt
2. lastFailureAt
3. running
4. staleByMinutes
5. lastRunMode

## Target-State Notes For Phase 1

1. Standardize job lifecycle events: queued, started, succeeded, failed, retried, skipped.
2. Add correlation ids across trigger to completion.
3. Extend health with per-job freshness and last outcome.
4. Gate operational releases with explicit check, test, and build verification.

## Open Decision References

1. Scheduling ownership strategy: see DEC-001 and DEC-002 in [DECISION-LOG.md](./DECISION-LOG.md)
2. Scope impact: see [SCOPE.md](./SCOPE.md)
3. Risk impact: see [RISK-REGISTER.md](./RISK-REGISTER.md)
4. Day 2 gate and freeze-candidate progression: see DEC-004, DEC-005, DEC-006 in [DECISION-LOG.md](./DECISION-LOG.md)
