# Runbook: sponsorMonitorJob

**Schedule:** Daily 00:30 UTC Mon–Fri  
**Cutover flag:** `CUTOVER_SPONSOR_MONITOR`  
**Owner:** Central scheduler (when cutover) or inline cron

## What it does

Downloads the latest GOV.UK sponsor register CSV, diffs it against the previous snapshot, persists detected changes (revocations, reinstatements, rating changes), and queues notifications.

## Alert thresholds

| Severity | Condition |
|---|---|
| P3 | Stale > 26 h |
| P2 | Stale > 36 h |
| P1 | Stale > 48 h or never succeeded with a recorded failure |
| P0 | Stale > 72 h |

## Decision tree

```
Is the job currently marked "running" in /api/health?
├── YES → Check for stuck/hung process.
│         Look for recent errors in application logs with jobName=sponsorMonitorJob.
│         If stuck > 30 min: redeploy to force restart.
└── NO  → Is lastFailureAt recent?
          ├── YES → Check application logs for failure reason.
          │         Common causes:
          │         - GOV.UK CSV endpoint down or format changed
          │         - DB connection/timeout during diff write
          │         - Notification engine queue full (jobs retry 3x with
          │           exponential backoff before landing in the failed set —
          │           see SYSTEM_DESIGN.md §6.1)
          │         Action: Fix root cause, then trigger manually (see below).
          └── NO  → Is the scheduler running?
                    Check /api/ops/scheduler/status.
                    If CUTOVER_SPONSOR_MONITOR=true but job shows inline-cron: env var not applied.
                    Redeploy with correct env vars.
```

## Manual trigger

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Cookie: <admin-session>" \
  -d '{"idempotencyKey":"<uuid-v4>","reason":"manual-recovery-from-runbook"}' \
  https://checkbyai.net/api/ops/jobs/sponsorMonitorJob/trigger
```

## Rollback

Set `CUTOVER_SPONSOR_MONITOR=false` and redeploy. Inline cron resumes on next restart.

## Notification reliability (2026-06-23)

If Redis is down, notifications fall back to inline processing of **all** alertable changes for the day (previously capped at 50 with the rest silently dropped — fixed). Each notification job has a deterministic `jobId` (`notif-<changeId>-<date>`) so a crash/restart mid-run can't double-send. See SYSTEM_DESIGN.md §6.1 for the full BullMQ retry/concurrency policy.

## Escalation

If manual trigger fails 2+ times: escalate to on-call engineer and check GOV.UK status page for CSV availability.
