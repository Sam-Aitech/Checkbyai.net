# Decision Log

Version: 1.3
Status: APPROVED
Last Updated: 2026-04-18

Rules:

1. Append-only.
2. Do not edit history except typo fixes.
3. Supersede with new entries.

---

## Entry Format

Each entry must contain:

1. Date
2. Status: PROPOSED or ACCEPTED or SUPERSEDED or REJECTED
3. Context and decision
4. Alternatives and consequence
5. Related scope/issues/prs

When to supersede vs create new:

1. Supersede when a prior decision is no longer valid.
2. Create new when the decision is independent even if related.

## Entries

### DEC-001: Adopt formal Phase 0 scope freeze artifacts

| Field | Value |
|------|-------|
| Date | 2026-04-18 |
| Status | ACCEPTED |
| Decider | @Sam-Aitech |
| Context | Team requested systematic start of alignment and scope freeze |
| Decision | Create and enforce `docs/phase-0` package with exception policy |
| Alternatives | Continue ad-hoc planning in chat and issue comments |
| Consequence | Better traceability, reduced scope creep, clearer gate to Phase 1 |
| Related | S-001, S-002, S-003 |

### DEC-002: Keep domain logic in app during alignment phase

| Field | Value |
|------|-------|
| Date | 2026-04-18 |
| Status | ACCEPTED |
| Decider | @Sam-Aitech |
| Context | Need clear boundary for upcoming operational orchestration planning |
| Decision | Preserve sponsor and COS domain logic inside Checkbyai services during Phase 0 and Phase 1 planning |
| Alternatives | Begin early extraction or rewrite of business logic into external orchestration layer |
| Consequence | Reduced execution risk and clearer delivery scope for Day 2 architecture decisions |
| Related | S-004, S-005, S-006 |

### DEC-003: Day 1 review gate outcome

| Field | Value |
|------|-------|
| Date | 2026-04-18 |
| Status | ACCEPTED |
| Decider | @Sam-Aitech |
| Context | Day 1 outputs required review before moving to Day 2 |
| Decision | Mark Day 1 review gate as GO for Day 2 |
| Alternatives | Hold progression pending additional artifact refinement |
| Consequence | Day 2 can proceed with architecture workshop, risk alignment, and freeze candidate prep |
| Related | KICKOFF Day 1 review gate, PRD approval record |

### DEC-004: Approve telemetry contract for critical job runs

| Field | Value |
|------|-------|
| Date | 2026-04-18 |
| Status | ACCEPTED |
| Decider | @Sam-Aitech |
| Context | Day 2 architecture review identified missing consistency in runtime observability |
| Decision | Adopt a unified job lifecycle contract with correlationId, runMode, timing, result, and failureReason |
| Alternatives | Keep per-job ad-hoc logging patterns |
| Consequence | Improves incident traceability and enforces consistent operational reporting in Phase 1 |
| Related | S-004, S-005, S-006, R-007, R-008 |

### DEC-005: Approve expanded health payload for operational freshness

| Field | Value |
|------|-------|
| Date | 2026-04-18 |
| Status | ACCEPTED |
| Decider | @Sam-Aitech |
| Context | Current health route is insufficient for scheduler and backlog diagnostics |
| Decision | Extend health payload to include per-job lastSuccessAt, lastFailureAt, staleByMinutes, running, and lastRunMode |
| Alternatives | Keep current minimal health response and rely on log forensics |
| Consequence | Faster diagnosis and lower operational MTTR |
| Related | S-005, R-002, R-007 |

### DEC-006: Day 2 review gate outcome

| Field | Value |
|------|-------|
| Date | 2026-04-18 |
| Status | ACCEPTED |
| Decider | @Sam-Aitech |
| Context | Day 2 required architecture and risk outputs with decision coverage |
| Decision | Mark Day 2 review gate as GO and approve freeze candidate for Day 3 |
| Alternatives | Hold for further architecture/risk refinement |
| Consequence | Day 3 can proceed with final freeze records and closure checklist |
| Related | Day 2 gate in kickoff agenda, architecture v1.2, risk register v1.2 |

### DEC-007: Day 3 freeze and Phase 0 closure

| Field | Value |
|------|-------|
| Date | 2026-04-18 |
| Status | ACCEPTED |
| Decider | @Sam-Aitech |
| Context | Day 3 requires final freeze records, closure checklist completion, and phase sign-off |
| Decision | Freeze Phase 0 scope and close Phase 0 end-to-end |
| Alternatives | Defer closure and keep phase in-progress |
| Consequence | Phase 1 implementation can start under frozen governance rules |
| Related | phase-0-scope-frozen-2026-04-18, EXIT-CHECKLIST completed, SCOPE freeze record |
