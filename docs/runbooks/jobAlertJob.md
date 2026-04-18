# Runbook: jobAlertJob

**Schedule:** Daily 02:00 UTC Mon–Fri  
**Cutover flag:** `CUTOVER_JOB_ALERT`  
**Owner:** Central scheduler (when cutover) or inline cron

## What it does

Evaluates job health snapshots and sends alert emails / in-app notifications to users who have alert preferences configured when a job's success window exceeds configured thresholds.

## Alert thresholds

| Severity | Condition |
|---|---|
| P3 | Stale > 26 h |
| P2 | Stale > 36 h |
| P1 | Stale > 48 h or never succeeded with a recorded failure |
| P0 | Stale > 72 h |

## Decision tree

```
Is lastFailureAt recent?
├── YES → Check logs for failure reason (jobName=jobAlertJob).
│         Common causes:
│         - Email provider (SMTP/SendGrid) unreachable
│         - DB query timeout (notif preference read)
│         - Job health snapshot registry empty (process restart lost in-memory state)
│         Action: Fix root cause, trigger manually.
└── NO  → Is scheduler ownership correct?
          GET /api/ops/scheduler/status → check JOB_ALERT owner.
          If unexpectedly "inline-cron": verify CUTOVER_JOB_ALERT env var.
          If ownership is correct: check if previous run is still marked "running"
          (stuck), then redeploy.
```

## Manual trigger

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Cookie: <admin-session>" \
  -d '{"idempotencyKey":"<uuid-v4>","reason":"manual-recovery-from-runbook"}' \
  https://checkbyai.net/api/ops/jobs/jobAlertJob/trigger
```

## Rollback

Set `CUTOVER_JOB_ALERT=false` and redeploy.

## Note

In-memory health registry is lost on process restart. After a redeploy, `staleByMinutes` reflects time since restart, not since the last actual run. Monitor for one full cycle before closing a P1/P0 incident.
