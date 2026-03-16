# Operations Runbook
# checkbyai.net
**Version:** 1.0 | **Last Updated:** 2026-03-16

---

## 1. Environment Setup

### 1.1 Required Environment Variables

Set all of these before starting the server in production. The server **exits immediately** if any required var is missing.

```bash
# Database
DATABASE_URL="postgresql://user:pass@ep-xxx.neon.tech/checkbyai?sslmode=require"

# Security
SESSION_SECRET="<random 64-char hex>"
PHONE_ENCRYPTION_KEY="<random 64-char hex>"
IP_HASH_SALT="<random 32-char hex>"
CHECKOUT_HMAC_SECRET="<random 64-char hex>"
DIGEST_SIGNING_KEY="<random 64-char hex>"

# Admin
ADMIN_EMAIL="admin@yourdomain.com"

# Stripe
STRIPE_SECRET_KEY="sk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# Email
RESEND_API_KEY="re_..."

# SMS (optional)
BREVO_API_KEY="xkeysib-..."

# WhatsApp (optional)
TWILIO_ACCOUNT_SID="AC..."
TWILIO_AUTH_TOKEN="..."
TWILIO_WHATSAPP_NUMBER="whatsapp:+14155238886"

# AI
OPENAI_API_KEY="sk-..."
DEEPSEEK_API_KEY="..."   # fallback

# Auth
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."

# CAPTCHA
TURNSTILE_SECRET_KEY="..."
VITE_TURNSTILE_SITE_KEY="..."   # frontend only

# Node
NODE_ENV="production"

# Python backend (for job scraping + Companies House)
PYTHON_BACKEND_URL="http://localhost:8000"
```

---

### 1.2 First-Time Deployment Checklist

```
□ 1. Set all required environment variables
□ 2. Run database migrations:
      npm run db:push

□ 3. Seed the admin user (automatic on first start via seedAdminUser())
      Start server → check logs for "Admin user created: ..."

□ 4. Populate the canonical sponsor table:
      POST /api/admin/migrate-canonical
      (requires admin session)
      Expected: { inserted: ~82000, skipped: 0, snapshotDate: "YYYY-MM-DD" }

□ 5. Verify search index built:
      GET /api/health
      Expected: { sponsorMonitor.indexReady: true }

□ 6. Configure Stripe webhook:
      Dashboard → Webhooks → Add endpoint → https://checkbyai.net/api/stripe-webhook
      Events: checkout.session.completed, customer.subscription.*
      Copy secret → set as STRIPE_WEBHOOK_SECRET

□ 7. Verify cron is running:
      GET /api/health at 00:35 UTC → lastRunSuccess should be true
```

---

## 2. Start / Stop / Deploy

### 2.1 Development
```bash
npm install
npm run db:push      # run DB migrations
npm run dev          # starts Vite + Express on port 5000
```

### 2.2 Production Build
```bash
npm run build        # Vite frontend + esbuild backend
npm start            # Node.js production server
```

### 2.3 Checking Server Health
```bash
curl https://checkbyai.net/api/health
```
Expected when healthy:
```json
{
  "status": "ok",
  "sponsorMonitor": {
    "lastRunSuccess": true,
    "indexReady": true
  }
}
```

---

## 3. Background Jobs

### 3.1 Sponsor Monitor Cron
- **Schedule:** `0 30 0 * * *` (00:30 UTC daily)
- **Advisory lock key:** `7483920`
- **Duration:** Typically 30–120 seconds depending on change volume

**Check if today's job ran:**
```sql
SELECT run_date, status, records_processed, changes_detected, duration_ms, error_message
FROM monitor_job_runs
WHERE run_date = CURRENT_DATE
ORDER BY id DESC
LIMIT 1;
```

**Manually trigger (admin only):**
```bash
curl -X POST https://checkbyai.net/api/admin/sponsor-monitor/run \
  -H "Cookie: session=..."
```

### 3.2 Job Alert Cron
- **Schedule:** `0 0 2 * * 1-5` (02:00 UTC Mon–Fri)
- **Advisory lock key:** `7483921`
- **Requires:** Python backend running at `PYTHON_BACKEND_URL`

**Check Python backend is alive:**
```bash
curl http://localhost:8000/health
```

### 3.3 Delayed Notification Processor
- **Schedule:** Hourly (runs within sponsor monitor cron and as separate timer in routes)
- **Processes:** `notification_log` rows with `status='queued' AND deliver_after <= NOW()`

**Check queued notifications:**
```sql
SELECT COUNT(*), MIN(deliver_after)
FROM notification_log
WHERE status = 'queued' AND deliver_after <= NOW();
```

---

## 4. Database Operations

### 4.1 Run Migrations
```bash
npm run db:push
```
Uses Drizzle ORM to apply schema changes. Safe to run on a running server (additive changes only).

### 4.2 Seed Canonical Table (First-Time or After Data Loss)
```bash
# Must be done via authenticated admin session
curl -X POST https://checkbyai.net/api/admin/migrate-canonical \
  -H "Cookie: session=<admin-session-id>"
```
This reads the latest snapshot from `sponsor_list` and populates `sponsor_canonical`.

