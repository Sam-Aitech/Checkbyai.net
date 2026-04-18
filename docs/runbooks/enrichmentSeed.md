# Runbook: enrichmentSeed

**Schedule:** Daily 02:00 UTC  
**Cutover flag:** `CUTOVER_ENRICHMENT_SEED`  
**Owner:** Central scheduler (when cutover) or inline cron

## What it does

Scans `sponsorCanonical` for records without Companies House enrichment and seeds `enrichmentQueue` with company numbers for the batch worker to process.

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
├── YES → Check logs for failure reason (jobName=enrichmentSeed).
│         Common causes:
│         - DB query timeout on large sponsorCanonical scan
│         - Queue insert conflict (upsert on company_number)
│         Action: Fix root cause, trigger manually or wait for next daily run.
└── NO  → Verify scheduler ownership (GET /api/ops/scheduler/status).
          If ownership is correct and no failure: job may be running.
          Wait up to 10 min, then re-check /api/health for staleByMinutes change.
```

## Manual trigger

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Cookie: <admin-session>" \
  -d '{"idempotencyKey":"<uuid-v4>","reason":"manual-recovery-from-runbook"}' \
  https://checkbyai.net/api/ops/jobs/enrichmentSeed/trigger
```

## Rollback

Set `CUTOVER_ENRICHMENT_SEED=false` and redeploy.

## Downstream impact

Missing seed runs delay `enrichmentBatch` from having fresh work items. P2+ staleness here should also check if `enrichmentBatch` is healthy, since an empty queue masks batch failures.
