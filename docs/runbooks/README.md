# Operator Runbooks — Checkbyai.net

Phase 5 runbooks for each critical background job. Each runbook includes the severity matrix, alert thresholds, diagnostic decision tree, and remediation steps.

## Jobs

| Runbook | Schedule | P3 threshold | P0 threshold |
|---|---|---|---|
| [sponsorMonitorJob](sponsorMonitorJob.md) | Daily 00:30 UTC Mon–Fri | Stale > 26 h | Stale > 72 h |
| [jobAlertJob](jobAlertJob.md) | Daily 02:00 UTC Mon–Fri | Stale > 26 h | Stale > 72 h |
| [enrichmentSeed](enrichmentSeed.md) | Daily 02:00 UTC | Stale > 26 h | Stale > 72 h |
| [enrichmentBatch](enrichmentBatch.md) | Hourly :15 | Stale > 75 min | Stale > 6 h |
| [notificationDrain](notificationDrain.md) | Hourly :00 | Stale > 75 min | Stale > 6 h |

## Incident Severity Reference

| Severity | Meaning | SLA |
|---|---|---|
| P0 | Critical — data pipeline halted | Page immediately, fix within 1 h |
| P1 | High — multiple missed runs | Fix within 4 h |
| P2 | Warning — one missed run | Fix within 24 h |
| P3 | Advisory — first missed window | Investigate during business hours |

## Common Diagnostic Commands

```bash
# Check health of all jobs
curl -H "Cookie: ..." https://checkbyai.net/api/health

# List open incidents
curl -H "Cookie: ..." https://checkbyai.net/api/ops/incidents?status=open

# Check scheduler ownership
curl -H "Cookie: ..." https://checkbyai.net/api/ops/scheduler/status

# Manually trigger a job (admin)
curl -X POST -H "Content-Type: application/json" \
  -d '{"idempotencyKey":"<uuid-v4>","reason":"manual-recovery"}' \
  -H "Cookie: ..." \
  https://checkbyai.net/api/ops/jobs/<jobName>/trigger
```
