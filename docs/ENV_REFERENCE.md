# Environment Variable Reference

**Source of truth: [`.env.example`](../.env.example)** — it is the only file
that must be updated when an env var is added, renamed, or removed. This table
is its human-readable mirror; update both in the same PR.

**Fail-fast set** (`server/index.ts` → `REQUIRED_ENV_VARS`, `process.exit(1)`
when `NODE_ENV=production` and any is missing):
`DATABASE_URL`, `SESSION_SECRET`, `PHONE_ENCRYPTION_KEY`, `IP_HASH_SALT`,
`CHECKOUT_HMAC_SECRET`, `DIGEST_SIGNING_KEY`, `STRIPE_WEBHOOK_SECRET`.

*Last reconciled: 2026-09-26*

## Core (production fail-fast)

| Variable | Generate | If missing |
|---|---|---|
| `DATABASE_URL` | Neon/Postgres connection string (`sslmode=require`) | Boot fails everywhere (dev included) |
| `SESSION_SECRET` | `openssl rand -hex 64` | Boot fails (throw in `auth.ts` / `socketGateway.ts`) |
| `PHONE_ENCRYPTION_KEY` | `openssl rand -hex 32` (64 hex chars = 32 bytes, **enforced** by `phoneCrypto.ts`) | Boot fails in prod; phone encryption throws on first use |
| `IP_HASH_SALT` | `openssl rand -hex 16` | Boot fails in prod |
| `CHECKOUT_HMAC_SECRET` | `openssl rand -hex 32` | Boot fails in prod; checkout tokens unsigned |
| `DIGEST_SIGNING_KEY` | `openssl rand -hex 32` | Boot fails in prod; digest payloads unsigned |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Developers → Webhooks | Boot fails in prod; paid activations never grant |

## Payments

| Variable | Status | If missing |
|---|---|---|
| `STRIPE_SECRET_KEY` | Required (payments) | Billing endpoints fail |
| `STRIPE_PUBLISHABLE_KEY` | Required off-Replit | `GET /api/stripe/publishable-key` falls back to Replit connector → 500 |

## Security / auth

| Variable | Status | If missing |
|---|---|---|
| `TURNSTILE_SECRET_KEY` | Optional dev, **effectively required in prod** | CAPTCHA silently skipped |
| `VITE_TURNSTILE_SITE_KEY` | Optional (client-side pair of the above) | Login/checkout render without widget |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional | Google login button hidden |
| `ADMIN_EMAIL` | Optional | Initial-admin seeding skipped; admin OTP login has no target. **Not** fail-fast (intentionally excluded from `REQUIRED_ENV_VARS`) |

### Outbound requests (webhooks, job callbacks), CSP, proxy and OTP

| Variable | Status | Effect |
|---|---|---|
| `OUTBOUND_ALLOWED_HOSTS` | Optional, comma-separated exact hostnames | When set, webhook and callback URLs must match one of these hosts exactly (no suffix matching). Unset: any public HTTPS host that passes DNS and IP checks |
| `OUTBOUND_ALLOWED_PORTS` | Optional (default `443`) | Comma-separated ports allowed for outbound URLs |
| `OUTBOUND_ALLOW_LOCAL_DEV` | Dev only | `1` permits `http://` and loopback targets **only when `NODE_ENV=development`**. Boot fails if set in any other environment |
| `CSP_CONNECT_SRC` | Optional, comma-separated https origins | Extra `connect-src` origins. The Sentry ingest host is derived automatically from `VITE_SENTRY_DSN` / `SENTRY_DSN` |
| `TRUST_PROXY_HOPS` | Optional integer 0 to 10 (default `1`) | Trusted reverse-proxy hops for `req.ip`, which every IP-keyed rate limiter uses. Cloudflare then Nginx then Node is `2` |
| `OTP_HASH_SECRET` | Optional (defaults to `SESSION_SECRET`) | Key for hashing email OTP codes. Rotating it invalidates codes in flight (10-minute lifetime) |

## Queue / cache / rate limiting

| Variable | Status | If missing |
|---|---|---|
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | Optional dev, **required prod** | BullMQ → inline execution; rate limits → per-process memory (N× limit across replicas); cache → per-pod LRU |