### 4.3 Useful Diagnostic Queries

**Notification delivery rate (last 7 days):**
```sql
SELECT
  status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) as pct
FROM notification_log
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY status;
```

**Users at or near watch limit:**
```sql
SELECT
  u.subscription_status,
  COUNT(cw.id) as watches,
  u.email
FROM company_watches cw
JOIN users u ON u.id = cw.user_id
WHERE cw.is_active = true
GROUP BY u.id, u.subscription_status, u.email
HAVING COUNT(cw.id) >= 4
ORDER BY watches DESC;
```

**Recent sponsor changes:**
```sql
SELECT change_type, organisation_name, previous_value, new_value, snapshot_date
FROM sponsor_changes
ORDER BY id DESC
LIMIT 20;
```

**Sponsor monitor job history (last 7 days):**
```sql
SELECT run_date, status, records_processed, changes_detected,
       notifications_sent, notifications_failed, duration_ms / 1000 as duration_sec
FROM monitor_job_runs
ORDER BY run_date DESC
LIMIT 7;
```

**Failed email notifications:**
```sql
SELECT nl.id, nl.user_id, nl.channel, nl.error_details, nl.created_at,
       sc.organisation_name, sc.change_type
FROM notification_log nl
JOIN sponsor_changes sc ON sc.id = nl.change_id
WHERE nl.status = 'failed'
  AND nl.created_at > NOW() - INTERVAL '24 hours'
ORDER BY nl.created_at DESC;
```

---

## 5. Incident Playbooks

### 5.1 Sponsor Search Returns Empty Results

**Symptom:** Users report search returns no results; `GET /api/health` shows `indexReady: false`.

**Cause tree:**
1. Server just restarted — index rebuild is in progress (wait 30–60 seconds)
2. `rebuildSponsorIndex()` failed at startup — check server logs for `[SponsorSearch] Failed to build initial index`
3. `sponsor_canonical` table is empty — first-time deployment, migration not run

**Fix:**
```bash
# Option 1: Trigger manual index rebuild via admin endpoint
curl -X POST https://checkbyai.net/api/admin/sponsor-monitor/run \
  -H "Cookie: session=..."

# Option 2: If canonical is empty (first deploy)
curl -X POST https://checkbyai.net/api/admin/migrate-canonical \
  -H "Cookie: session=..."
```

**Verify:**
```bash
curl https://checkbyai.net/api/health | jq '.sponsorMonitor.indexReady'
# Expected: true
```

---

### 5.2 Daily Cron Job Failed

**Symptom:** Admin receives failure alert email; `GET /api/health` shows `lastRunSuccess: false`.

**Check the error:**
```sql
SELECT error_message, run_date, duration_ms
FROM monitor_job_runs
WHERE status = 'failed'
ORDER BY id DESC
LIMIT 3;
```

**Common causes and fixes:**

| Error | Cause | Fix |
|---|---|---|
| `Timed out fetching gov.uk page` | gov.uk slow/down | Wait and manually re-trigger; gov.uk usually recovers within hours |
| `Could not find a CSV download link` | gov.uk page structure changed | Inspect `sponsorListFetcher.ts` `findCsvUrl()` — update cheerio selector |
| `Failed to download CSV: HTTP 403` | User-Agent blocked | Check `USER_AGENT` constant in `sponsorListFetcher.ts` |
| `terminating connection due to administrator command` | Neon cold start | Usually recovers on retry; check `withRetry` logs |
| `CSV download returned 0 records` | gov.uk returned empty file | Re-trigger manually after 1 hour |

**Manually re-trigger:**
```bash
curl -X POST https://checkbyai.net/api/admin/sponsor-monitor/run \
  -H "Cookie: session=..."
```

---

### 5.3 Notifications Not Being Sent

**Symptom:** Users report no email/SMS/WhatsApp after a known change.

**Step 1 — Check if change was detected:**
```sql
SELECT * FROM sponsor_changes
WHERE snapshot_date = CURRENT_DATE
ORDER BY id DESC;
```

**Step 2 — Check notification log:**
```sql
SELECT nl.*, sc.organisation_name, sc.change_type
FROM notification_log nl
JOIN sponsor_changes sc ON sc.id = nl.change_id
WHERE nl.created_at > NOW() - INTERVAL '24 hours'
ORDER BY nl.created_at DESC
LIMIT 50;
```

**Step 3 — Check by status:**

| Status | Meaning | Action |
|---|---|---|
| `queued` | Scheduled for later delivery (Starter/Free tier) | Wait until `deliver_after` time |
| `skipped` | Rate limited (10/day limit) | Check `error_details` for reason |
| `failed` | Provider error | Check `error_details`; re-send manually if needed |
| `sent` | Successfully delivered | No action needed |

