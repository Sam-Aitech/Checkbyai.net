# Phase 8: Production Rollout Plan
# checkbyai.net

Owner: CTO / Tech Lead
Status: Active
Last Updated: 2026-04-18

---

## Pre-Rollout Go/No-Go Gate

All conditions must be true before Step 1:

- [ ] `npm run test:reliability` — all 30 tests pass (ops + fault suites)
- [ ] `npm run test:run` — full suite green
- [ ] `npm run build` — production build clean
- [ ] `npm run check` — tsc clean
- [ ] `GET /api/ops/rollout/status` — `incidents.p0Open` = 0 and `incidents.p1Open` = 0
- [ ] `GET /api/ops/rollout/status` — `health.staleCount` = 0
- [ ] All runbooks reviewed by operator ([docs/runbooks/](../runbooks/README.md))
- [ ] CALLBACK_SIGNING_SECRET rotated for production env
- [ ] `BUDGET_*` env vars reviewed against observed P95 runtimes in staging

If any condition is false: do not proceed. Resolve and re-check.

---

## Cutover Order (Lowest → Highest Blast Radius)

### Step 1 — notificationDrain

Set: `CUTOVER_NOTIFICATION_DRAIN=true`

**Verify (wait 2 cron cycles = 2 hours):**
```bash
GET /api/ops/scheduler/status          # NOTIFICATION_DRAIN.owner = "central-scheduler"
GET /api/ops/rollout/status            # health.staleCount unchanged
GET /api/ops/jobs/notificationDrain/status/<triggerId>  # recent cron run success
```

**Rollback:** Set `CUTOVER_NOTIFICATION_DRAIN=false` and redeploy. Inline cron resumes on next restart.

---

### Step 2 — enrichmentBatch

Prerequisite: Step 1 stable for ≥ 2 hours.

Set: `CUTOVER_ENRICHMENT_BATCH=true`

**Verify (wait 2 cron cycles = 2 hours):**
```bash
GET /api/ops/scheduler/status          # ENRICHMENT_BATCH.owner = "central-scheduler"
GET /api/ops/rollout/status            # incidents.openCount unchanged
```

**Rollback:** Set `CUTOVER_ENRICHMENT_BATCH=false` and redeploy.

---

### Step 3 — enrichmentSeed

Prerequisite: Steps 1–2 stable for ≥ 24 hours (one daily cycle).

Set: `CUTOVER_ENRICHMENT_SEED=true`

**Verify (wait 1 daily cron cycle = 24 hours):**
```bash
GET /api/ops/scheduler/status          # ENRICHMENT_SEED.owner = "central-scheduler"
GET /api/ops/parity-reports?jobName=enrichmentSeed   # parity score ≥ 0.90
```

**Rollback:** Set `CUTOVER_ENRICHMENT_SEED=false` and redeploy.

---

### Step 4 — jobAlertJob

Prerequisite: Steps 1–3 stable for ≥ 24 hours.

Set: `CUTOVER_JOB_ALERT=true`

**Verify (wait 1 business-day cron cycle):**
```bash
GET /api/ops/scheduler/status          # JOB_ALERT.owner = "central-scheduler"
GET /api/ops/rollout/status            # incidents.p0Open = 0
```

**Rollback:** Set `CUTOVER_JOB_ALERT=false` and redeploy.

---

### Step 5 — sponsorMonitorJob (cut last, highest risk)

Prerequisite: Steps 1–4 stable for ≥ 48 hours.

Set: `CUTOVER_SPONSOR_MONITOR=true`

**Verify (wait 1 business-day cron cycle):**
```bash
GET /api/ops/scheduler/status          # SPONSOR_MONITOR.owner = "central-scheduler"
GET /api/ops/rollout/status            # all cutover.cutoverCount = 5
GET /api/ops/parity-reports?jobName=sponsorMonitorJob  # parity score ≥ 0.90
```

**Rollback:** Set `CUTOVER_SPONSOR_MONITOR=false` and redeploy.

---

## Full Rollback Procedure

To roll back all jobs at once: set all `CUTOVER_*` vars to `false` and redeploy.
All inline crons resume ownership on the next server restart.
No DB changes required — cutover state is env-only.

---

## Verification Commands Reference

```bash
# Aggregated hypercare view
GET /api/ops/rollout/status

# Per-job scheduler ownership
GET /api/ops/scheduler/status

# Trigger audit history for a job
GET /api/ops/jobs/<jobName>/status/<triggerId>

# Open incidents
GET /api/ops/incidents?status=open

# Evaluate current job health + auto-create tickets
POST /api/ops/incidents/evaluate   (admin)
```