## Cron / ops callbacks

| Variable | Status | If missing |
|---|---|---|
| `CRON_SECRET` | Required for external cron (GH Actions) | `/api/ops/cron-ping` + `/api/ops/trigger` disable themselves |
| `CRON_URL` | Required by the GH Actions workflow only | Workflow has no target to ping |
| `CALLBACK_SIGNING_SECRET` | Required **only if** job requests use `callbackUrl` | Endpoint 400s (explicit check in `ops.ts`) |
| `CALLBACK_MAX_ATTEMPTS` / `CALLBACK_RETRY_BASE_MS` / `CALLBACK_TIMEOUT_MS` | Optional (3 / 500 / 10000) | Defaults in `server/config/jobBudgets.ts` |
| `BUDGET_SPONSOR_MONITOR_MS` … `BUDGET_NOTIFICATION_DRAIN_MS` | Optional (5 budgets, defaults in `jobBudgets.ts`) | Defaults 25/15/10/30/10 min |

## Notifications

| Variable | Status | If missing |
|---|---|---|
| `RESEND_API_KEY` | Optional (primary email) | Email alerts disabled |
| `SENDGRID_API_KEY` | Optional (email fallback) | Fallback unavailable |
| `BREVO_API_KEY` | Optional (admin alerts / SMS) | Those sends skipped |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_WHATSAPP_NUMBER` | Optional | SMS/WhatsApp skipped |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Optional (`npx web-push generate-vapid-keys`) | Web push disabled |
| `WEBHOOK_SECRET` | Optional (`openssl rand -hex 32`) | Webhooks sent unsigned |

## AI provider chain (OpenAI → Anthropic → OpenRouter)

| Variable | Status | If missing |
|---|---|---|
| `AI_INTEGRATIONS_OPENAI_API_KEY` / `_BASE_URL` | Optional | First provider skipped |
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY` / `_BASE_URL` | Optional | Second provider skipped |
| `AI_INTEGRATIONS_OPENROUTER_API_KEY` / `_BASE_URL` | Optional | Fallback skipped → explain/headline endpoints 502 |

## Python sidecar (`backend/`)

| Variable | Status | If missing |
|---|---|---|
| `PYTHON_BACKEND_URL` | Optional (defaults `http://localhost:8000`) | Node falls back to cheerio/direct Companies House |
| `COMPANIES_HOUSE_API_KEY` | Optional | Enrichment 401s unless sidecar is up |
| `ALLOWED_ORIGINS` | Sidecar-only (defaults `http://localhost:5000`) | Keep in sync with Node CORS whitelist |
| `LSUK_BASE_URL`, `TEMP_DIR` | Sidecar-only overrides | Defaults used |

## Storage / runtime / observability

| Variable | Status | If missing |
|---|---|---|
| `UPLOADS_DIR` | Optional (defaults `<cwd>/uploads`) | Default path used; keep on a volume in Docker |
| `APP_URL` | Optional (defaults `https://checkbyai.net`) | Wrong canonical URLs in emails/sitemap if behind a proxy |
| `NODE_ENV` | Set by npm scripts | Dev defaults; **set `production` explicitly in prod** |
| `SENTRY_DSN` / `VITE_SENTRY_DSN` | Optional | Sentry disabled |
| `ENABLE_ADMIN_METRICS_ROUTES` | Optional (`true` to opt in) | `/api/admin/metrics` returns 404/disabled |
| `TEST_BASE_URL` | E2E only | `playwright.config.ts` throws locally; CI skips E2E with a warning |

## Removed / legacy (do not set)

| Variable | Replaced by |
|---|---|
| `OPENAI_API_KEY`, `DEEPSEEK_API_KEY` | `AI_INTEGRATIONS_*` family |
| `ETL_SERVICE_URL` | Retired along with `backend/sponsor_etl.py` (Node owns ETL) |
| `PLAYWRIGHT_TURNSTILE_BYPASS_TOKEN` | Removed 2026-09-26 — never referenced by code |
| `ADMIN_EMAIL` as "required" | Graceful optional (docs previously disagreed; code is correct) |
