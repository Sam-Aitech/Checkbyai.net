# Development Guide

This guide covers setting up a local development environment, understanding the architecture, running tests, and debugging common issues.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Setup](#quick-setup)
- [Environment Variables](#environment-variables)
- [Architecture Overview](#architecture-overview)
- [Project Structure](#project-structure)
- [Database](#database)
- [Running the App](#running-the-app)
- [Testing](#testing)
- [Binary Dependencies](#binary-dependencies)
- [Python Backend](#python-backend)
- [Code Style](#code-style)
- [Debugging](#debugging)

---

## Prerequisites

| Tool | Version | Required |
|------|---------|----------|
| Node.js | 20+ | Required |
| npm | 10+ | Required |
| PostgreSQL | 14+ (or Neon account) | Required |
| Redis | 7+ | Optional (job queue) |
| Python | 3.11+ | Optional (fallback scraper) |
| Go | 1.21+ | Optional (csvdiff binary) |

**Recommended tools:**
- [VS Code](https://code.visualstudio.com/) with extensions: Prettier, ESLint, Drizzle Kit
- [TablePlus](https://tableplus.com/) or [pgAdmin](https://www.pgadmin.org/) for database inspection
- [Redis Insight](https://redis.io/insight/) for queue monitoring

---

## Quick Setup

```bash
# 1. Clone the repository
git clone https://github.com/Sam-Aitech/Checkbyai.net.git
cd Checkbyai.net

# 2. Install Node dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env — see Environment Variables section

# 4. Set up the database
npm run db:push       # Create/sync schema from shared/schema.ts
npm run db:migrate    # Apply any pending migrations

# 5. Start development server
npm run dev
```

The app starts on **http://localhost:5000** (both frontend and backend on the same port).

---

## Environment Variables

Copy `.env.example` to `.env` and fill in:

### Minimum Required (to boot the server)

```env
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
SESSION_SECRET=<random 64-char hex: openssl rand -hex 64>
PHONE_ENCRYPTION_KEY=<random 32-char hex: openssl rand -hex 32>
IP_HASH_SALT=<random 16-char hex: openssl rand -hex 16>
CHECKOUT_HMAC_SECRET=<random 32-char hex: openssl rand -hex 32>
DIGEST_SIGNING_KEY=<random 32-char hex: openssl rand -hex 32>
```

### For Full Feature Testing

```env
# Payments (use Stripe test keys)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email (use test/sandbox credentials)
RESEND_API_KEY=re_...

# AI (for COS Check)
AI_INTEGRATIONS_OPENAI_API_KEY=sk-...
```

### Generating Secrets Locally

```bash
# Session secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# AES key / HMAC secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# IP hash salt
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

See `.env.example` for the full list of variables and their descriptions.

---

## Architecture Overview

CheckByAI is a **monolithic** Node.js/Express application serving both the API and React frontend from a single process on port 5000.

```
checkbyai.net (port 5000)
├── React Frontend (Vite, served as static files in production)
├── Express API Server (routes.ts)
│   ├── Auth (Passport.js — Email OTP + Google OAuth)
│   ├── Sponsor Monitor routes
│   ├── COS Check routes
│   └── Admin routes
├── Background Jobs (in-process)
│   ├── sponsorMonitorJob.ts — nightly cron at 00:30 UTC Mon–Fri
│   ├── Startup catchup — 5-min timer fires on every boot to retrigger
│   │   missed runs (bypasses per-hour throttle, uses advisory lock)
│   └── jobAlertJob.ts — weekly digest
├── GitHub Actions External Cron
│   └── sponsor-monitor-cron.yml — 00:35 UTC Mon–Fri → POST /api/ops/cron-ping
│       (reliability fallback if in-process cron misfires on restart)
└── PostgreSQL (Neon serverless, Drizzle ORM)

External services:
  gov.uk CSV · Stripe · Resend · Brevo · Twilio · OpenAI/Claude
  Python FastAPI (localhost:8000) — Companies House + job scraping
  qsv (Rust) — CSV validation
  csvdiff (Go) — fingerprinted CSV diffing
```

---

## Project Structure

```
checkbyai/
├── client/                  # React frontend (Vite)
│   └── src/
│       ├── components/      # Reusable UI components
│       ├── hooks/           # Custom React hooks
│       ├── lib/             # Utilities, API client
│       └── pages/           # Route-level page components
├── server/                  # Express backend
│   ├── index.ts             # Server entry point
│   ├── routes.ts            # All API route definitions
│   ├── db.ts                # Neon PostgreSQL pool + Drizzle instance
│   ├── auth.ts              # Passport.js strategy configuration
│   ├── storage.ts           # Data access layer
│   ├── services/            # Business logic
│   │   ├── pdfAnalyzer.ts   # COS forensic analysis
│   │   └── aiService.ts     # AI provider abstraction + fallback chain
│   └── utils/               # Shared utilities
│       ├── sponsorMonitorJob.ts   # Daily cron orchestrator
│       ├── sponsorStateMachine.ts # 4-state reconciliation engine
│       ├── csvArchiver.ts         # CSV download + archive
│       ├── binaryRunner.ts        # csvdiff binary wrapper
│       ├── notificationDispatcher.ts # Multi-channel notifications
│       ├── tierConfig.ts          # Subscription tier gates
│       └── phoneCrypto.ts         # AES-256-GCM phone encryption
├── shared/                  # Shared between client and server
│   └── schema.ts            # Database schema (Drizzle) — single source of truth
├── migrations/              # Drizzle migration files
├── scripts/                 # Dev/ops scripts
│   └── setup-binaries.sh    # Install qsv and csvdiff binaries
├── docs/                    # Internal technical documentation
└── .env.example             # Environment variable reference
```

---

## Database

### Schema Management

The database schema lives in `shared/schema.ts` and is managed by [Drizzle Kit](https://orm.drizzle.team/).

```bash
# Push schema changes directly (dev only — bypasses migration files)
npm run db:push

# Generate a migration file from schema changes
npm run db:migrate

# View current DB via Drizzle Studio (opens in browser)
npx drizzle-kit studio
```

### Local Database Options

**Option A: Neon (recommended)**
1. Create a free project at [neon.tech](https://neon.tech/)
2. Copy the connection string to `DATABASE_URL` in `.env`

**Option B: Local PostgreSQL**
```bash
# macOS
brew install postgresql@14
brew services start postgresql@14
createdb checkbyai_dev

# Set in .env:
DATABASE_URL=postgresql://localhost/checkbyai_dev
```

### First Run

On first boot with an empty `sponsor_canonical` table, trigger the initial seed manually:

```bash
# After the server is running:
curl -X POST http://localhost:5000/api/admin/sponsor-monitor/run \
  -H "Cookie: <admin-session-cookie>"
```

This seeds all current gov.uk sponsor records as `NEWLY_GRANTED`.

---

## Running the App

### Development Mode

```bash
npm run dev
# Starts:
# - Express server with tsx watch (hot reload on save)
# - Vite dev server (HMR for React)
# Both served on http://localhost:5000
```

### Production Build (local test)

```bash
npm run build    # Compiles TypeScript + builds Vite frontend
npm run start    # Runs production server
```

### Type Checking

```bash
npm run check    # TypeScript strict check, no emit
```

---

## Testing

### Running Tests

```bash
npm run test          # Watch mode (re-runs on file change)
npm run test:run      # Single run, CI-friendly
```

Tests use [Vitest](https://vitest.dev/). Configuration is in `vitest.config.ts`.

### Test Location

Tests live alongside source files as `*.test.ts`:

```
server/utils/sponsorStateMachine.test.ts
server/utils/csvArchiver.test.ts
```

### Writing Tests

```typescript
import { describe, it, expect } from 'vitest';

describe('myFunction', () => {
  it('returns expected value for normal input', () => {
    expect(myFunction('input')).toBe('expected');
  });

  it('handles edge case', () => {
    expect(myFunction('')).toThrow('Invalid input');
  });
});
```

**Coverage priorities:**
- Sponsor state machine transitions
- CSV diff parsing
- Auth middleware behaviour
- Tier config access gates
- COS scoring logic

---

## Binary Dependencies

The sponsor monitor pipeline uses two external binaries:

| Binary | Purpose | Source |
|--------|---------|--------|
| `qsv` (Rust) | CSV validation + row counting | [dathere/qsv](https://github.com/jqnatividad/qsv) |
| `csvdiff` (Go) | Fingerprinted CSV diffing | [aswinkarthik/csvdiff](https://github.com/aswinkarthik/csvdiff) |

### Install

```bash
npm run setup:binaries
# Runs scripts/setup-binaries.sh
# Installs binaries to ./bin/ (gitignored)
```

### Health Check

```bash
npm run check:binaries
# Outputs JSON with version and health status for each binary
```

**Degraded mode:** If `qsv` is missing, Phase 1 degrades gracefully (no row count validation). If `csvdiff` is missing, Phase 2 fails and the cron job aborts.

---

## Python Backend

The Python FastAPI backend handles:
- Companies House data enrichment (Pro+ tier)
- Job listing scraping for job alerts (Pro+ tier)

### Setup

```bash
# Python 3.11+ required
pip install -r requirements.txt  # or: uv pip install -r pyproject.toml

# Start the Python backend
python run_backend.py
# Runs on http://localhost:8000
```

If `PYTHON_BACKEND_URL` is unset, the Node.js server uses Cheerio as the primary scraper and skips Companies House enrichment.

---

## Code Style

### Formatter: Prettier

```bash
npm run format        # Format all files
npm run format:check  # Check without writing
```

### Linter: ESLint

```bash
npm run lint          # Lint all files
npm run lint:fix      # Auto-fix where possible
```

### TypeScript

- Strict mode enabled (`"strict": true` in tsconfig.json)
- Path aliases: `@/*` → `client/src/*`, `@shared/*` → `shared/*`
- No `any` — use `unknown` and narrow explicitly

### Conventions

- **Imports:** External packages first, then internal by path depth
- **Naming:** camelCase for variables/functions, PascalCase for types/components
- **Files:** kebab-case for utilities, PascalCase for React components
- **API routes:** REST-style, `/api/<resource>/<action>` pattern

---

## Debugging

### Server Logs

Structured logging via [Pino](https://getpino.io/). In dev, logs are pretty-printed:

```bash
npm run dev
# Logs output to stdout with color + timestamp
```

Set `LOG_LEVEL=debug` in `.env` for verbose output.

### Sponsor Monitor

```bash
# Public health endpoint (no auth, safe for uptime monitors)
curl http://localhost:5000/api/health/sponsor-monitor
# Returns status: ok | stale | running | unknown, lastRun details, nextCronUtc

# Check pipeline status (admin)
curl http://localhost:5000/api/admin/sponsor-monitor/status

# View recent job runs (admin)
curl http://localhost:5000/api/admin/sponsor-monitor/job-history

# Trigger manual run (admin)
curl -X POST http://localhost:5000/api/admin/sponsor-monitor/run
```

### Database Introspection

```bash
# Open Drizzle Studio (GUI for local DB)
npx drizzle-kit studio
```

### Common Issues

| Problem | Likely cause | Fix |
|---------|-------------|-----|
| Server won't start | Missing required env vars | Check `.env` against `.env.example` |
| `DATABASE_URL` error | DB not provisioned | Create DB + set connection string |
| Empty search results | `sponsor_canonical` is empty | Trigger manual monitor run |
| `csvdiff` missing error | Binary not installed | Run `npm run setup:binaries` |
| OTP not delivered | No email provider configured | Set `RESEND_API_KEY` or `BREVO_API_KEY` |
| Session not persisting | DB table missing | Run `npm run db:push` |
| Stripe webhook failing | Wrong secret or no secret | Set `STRIPE_WEBHOOK_SECRET` |

---

## Useful Links

- [Drizzle ORM Docs](https://orm.drizzle.team/)
- [Neon Serverless PostgreSQL](https://neon.tech/docs)
- [Vite Dev Server](https://vitejs.dev/guide/)
- [Vitest Docs](https://vitest.dev/)
- [Passport.js](https://www.passportjs.org/)
- [docs/SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md) — Full architecture deep-dive
- [docs/API_REFERENCE.md](docs/API_REFERENCE.md) — All API endpoints
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md) — Database schema reference
