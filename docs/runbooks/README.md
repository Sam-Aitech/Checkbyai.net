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

## Monitoring & Reliability (Phase 1e)

### Dead-man's Switch (External Uptime Monitor)

The application includes an `/api/health` endpoint that exposes internal job telemetry. It is critical to set up an external monitor (e.g., UptimeRobot, BetterStack, or Checkly) to ensure the system is alive and the ETL pipeline is moving.

1. **Endpoint**: `https://checkbyai.net/api/health` (requires Bearer token if configured, or specific public health flags).
2. **Frequency**: Every 5–60 minutes.
3. **Alert Condition**: 
   - HTTP status is not 200.
   - Response body contains `status: "unhealthy"` or `stale: true`.
   - Response time > 5s.

### Ghost Lock Remediation

If `sponsorMonitorJob` stays in a `running` state for > 2 hours, the system will send an admin alert. 
- **Cause**: Application crashed without releasing the PostgreSQL advisory lock.
- **Action**: Check Neon dashboard for zombie connections holding lock `7483920` and terminate them, or redeploy the application to force connection recycling.

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
