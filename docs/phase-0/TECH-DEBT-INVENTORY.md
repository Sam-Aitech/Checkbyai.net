# Technical Debt Inventory

Version: 1.2
Status: FROZEN
Last Updated: 2026-04-18

| ID | Area | Description | Severity | Suggested Action | Owner | Related Risk | Status |
|----|------|-------------|----------|------------------|-------|--------------|--------|
| TD-001 | Routing | High concentration of logic in route layers can increase change risk | High | Continue route modularization and isolate orchestration paths | Backend | R-003 | Open |
| TD-002 | Schema organization | Shared schema complexity increases migration and review overhead | High | Split schema by domain with stable export index | Backend | R-003 | Open |
| TD-003 | Job observability | Scheduled jobs lack single-pane run telemetry | High | Add job lifecycle telemetry and SLO reporting | Backend | R-002 | Open |
| TD-004 | Worker resilience | Retry/backoff and stale job handling need explicit governance | Medium | Add reliability checks and runbook actions | Backend | R-002 | Open |
| TD-005 | Release safety | Reliability-focused gates need stricter pre-release workflow | Medium | Enforce build/check/test gates for operational changes | QA | R-001, R-004, R-005, R-006 | Open |
