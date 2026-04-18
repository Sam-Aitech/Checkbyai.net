# Risk Register

Version: 1.3
Status: FROZEN
Last Updated: 2026-04-18

| ID | Risk | Likelihood | Impact | Mitigation | Owner | Related Debt | Status |
|----|------|------------|--------|------------|-------|--------------|--------|
| R-001 | Scope creep after freeze | High | High | Enforce exception template and approval thresholds | Sam Aitech (PO) | TD-005 | Mitigation Active |
| R-002 | Critical job reliability unknown | Medium | High | Add explicit health and observability acceptance criteria in Phase 1 | Sam Aitech (Tech Lead) | TD-003, TD-004 | Mitigation Planned |
| R-003 | Large route and schema files slow delivery | High | Medium | Track decomposition items in debt inventory and backlog | Sam Aitech (Tech Lead) | TD-001, TD-002 | Mitigation Planned |
| R-004 | CI gate failures delay kickoff | Low | Medium | Baseline gates already validated; keep mandatory pre-freeze rerun | Sam Aitech (QA) | TD-005 | Monitoring |
| R-005 | Unclear ownership on cross-cutting work | Low | High | RACI assignments completed and approved | Sam Aitech (Tech Lead) | TD-005 | Mitigated |
| R-006 | Billing/auth regressions during later refactors | Medium | High | Require test gates before touching billing/auth modules | Sam Aitech (QA) | TD-005 | Mitigation Planned |
| R-007 | Dual-mode execution drift (queue vs inline) causes inconsistent run behavior | Medium | High | Emit runMode in job telemetry and include mode in health summary | Sam Aitech (Backend) | TD-003, TD-004 | Mitigation Planned |
| R-008 | Missing correlation id prevents incident traceability across pipeline stages | Medium | High | Enforce correlationId in every job event contract | Sam Aitech (Backend) | TD-003 | Mitigation Planned |