**Step 4 — Check provider keys:**
```bash
# Verify Resend API is working
curl -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"from":"test@checkbyai.net","to":["admin@test.com"],"subject":"Test","html":"test"}'
```

---

### 5.4 Stripe Webhook Not Processing

**Symptom:** Users complete payment but credits are not added; subscriptions not updated.

**Step 1 — Check processed checkouts:**
```sql
SELECT * FROM processed_checkouts
WHERE processed_at > NOW() - INTERVAL '24 hours'
ORDER BY processed_at DESC;
```

**Step 2 — Verify webhook signature:**
Check server logs for `[Stripe] Webhook signature verification failed`. This means the `STRIPE_WEBHOOK_SECRET` environment variable does not match the webhook secret in the Stripe Dashboard.

**Step 3 — Check Stripe Dashboard:**
- Go to Stripe Dashboard → Webhooks → Select endpoint
- Review recent events for failed deliveries
- Use "Resend" button to replay failed events

**Step 4 — Verify raw body capture:**
The webhook requires the **raw** request body for signature verification. Check that `req.rawBody` is being set in `server/index.ts`:
```typescript
app.use(express.json({
  verify: (req: any, _res, buf) => {
    if (req.originalUrl?.startsWith('/api/stripe-webhook')) {
      req.rawBody = buf;
    }
  }
}));
```

---

### 5.5 COS Check AI Analysis Failing

**Symptom:** Verifications return 503 or all results are `"suspicious"` with low confidence.

**Step 1 — Check AI provider status:**
```bash
# Check OpenAI
curl https://status.openai.com/api/v2/status.json | jq '.status.indicator'

# Check Anthropic
curl https://www.anthropicstatus.com/api/v2/status.json | jq '.status.indicator'
```

**Step 2 — Verify API keys are set:**
Check server startup logs for `[AIService] No AI providers available` — this means all API keys are missing or invalid.

**Step 3 — Review AI fallback chain:**
The system tries: OpenAI → Claude → DeepSeek. If all fail, it returns 503. Check which provider is failing via server logs tagged `[AIService]`.

---

### 5.6 Database Connection Failures

**Symptom:** 500 errors across all API endpoints; logs show `ECONNRESET` or `connection terminated`.

**Step 1 — Check Neon dashboard:**
- Verify the database is not paused (Neon auto-pauses after inactivity on free tier)
- Check connection count — if at limit, pool is saturated

**Step 2 — Check pool configuration:**
```typescript
// server/db.ts — should be:
max: 10,
idleTimeoutMillis: 30_000,
connectionTimeoutMillis: 10_000,
```

**Step 3 — Warm the connection:**
The `withRetry()` wrapper in `server/utils/dbRetry.ts` automatically warms the connection on failure. If errors persist beyond 3 retries with 2s/4s/6s backoff, the Neon instance may be down.

**Step 4 — Verify DATABASE_URL:**
```bash
# Test connection directly
psql "$DATABASE_URL" -c "SELECT 1;"
```

---

## 6. Monitoring Checklist

**Daily (automated via admin email):**
- [ ] Sponsor monitor job completed successfully
- [ ] Change count is plausible (0–500 range; >1000 may indicate CSV format change)
- [ ] Notifications sent count is non-zero if changes detected

**Weekly (manual review):**
- [ ] `GET /api/health` shows `indexReady: true`
- [ ] Failed notification count in last 7 days < 5%
- [ ] No stuck `queued` notifications (older than 24 hours)
- [ ] Neon storage usage within plan limits
- [ ] No unusual error spikes in server logs

**Monthly:**
- [ ] Review `verification_results` for unusual patterns (spike in "genuine" for known fakes)
- [ ] Check `paid_submissions` for any unreviewed expert requests
- [ ] Rotate `SESSION_SECRET` if suspected compromise
- [ ] Review Stripe subscription churn in Dashboard

---

## 7. Scaling Considerations

The current architecture runs as a single Node.js process. If scaling to multiple instances:

1. **Advisory locks** prevent duplicate cron execution across pods — already implemented
2. **Session store** is PostgreSQL — works across instances
3. **In-memory Fuse index** is per-instance — each pod builds its own index on startup. Acceptable since rebuild takes <1 second and data is identical across pods
4. **Python backend** at `localhost:8000` — must be co-located with API server or converted to a network service with a configurable `PYTHON_BACKEND_URL`
5. **Neon connection pool** — each instance gets `max: 10` connections. With 3 pods = 30 connections. Check Neon plan limit before scaling

---

## 8. Backup & Recovery

**What Neon backs up:**
- Automatic daily backups retained per plan
- Point-in-time recovery available on paid Neon plans

**What cannot be recovered:**
- COS documents — deliberately not stored
- Sessions — users must log in again after restore

**Recovery procedure after DB restore:**
1. Run `npm run db:push` to ensure schema is current
2. Run `POST /api/admin/migrate-canonical` if `sponsor_canonical` is empty
3. Verify search index: `GET /api/health` → `indexReady: true`
4. Trigger manual monitor run to re-sync to latest CSV state
