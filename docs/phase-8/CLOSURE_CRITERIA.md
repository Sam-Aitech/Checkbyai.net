# Phase 8: Closure Criteria
# checkbyai.net

Owner: CTO / Tech Lead
Status: Active
Last Updated: 2026-04-18

---

## Definition of Done

Phase 8 is closed only when ALL of the following are true at the end of Day 14 of hypercare:

### Technical Criteria

- [ ] All 5 jobs running under central scheduler (`CUTOVER_*` = `true` for all)
- [ ] `GET /api/ops/rollout/status` returns `incidents.p0Open` = 0 and `incidents.p1Open` = 0
- [ ] `GET /api/ops/rollout/status` returns `health.staleCount` = 0
- [ ] `npm run test:reliability` — green, all tests pass
- [ ] `npm run test:run` — green, full suite passes
- [ ] Zero P0 incidents opened and unresolved during the 14-day hypercare window
- [ ] Zero critical regressions in GOV.UK sponsor register monitoring during window
- [ ] No manual rollback of any `CUTOVER_*` flag was required in the final 5 days

### Operational Criteria

- [ ] All 14 daily hypercare checkpoints signed off by operator ([HYPERCARE_CHECKLIST.md](HYPERCARE_CHECKLIST.md))
- [ ] Any P2/P3 incidents opened during hypercare have been reviewed and either resolved or triaged with a known fix
- [ ] Runbooks reviewed and confirmed accurate against production behaviour ([docs/runbooks/README.md](../runbooks/README.md))
- [ ] `docs/RELIABILITY_GATES.md` coverage table is accurate against actual test count

### Sign-Off

When all criteria above are checked:

1. Update `docs/EXECUTION_PHASES_0_8.md` — set Phase 8 status to **Completed** with actual completion date
2. Tag the commit: `phase-8-hypercare-closed-<date>`
3. Record final test counts and any notable incidents in Phase 8 closure block

---

## Early Closure

Early closure (before Day 14) is not permitted unless:
- A production incident forces a hold, at which stage the 14-day window resets from incident resolution
- The CTO/Tech Lead explicitly extends the window and documents the reason

---

## What Happens After Closure

- `CUTOVER_*` flags remain `true` in production env permanently
- Inline cron guards in job files remain in place as safety dead-letter fallback
- Incident automation (`POST /api/ops/incidents/evaluate`) becomes part of daily ops
- Phase 8 exits to steady-state operations under the runbook + reliability gate regime
