# Phase 8: 14-Day Hypercare Checklist
# checkbyai.net

Owner: CTO / Tech Lead
Status: Active
Last Updated: 2026-04-18

---

## Daily Checkpoint Template

Copy and fill out one block per day. All checks must pass before that day's checkpoint is signed off.

---

### Day N — YYYY-MM-DD

**Operator:** _____
**Time (UTC):** _____

#### 1. Rollout Status

```bash
GET /api/ops/rollout/status
```

- [ ] `incidents.p0Open` = 0
- [ ] `incidents.p1Open` = 0
- [ ] `health.staleCount` = 0
- [ ] All 5 jobs `cutover` flags match expected state for this rollout step

#### 2. Reliability Gate

```bash
npm run test:reliability
```

- [ ] All tests pass (expected: 30 tests — 28 integration + 6 fault — after Phase 8 additions)

#### 3. Open Incidents

```bash
GET /api/ops/incidents?status=open
```

- [ ] No unacknowledged P0 or P1 incidents
- [ ] Any open P2/P3 have an assigned owner and ETA

#### 4. Job Health Spot-Check

```bash
GET /api/health
```

- [ ] All 4 critical jobs: `staleByMinutes` < threshold
- [ ] No job `running = true` for abnormally long duration

#### 5. Scheduler Ownership

```bash
GET /api/ops/scheduler/status
```

- [ ] Cutover flags match the day's expected rollout step (per ROLLOUT_PLAN.md)

#### Notes

_Record any anomalies, near-misses, or manual interventions here._

---

**Checkpoint Status:** PASS / FAIL / ESCALATED

---

## 14-Day Schedule

| Day | Date | Rollout Step | Status |
|-----|------|--------------|--------|
| 1 | 2026-07-01 | Step 1 (notificationDrain) | — |
| 2 | 2026-07-02 | Step 1 stable | — |
| 3 | 2026-07-03 | Step 2 (enrichmentBatch) | — |
| 4 | 2026-07-04 | Step 2 stable | — |
| 5 | 2026-07-05 | Step 3 (enrichmentSeed) | — |
| 6 | 2026-07-06 | Step 3 stable | — |
| 7 | 2026-07-07 | Step 4 (jobAlertJob) | — |
| 8 | 2026-07-08 | Step 4 stable | — |
| 9 | 2026-07-09 | Step 5 (sponsorMonitorJob) | — |
| 10 | 2026-07-10 | Step 5 stable | — |
| 11 | 2026-07-11 | Full cutover stable | — |
| 12 | 2026-07-12 | Full cutover stable | — |
| 13 | 2026-07-13 | Full cutover stable | — |
| 14 | 2026-07-14 | Closure criteria review | — |

---

## Escalation Thresholds

| Condition | Action |
|---|---|
| P0 incident opens | Page on-call immediately. Evaluate rollback. |
| P1 incident opens | Notify operator within 30 min. Assess rollback. |
| `staleByMinutes` > P3 threshold on 2+ consecutive checkpoints | Escalate to rollback candidate. |
| `test:reliability` fails | Block any further cutover steps. Investigate before proceeding. |

---

## Closure

See [CLOSURE_CRITERIA.md](CLOSURE_CRITERIA.md) for the definition of done.
