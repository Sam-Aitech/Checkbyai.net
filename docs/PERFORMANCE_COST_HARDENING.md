# Performance and Cost Hardening
# checkbyai.net — Phase 7

Owner: CTO / Tech Lead
Status: Active
Last Updated: 2026-04-18

---

## Runtime Budgets

Per-job wall-clock limits enforced by the trigger endpoint. Override via env without a code deploy.

| Job | Default Timeout | Env Override |
|---|---|---|
| `sponsorMonitorJob` | 25 min | `BUDGET_SPONSOR_MONITOR_MS` |
| `jobAlertJob` | 15 min | `BUDGET_JOB_ALERT_MS` |
| `enrichmentSeed` | 10 min | `BUDGET_ENRICHMENT_SEED_MS` |
| `enrichmentBatch` | 30 min | `BUDGET_ENRICHMENT_BATCH_MS` |
| `notificationDrain` | 10 min | `BUDGET_NOTIFICATION_DRAIN_MS` |

Source of truth: [server/config/jobBudgets.ts](../server/config/jobBudgets.ts)

**When a job exceeds its budget:** The trigger endpoint rejects the run with `"Job timed out after N minutes"`, marks the audit row as `failed`, and fires the callback (if configured). The incident evaluator will create a ticket on the next evaluate cycle.

---

## Callback Retry Policy

| Parameter | Default | Env Override |
|---|---|---|
| Max delivery attempts | 3 | `CALLBACK_MAX_ATTEMPTS` |
| Retry base delay | 500 ms | `CALLBACK_RETRY_BASE_MS` |
| Per-attempt HTTP timeout | 10 s | `CALLBACK_TIMEOUT_MS` |

Backoff formula: `base × 2^(attempt−1)` — attempt 1=500 ms, attempt 2=1000 ms, attempt 3=2000 ms.

After exhausting attempts, `callbackStatus` is set to `"failed"` in `job_trigger_audit`. No further retries. Re-trigger the job with a new idempotency key if callback delivery is required.

---

## Weekly Reliability and Cost Review

Run every Monday at standup. Owner: CTO or on-call.

### Checklist

**Runtime:**
- [ ] Review `/api/health` for any jobs with `staleByMinutes > 0` persisting from the previous week
- [ ] Check `incident_tickets` for open P0/P1 tickets: `GET /api/ops/incidents?status=open`
- [ ] Verify no job exceeded its timeout budget (check `job_trigger_audit` where `status=failed` and `failure_reason ILIKE '%timed out%'`)

**Cost:**
- [ ] Count enrichment API calls made to Companies House for the week (`SELECT COUNT(*) FROM sponsor_enrichment WHERE created_at > now() - interval '7 days'`)
- [ ] Confirm enrichment batch size is not over-running budget (review `durationMs` in `shadow_run_results`)
- [ ] Check notification drain queue depth at peak: `SELECT MAX(count) FROM (SELECT DATE_TRUNC('hour', created_at) AS h, COUNT(*) FROM notif_engine_log GROUP BY h) t`

**Quality:**
- [ ] `npm run test:reliability` passes on main branch
- [ ] No new `callback_status = 'failed'` rows in `job_trigger_audit` without investigation
- [ ] Shadow parity score > 0.90 for all jobs: `GET /api/ops/parity-reports?limit=20`

### Cost Optimization Levers

1. **Enrichment batch size** — reduce `ENRICHMENT_BATCH_SIZE` env var to stay within Companies House rate limits.
2. **Notification drain frequency** — if queue depth is consistently low, the hourly drain is already aggressive. Consider switching to 2-hour cadence via `JOB_SCHEDULES.NOTIFICATION_DRAIN` in scheduler.
3. **Sponsor monitor frequency** — daily 00:30 UTC weekdays is the minimum for sponsor licence compliance. Do not reduce below daily.
4. **Callback timeout** — if most callbacks succeed within 2 s, reduce `CALLBACK_TIMEOUT_MS` to 5000 to free connection slots faster.

---

## Budget Breach Escalation

If a job regularly hits its timeout budget:

1. Check if the data volume has grown (sponsor count, queue depth).
2. Profile the job: add timing logs around the expensive SQL query.
3. Add a DB index or batch the loop in smaller chunks.
4. If the job legitimately needs more time, increase the budget via env var and document the reason here.

Do not simply raise the budget without understanding why it was breached.
