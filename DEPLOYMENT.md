# Deployment Guide

This guide covers deploying CheckByAI to production, managing environment variables, running database migrations, and operating the service.

---

## Table of Contents

- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [First-Time Deployment](#first-time-deployment)
- [Build & Start](#build--start)
- [Database Management](#database-management)
- [Binary Dependencies](#binary-dependencies)
- [Hosting Options](#hosting-options)
- [Health Checks](#health-checks)
- [Monitoring & Logging](#monitoring--logging)
- [Rollback Procedure](#rollback-procedure)
- [Incident Response](#incident-response)

---

## Architecture

CheckByAI runs as a **single Node.js process** on one port. No separate job runner is needed — background cron jobs run in-process. A GitHub Actions external cron provides a reliable fallback trigger for the nightly sponsor monitor job.

```
Internet → Cloudflare (CDN + DDoS) → Server (port 5000)
                                          ├── React static files
                                          ├── Express API
                                          ├── Cron jobs (in-process, 00:30 UTC)
                                          ├── Startup catchup (5-min timer on boot)
                                          └── WebSocket (Socket.io)
                                               │
                                    Neon PostgreSQL (TLS)
                                    Redis (optional, BullMQ)
                                    Python FastAPI (localhost:8000, optional)

GitHub Actions (00:35 UTC, Mon–Fri) → POST /api/ops/cron-ping  → Server
  (external reliability layer — triggers job if in-process cron missed)
```

---

## Prerequisites

- **Node.js** 20+
- **PostgreSQL** 14+ (Neon recommended)
- **Redis** 7+ (optional — for BullMQ job queue)
- Domain with SSL (Cloudflare recommended)
- Stripe account with live keys
- Email provider (Resend and/or Brevo)
- Twilio account (for SMS/WhatsApp, optional)

---

## Environment Variables

All required variables must be set before the server starts. **The server will exit immediately if any required variable is missing.**

### Required

```env
# Database
DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require

# Security keys — generate each with: openssl rand -hex 64
SESSION_SECRET=<64-char hex>
PHONE_ENCRYPTION_KEY=<32-char hex>
IP_HASH_SALT=<16-char hex>
CHECKOUT_HMAC_SECRET=<32-char hex>
DIGEST_SIGNING_KEY=<32-char hex>

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Admin
ADMIN_EMAIL=admin@yourdomain.com
NODE_ENV=production
APP_URL=https://checkbyai.net
```

### Recommended

```env
# Email delivery
RESEND_API_KEY=re_...

# Google OAuth (social login)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# CAPTCHA (bot protection on auth endpoints)
TURNSTILE_SECRET_KEY=...

# AI (COS Check feature)
AI_INTEGRATIONS_OPENAI_API_KEY=sk-...
AI_INTEGRATIONS_ANTHROPIC_API_KEY=sk-ant-...
```

### Optional

```env
# SMS/WhatsApp notifications
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_NUMBER=whatsapp:+447700000000

# Additional email provider
BREVO_API_KEY=xkeysib-...

# OpenRouter (multi-model AI fallback)
AI_INTEGRATIONS_OPENROUTER_API_KEY=...

# Redis (job queue)
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=

# Python backend (Companies House + job alerts)
PYTHON_BACKEND_URL=http://localhost:8000
```

### Key Rotation Warning

> **Critical:** If `PHONE_ENCRYPTION_KEY` is changed, all stored phone numbers become undecryptable. A key rotation requires re-verification of all phone numbers. Never rotate this key without a migration plan.

---

## First-Time Deployment

### Step 1: Set All Environment Variables

Verify every required variable is set in your hosting environment before proceeding.

### Step 2: Run Database Migrations

```bash
npm run db:push       # Sync schema to DB (safe to re-run)
# or for production migration files:
npm run db:migrate
```

### Step 3: Install Binary Dependencies

```bash
npm run setup:binaries
# Installs qsv (Rust) and csvdiff (Go) to ./bin/
```

Verify:

```bash
npm run check:binaries
# Output: JSON with health status for each binary
```

### Step 4: Build the Application

```bash
npm run build
# Compiles TypeScript server + builds Vite frontend
# Output: dist/
```

### Step 5: Start the Server

```bash
npm run start
# or with auto-migrate:
npm run start:with-migrate
```

### Step 6: Verify Admin User

On first start, `seedAdminUser()` runs automatically. Check logs:

```
✓ Admin user created: admin@yourdomain.com
```

If the admin already exists, this is a no-op.

### Step 7: Seed Sponsor Data

The first nightly cron run (00:30 UTC) auto-seeds the sponsor canonical table. To seed immediately without waiting:

```bash
# POST to this endpoint with a valid admin session cookie
curl -X POST https://checkbyai.net/api/admin/sponsor-monitor/run \
  -H "Cookie: connect.sid=<your-admin-session>"
```

### Step 8: Verify Health

```bash
curl https://checkbyai.net/api/health
# Expected: { "status": "ok", "sponsorCount": 124000+ }
```

---

## Build & Start

### Standard Production Start

```bash
npm run build && npm run start
```

### With Auto-Migration

```bash
npm run start:with-migrate
# Runs db:migrate before starting — safe for zero-downtime migrations
```

### Environment Variables Checklist Before Deploy

```
□ DATABASE_URL         ← Neon production connection string
□ SESSION_SECRET       ← Unique per environment
□ PHONE_ENCRYPTION_KEY ← Consistent across restarts (never change in prod)
□ STRIPE_SECRET_KEY    ← Live key (not test)
□ STRIPE_WEBHOOK_SECRET ← From Stripe dashboard webhook settings
□ NODE_ENV=production
□ APP_URL              ← https://checkbyai.net (no trailing slash)
□ ADMIN_EMAIL          ← Your admin email
```

---

## Database Management

### Migrations

```bash
# Generate a new migration from schema changes
npm run db:migrate

# Apply pending migrations
npm run start:with-migrate

# Direct push (dev/staging only — bypasses migration history)
npm run db:push
```

### Backup

```bash
# Neon: Use point-in-time restore from the Neon console
# Self-hosted: Use pg_dump
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Restore

```bash
psql $DATABASE_URL < backup_YYYYMMDD_HHMMSS.sql
```

### Schema Source of Truth

The database schema lives in `shared/schema.ts`. Never modify the database manually — all schema changes must go through Drizzle migrations.

---

## Binary Dependencies

The sponsor monitor pipeline requires two binaries in `./bin/`:

| Binary | Purpose | Failure mode |
|--------|---------|-------------|
| `qsv` | CSV validation + row counting | Phase 1 degrades (no count validation) |
| `csvdiff` | Fingerprinted CSV diffing | Phase 2 aborts — **job fails** |

```bash
# Install
npm run setup:binaries

# Health check
npm run check:binaries
```

These binaries are not committed to git (`.gitignore` excludes `bin/`). They must be installed on each new server instance.

---

## Hosting Options

### Railway (Recommended for simplicity)

1. Connect your GitHub repo
2. Set all environment variables in Railway dashboard
3. Railway auto-detects Node.js + runs `npm run build && npm run start`
4. Add a Neon PostgreSQL plugin from the Railway marketplace

### Render

1. Create a new Web Service from your GitHub repo
2. Build command: `npm run build`
3. Start command: `npm run start:with-migrate`
4. Add environment variables

### AWS / GCP / Azure (Self-hosted)

Recommended stack:
- **Compute:** EC2 t3.medium or Cloud Run
- **Database:** Neon (managed) or RDS PostgreSQL
- **Redis:** ElastiCache or Upstash
- **CDN:** Cloudflare (in front of all traffic)
- **Process manager:** PM2 or systemd
- **Reverse proxy:** Nginx

```nginx
# Nginx config
server {
    listen 443 ssl;
    server_name checkbyai.net;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Docker (Coming Soon)

A Dockerfile is in progress — see [GitHub Issues](https://github.com/Sam-Aitech/Checkbyai.net/issues) for status.

---

## Health Checks

```bash
# Application health
GET /api/health
# Returns: { status: "ok", sponsorCount: N }

# Sponsor monitor health (public — no auth required)
GET /api/health/sponsor-monitor
# Returns: { status: "ok"|"stale"|"running"|"unknown",
#            running: bool,
#            lastRun: { date, success, hoursAgo, recordsProcessed,
#                       changesDetected, notificationsSent, error },
#            nextCronUtc: "Mon-Fri 00:30 UTC",
#            timestamp }
# status "ok"      = last run succeeded and was <48h ago
# status "stale"   = last run failed, or >48h since last success
# status "running" = job is currently in progress
# status "unknown" = no run history yet

# Sponsor monitor admin status (detailed)
GET /api/admin/sponsor-monitor/status
# Requires: admin session

# Job history
GET /api/admin/sponsor-monitor/job-history
# Requires: admin session

# Binary health
npm run check:binaries
```

---

## Monitoring & Logging

### Structured Logs (Pino)

All logs are structured JSON written to stdout. Integrate with your log aggregator:

```bash
# Pipe to pino-pretty for human-readable dev output
npm run dev

# Production: pipe to log aggregator (e.g. Logtail, Datadog, CloudWatch)
npm run start | your-log-forwarder
```

Log levels: `trace`, `debug`, `info`, `warn`, `error`, `fatal`

Set `LOG_LEVEL=debug` in `.env` for verbose output.

### Key Metrics to Monitor

| Metric | Alert threshold | Endpoint |
|--------|----------------|----------|
| Sponsor monitor cron | `status: "stale"` | `GET /api/health/sponsor-monitor` |
| DB connection pool | >8/10 connections | Neon dashboard |
| HTTP error rate | >5% 5xx | Application logs |
| Redis queue depth | >1000 jobs | Redis Insight |
| Memory usage | >80% | Host metrics |

### Alerting Recommendations

- Set up uptime monitoring (e.g., Better Uptime, UptimeRobot) on `/api/health`
- Monitor `/api/health/sponsor-monitor` — alert when `status` is `"stale"` (no auth required, safe for external monitors)
- Alert on Stripe webhook failures (monitor payment logs)
- Alert on email delivery failures (Resend/Brevo webhooks)

### GitHub Actions External Cron

`.github/workflows/sponsor-monitor-cron.yml` runs at **00:35 UTC Mon–Fri** and POSTs to `POST /api/ops/cron-ping`. This acts as a reliable external trigger if the in-process node-cron at 00:30 UTC misfires (common on auto-scaling platforms that may restart the process mid-cron).

Required GitHub secrets:

| Secret | Description |
|--------|-------------|
| `CRON_SECRET` | Bearer token checked by `/api/ops/cron-ping` |
| `CRON_URL` | Base URL of the production server (e.g. `https://checkbyai.net`) |

Response codes from `/api/ops/cron-ping`:
- `202` — job triggered successfully
- `409` — job already ran today (no-op, safe to ignore)
- `423` — job is currently running (race avoided via advisory lock)

---

## Rollback Procedure

### Application Rollback

```bash
# With Railway/Render: use the dashboard to roll back to previous deployment

# With Git + PM2:
git checkout <previous-version-tag>
npm run build
pm2 restart checkbyai
```

### Database Rollback

> **Warning:** Drizzle does not auto-generate rollback migrations. Always test migrations on staging before production.

```bash
# From backup
psql $DATABASE_URL < backup_YYYYMMDD_HHMMSS.sql

# Or use Neon's point-in-time restore from the dashboard
```

### Key Rollback Decisions

| Scenario | Action |
|----------|--------|
| Broken deploy — no DB change | Redeploy previous version immediately |
| Broken deploy — additive DB change | Rollback app; new columns are nullable, safe |
| Broken deploy — destructive DB change | Restore from DB backup; coordinate downtime window |
| `PHONE_ENCRYPTION_KEY` changed accidentally | Roll back key; may need re-verification of phone numbers |

---

## Incident Response

| Incident | First check | Resolution |
|----------|-------------|------------|
| Blank search results | `GET /api/admin/sponsor-monitor/status` → `snapshotRecordCount` | Trigger manual run |
| Daily cron status stale | `GET /api/health/sponsor-monitor` → `status: "stale"` | Server auto-recovers 5 min after restart; check logs for root cause |
| Daily cron failed | `GET /api/admin/sponsor-monitor/job-history` → `errorMessage` | Check logs; fix cause; re-trigger |
| GitHub Actions cron failed | GitHub Actions tab → workflow run | Verify `CRON_SECRET` + `CRON_URL` secrets are set |
| Record count abort | Admin alert email received | Investigate gov.uk CSV manually |
| Notifications not sent | `GET /api/admin/sponsor-monitor/notification-stats` | Check email/SMS provider status |
| `csvdiff` binary missing | Phase 2 failure in job logs | `npm run setup:binaries` |
| Payment not processing | Stripe dashboard → recent events | Verify `STRIPE_SECRET_KEY` + webhook secret |
| 500 errors on login | Server logs | Check DB connection + session table |
| Memory leak | Growing heap in host metrics | Restart server; profile with `clinic.js` |

---

## Support

- **Docs:** [DEVELOPMENT.md](DEVELOPMENT.md) for local setup
- **Architecture:** [docs/SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md)
- **Security issues:** security@checkbyai.net
- **General support:** support@checkbyai.net
