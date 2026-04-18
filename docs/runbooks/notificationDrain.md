# Runbook: notificationDrain

**Schedule:** Hourly :00  
**Cutover flag:** `CUTOVER_NOTIFICATION_DRAIN`  
**Owner:** Central scheduler (when cutover) or inline cron in sponsorMonitorJob

## What it does

Processes the `notif_engine_log` queue: delivers pending email and in-app notifications to users, respects per-user notification preferences, and updates delivery status.

## Alert thresholds

| Severity | Condition |
|---|---|
| P3 | Stale > 75 min (1 missed hourly run) |
| P2 | Stale > 90 min |
| P1 | Stale > 3 h |
| P0 | Stale > 6 h |

## Decision tree

```
Is lastFailureAt recent?
├── YES → Check logs for failure reason (jobName=notificationDrain).
│         Common causes:
│         - Email provider (SMTP / SendGrid / Resend) unavailable
│         - notif_engine_log table lock contention
│         - deliver_after timestamp filter returning 0 rows (benign — queue empty)
│         Action:
│           - If email provider down: notifications queue up; they will be
│             delivered on next successful drain. Monitor queue depth.
│           - If DB issue: fix and trigger manually.
└── NO  → Check queue depth:
          SELECT COUNT(*) FROM notif_engine_log
          WHERE status='pending' AND deliver_after < now()
          If depth is high and drain hasn't run: manual trigger.
          If depth is 0: stale reading may be stale in-memory state after restart.
          Wait one cycle.
```

## Manual trigger

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Cookie: <admin-session>" \
  -d '{"idempotencyKey":"<uuid-v4>","reason":"manual-recovery-from-runbook"}' \
  https://checkbyai.net/api/ops/jobs/notificationDrain/trigger
```

## Rollback

Set `CUTOVER_NOTIFICATION_DRAIN=false` and redeploy. Inline drain in `sponsorMonitorJob.ts` resumes.

## P0 escalation

Notifications are user-visible. A 6 h outage means users miss time-sensitive sponsor status changes. If auto-remediation has fired and failed: page on-call, check email provider status, and verify DB connectivity.
