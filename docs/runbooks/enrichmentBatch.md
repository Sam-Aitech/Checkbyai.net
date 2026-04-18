# Runbook: enrichmentBatch

**Schedule:** Hourly :15  
**Cutover flag:** `CUTOVER_ENRICHMENT_BATCH`  
**Owner:** Central scheduler (when cutover) or inline cron

## What it does

Pulls pending items from `enrichmentQueue`, calls Companies House API for each, and writes enrichment data to `sponsorEnrichment`. Processes up to a configured batch size per run.

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
├── YES → Check logs for failure reason (jobName=enrichmentBatch).
│         Common causes:
│         - Companies House API rate limit (429) or downtime
│         - DB write conflict on sponsor_enrichment upsert
│         - Enrichment queue empty (seed job missed — check enrichmentSeed health)
│         Action:
│           - If Companies House down: incident is external; wait and monitor.
│           - If DB issue: fix and trigger manually.
└── NO  → Is enrichmentQueue populated?
          Run: SELECT COUNT(*) FROM enrichment_queue WHERE status='pending'
          If 0 rows: seed job hasn't run. Check enrichmentSeed health.
          If rows present: check scheduler ownership.
```

## Manual trigger

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Cookie: <admin-session>" \
  -d '{"idempotencyKey":"<uuid-v4>","reason":"manual-recovery-from-runbook"}' \
  https://checkbyai.net/api/ops/jobs/enrichmentBatch/trigger
```

## Rollback

Set `CUTOVER_ENRICHMENT_BATCH=false` and redeploy.

## Note

Batch runs at :15. If Companies House API is rate-limiting, triggering manually in rapid succession will compound the problem. Wait at least one hour between manual attempts.
