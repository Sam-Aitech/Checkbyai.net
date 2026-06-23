# System Design Document
# checkbyai.net
**Version:** 2.0 | **Last Updated:** 2026-03-20

---

## 1. Architecture Overview

checkbyai.net is a monolithic Node.js/Express application that serves both the API and the React frontend from a single process on port 5000. There is no microservice separation, no load balancer in front, and no separate job runner process — background jobs run as in-process cron tasks.

```
┌────────────────────────────────────────────────────────────────────┐
│                        checkbyai.net (port 5000)                   │
│                                                                    │
│  ┌──────────────────┐        ┌──────────────────────────────────┐  │
│  │   React Frontend │        │         Express API Server       │  │
│  │   (Vite/static)  │◄──────►│   routes.ts  ·  auth.ts          │  │
│  └──────────────────┘        │   storage.ts  ·  middleware/      │  │
│                              └──────────────┬───────────────────┘  │
│                                             │                       │
│                 ┌───────────────────────────┼──────────────────┐   │
│                 │          Services Layer   │                  │   │
│                 │                           │                  │   │
│  ┌──────────────▼──────┐  ┌────────────────▼────┐  ┌─────────▼──┐ │
│  │   pdfAnalyzer.ts    │  │ sponsorMonitorJob.ts│  │jobAlertJob │ │
│  │   COS Check engine  │  │ Daily cron 00:30 UTC│  │Mon-Fri 02h │ │
│  └──────────────┬──────┘  └──────────┬──────────┘  └────────────┘ │
│                 │                    │                              │
│                 │         ┌──────────▼──────────────────────────┐  │
│                 │         │  BullMQ Queue (Redis) / Inline      │  │
│                 │         │  notificationEngine.ts              │  │
│                 │         └─────────────────────────────────────┘  │
│                 │                                                   │
│  ┌──────────────▼──────────────────────────────────────────────┐   │
│  │              Neon Serverless PostgreSQL (DATABASE_URL)       │   │
│  │  Pool: max=10  idleTimeout=30s  connTimeout=10s             │   │
│  └─────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────┘

External:  gov.uk CSV · Stripe · Resend · Brevo · Twilio · OpenAI/Claude/DeepSeek
           Python FastAPI backend (localhost:8000) for Companies House + job scraping
           qsv (Rust binary) — CSV validation and row counting
           csvdiff (Go binary) — fingerprinted CSV diffing
```

---

## 2. Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Runtime | Node.js | 20+ |
| HTTP Framework | Express | 4.21 |
| Language | TypeScript | 5.x |
| Frontend Build | Vite | 5.x |
| Frontend Framework | React | 18 |
| UI Components | shadcn/ui + Radix UI | — |
| CSS | Tailwind CSS | 3.x |
| ORM | Drizzle ORM | 0.39 |
| Database | Neon Serverless PostgreSQL | — |
| DB Driver | @neondatabase/serverless (WebSocket) | 1.x |
| Authentication | Passport.js (local + Google OAuth 2.0) | 0.7 |
| Session Store | connect-pg-simple (PostgreSQL) | 10.x |
| Job Scheduling | node-cron | 4.x |
| Search Index | Fuse.js (in-memory fuzzy search) | 7.x |
| File Upload | multer | 2.1 |
| PDF Analysis | pdf-parse + fast-xml-parser | — |
| Payments | Stripe | 20.x |
| Email | Resend API | HTTP |
| SMS | Brevo API | HTTP |
| WhatsApp | Twilio SDK | 5.x |
| CAPTCHA | Cloudflare Turnstile | — |
| Validation | Zod | 3.x |
| Compression | compression (gzip level 6) | — |
| CSV Validation | qsv (Rust binary, dathere/qsv) | latest |
| CSV Diffing | csvdiff (Go binary, aswinkarthik/csvdiff) | latest |

---

## 3. Component Deep-Dives

### 3.1 Sponsor Monitor Pipeline

The sponsor monitor job is the core data pipeline. It runs daily at 00:30 UTC Mon–Fri. The pipeline has 5 phases: validation gate, diff, state machine, notifications, digest.

```
Trigger (cron 00:30 UTC Mon-Fri, or HTTP /api/admin/sponsor-monitor/run)
          │
          ▼
pg_try_advisory_lock(7483920)  ──► false → skip (another instance running)
          │ true
          ▼
Idempotency check
  └─ SELECT from monitor_job_runs WHERE runDate=today AND status='success'
     → exists + source='cron' → skip (already ran today)
          │
          ▼ ── PHASE 1: CSV Acquisition & Validation ──────────────────────
discoverCsvUrl()
  └─ scrape gov.uk via Firecrawl (optional) → Cheerio fallback → extract CSV href
          │
          ▼
ensureTodaysArchive(today, csvUrl)            [csvArchiver.ts]
  ├─ Cache check: csv_archive WHERE snapshotDate=today AND file exists → return cached
  ├─ Download CSV → disk: data/archives/YYYY-MM-DD_sponsors_raw.csv
  ├─ SHA-256 checksum
  ├─ qsv validate → admin alert if structural errors (non-fatal)
  ├─ qsv count → HARD ABORT if count < 100,000 (corruption guard)
  ├─ INSERT csv_archive (snapshotDate, filePath, recordCount, checksumSha256)
  └─ buildFingerprintedCsv() → YYYY-MM-DD_sponsors_fp.csv
          │
          ▼ ── PHASE 2: CSV Diff ──────────────────────────────────────────
getArchiveForDate(yesterday)
  ├─ null → first run → buildFirstRunDiff(rawFilePath)
  │          └─ parseCsvFile() → all records as Additions → seed DB
  │
  └─ found → runCsvDiff(yesterday_fp.csv, today_fp.csv, ["fingerprint"])
               [binaryRunner.ts — calls csvdiff binary]
               └─ JSON output: { Additions[], Deletions[], Modifications[] }
          │
          ▼
saveDiffResult(runDate, diff)  → INSERT diff_results (non-fatal)
          │
          ▼ ── PHASE 3: State Machine ─────────────────────────────────────
applyStateMachine(diff, today, todayFingerprintedCsvPath)
  [sponsorStateMachine.ts]
  │
  ├─ Phase A: Load only affected records from sponsor_canonical (batched IN clause)
  │
  ├─ Phase C: Additions
  │   ├─ new fingerprint → INSERT sponsor_canonical (status=NEWLY_GRANTED)
  │   │   emit NEW_LICENCE change
  │   └─ known fingerprint (REMOVED_REVOKED) → UPDATE status=NEWLY_GRANTED
  │       emit RE_ACTIVATED change
  │
  ├─ Phase D: Deletions
  │   ├─ consecutiveMisses=0 → UPDATE status=GRACE_PERIOD, misses=1
  │   │   emit GRACE_PERIOD change
  │   └─ consecutiveMisses≥1 → UPDATE status=REMOVED_REVOKED
  │       emit REMOVED_REVOKED change
  │
  ├─ Phase D2: GRACE_PERIOD → REMOVED_REVOKED
  │   SELECT GRACE_PERIOD records NOT IN today's fingerprint set
  │   → UPDATE to REMOVED_REVOKED, emit REMOVED_REVOKED change
  │
  ├─ Phase E: Modifications (attribute changes from csvdiff)
  │   Classify: rating change → UPGRADED/DOWNGRADED
  │             route change → ROUTE_CHANGE
  │             name change → NAME_CHANGE
  │
  ├─ Phase F: Rename detection (85% Jaro-Winkler, same city+route bucket)
  │   → UPDATE fingerprint on sponsor_canonical, append to historicalNames[]
  │
  ├─ Phase G: Bulk UPDATE lastSeen on all ACTIVE records seen today
  │
  └─ batchedInsertChanges(changes, today)  → INSERT sponsor_changes
     [uses .returning() to populate change.id for notification FK]
          │
          ▼
rebuildSponsorIndex()  ← Fuse.js index rebuilt from sponsor_canonical
          │
          ▼ ── PHASE 4: Notifications (BullMQ) ────────────────────────────
for each alertable change (changeType ≠ NAME_CHANGE):
  └─ queue job in BullMQ (addBulk to NOTIFICATION_JOB) 
       ├─ (Fallback to inline loop if Redis unavailable)
       ├─ Worker processes job: notifyUsersOfEvent(change)
       ├─ SELECT watches matching normalized org name
       ├─ Redis sorted-set sliding-window rate limit:
       │    3 sends per user per company per rolling hour
       │    (shared across all workers/processes; fail-closed if Redis unavailable)
       ├─ getTierConfig → check if email channel allowed
       ├─ Check user opt-outs (users.notif_prefs)
       └─ Dispatch: email via Resend
          INSERT notif_engine_log with changeId FK and success/fail metrics
          │
          ▼
processDelayedNotifications() ← hourly cron, delivers queued notifications
          │
          ▼ ── PHASE 5: Audit & Digest ────────────────────────────────────
generateHeadline() → INSERT daily_digest (AI-generated summary)
          │
          ▼
INSERT monitor_job_runs (runDate, source, status, recordsProcessed, durationMs...)
          │
          ▼
pg_advisory_unlock(7483920)
```

**Fingerprint Design:**
The fingerprint is the stable identity of a sponsor, and the primary key for `csvdiff` comparisons:
```
fingerprint = normalize(name) + "|" + normalize(city) + "|" + lowercase(route)
```
`normalize()` strips punctuation, suffixes (Ltd, PLC, LLP, etc.), and extra whitespace. The fingerprinted CSV (`*_sponsors_fp.csv`) prepends this column so `csvdiff` can detect additions, deletions, and modifications by fingerprint.

**4-State Status Model (sponsor_canonical.status):**
```
                    ┌─────────────────────────────────┐
                    │           ACTIVE                 │
                    │  (seen in today's CSV)           │
                    └─────────────┬───────────────────┘
                      absent 1 day│             ▲ reappears
                                  ▼             │
                    ┌─────────────────────────────────┐
                    │         GRACE_PERIOD             │
                    │  (absent day 1, miss count = 1)  │
                    └─────────────┬───────────────────┘
                      absent 2nd  │
                      day         ▼
                    ┌─────────────────────────────────┐
                    │       REMOVED_REVOKED            │
                    │  (confirmed removed, ≥2 misses)  │
                    └─────────────────────────────────┘
                                  │ reappears on register
                                  ▼
                    ┌─────────────────────────────────┐
                    │         NEWLY_GRANTED            │
                    │  (new or reactivated licence)    │
                    └─────────────────────────────────┘
```

### 3.2 COS Check Pipeline

```
POST /api/verify (multer, PDF only, 10MB max)
          │
          ▼
documentHash = SHA-256(fileBuffer)
          │
          ▼
PDFAnalyzer.extractMetadata(buffer)
  ├─ Parallel regex extraction on raw PDF bytes
  ├─ fast-xml-parser on XMP metadata stream
  ├─ Font name extraction
  └─ Producer/creator string extraction
          │
          ▼
PDFAnalyzer.verifyWithRules(metadata)
  ├─ Suspicious software detection (Photoshop, GIMP, Canva, etc.)
  ├─ Known genuine producer validation (MS Word, Adobe, LibreOffice Writer)
  ├─ Date consistency check (modDate before createDate = red flag)
  ├─ XMP history analysis (software trail)
  └─ Score: 0–100
          │
          ▼
analyzeAgainstTrustedPatterns(metadata)
  ├─ Load global_ai_rules (cached per request)
  ├─ Load trusted_patterns (admin-uploaded genuine documents)
  └─ Build enriched AI prompt with rules + patterns
          │
          ▼
aiService.createChatCompletion() with fallback chain:
  OpenAI gpt-4o → Claude claude-3-5-sonnet → DeepSeek deepseek-chat
          │
          ▼
Classify result (genuine/suspicious/fake)
          │
          ▼
receiptId = nanoid(12)
integrityHash = HMAC-SHA256(result + metadata + receiptId)
          │
          ▼
INSERT verification_results (userId, result, confidence, metadata, documentHash, receiptId)
          │
          ▼
unlink(tempFile)  ← document permanently deleted
          │
          ▼
Return { result, confidence, receiptId, analysisDetails }
```

### 3.3 In-Memory Search Index

The Fuse.js index is a singleton module-level variable:
```typescript
let fuseIndex: Fuse<SponsorSearchRecord> | null = null;
```

It is rebuilt:
1. On server startup (fire-and-forget, fails silently if DB unavailable)
2. After each daily cron run completes
3. Lazily on first search request if still null

All 3 rebuild paths call `rebuildSponsorIndex()` which issues a single `SELECT` against `sponsor_canonical` and instantiates a new Fuse instance. With ~124,000 records this takes ~200–500ms. During the rebuild, the old index continues to serve requests.

### 3.4 Notification Engine

```
notifyAffectedUsers(change: SponsorChange)  [changeId populated from batchedInsertChanges()]
          │
          ▼
Guard: change.id === undefined → warn + return (prevents FK violation)
          │
          ▼
SELECT watches WHERE organisationNameNormalized = normalize(change.name)
          │
          ▼
Deduplicate userIds
          │
          ▼
Promise.all([
  SELECT COUNT(sent notifications last 24h) per userId,   ← rate limit check
  SELECT users WHERE id IN (userIds),
  SELECT notification_preferences WHERE userId IN (userIds)
])
          │
          ▼  O(1) Map lookups
for each user:
  ├─ Rate limit: skip if ≥ 10 sent in last 24h
  ├─ getTierConfig(user.subscriptionStatus)
  ├─ getDeliverAfter(tier) → null=immediate, Date=queue
  │
  ├─ If deliverAfter: INSERT notification_log (status='queued', deliverAfter=...)
  │
  └─ If immediate: Promise.all([
       sendEmail via Resend API,
       sendSMS via Brevo API,      ← only if smsVerified=true
       sendWhatsApp via Twilio     ← only if whatsappVerified=true
     ])

processDelayedNotifications()  ← runs hourly
  ├─ SELECT queued WHERE deliverAfter <= NOW() LIMIT 100
  ├─ Batch all lookups (3 parallel inArray queries)
  └─ Deliver + UPDATE status='sent'/'failed'
```

### 3.5 CSV Archive & Diff System

**File layout on disk:**
```
data/archives/
  YYYY-MM-DD_sponsors_raw.csv      ← raw Gov.uk CSV (downloaded by csvArchiver)
  YYYY-MM-DD_sponsors_fp.csv       ← fingerprinted CSV (input to csvdiff)
```

**qsv binary (dathere/qsv):** Used for CSV structural validation (`qsv validate`) and record counting (`qsv count`). If binary not installed, validation is skipped and counting falls back to streaming csv-parse. Hard abort if record count < 100,000.

**csvdiff binary (aswinkarthik/csvdiff):** Takes two fingerprinted CSVs and outputs JSON `{Additions, Deletions, Modifications}` keyed by `fingerprint` column. This replaces the old in-memory reconcile() function (~459 lines deleted).

---

## 4. Data Flow Diagrams

### 4.1 User Registration → First Watch → First Alert

```
User                    Frontend              API                  DB               gov.uk
 │                          │                  │                    │                  │
 ├─ enter email ──────────► │                  │                    │                  │
 │                          ├─ POST /send-otp ►│                    │                  │
 │                          │                  ├─ INSERT users ────►│                  │
 │                          │                  ├─ send OTP email    │                  │
 ├─ enter OTP ────────────► │                  │                    │                  │
 │                          ├─ POST /verify ──►│                    │                  │
 │                          │                  ├─ UPDATE users ────►│                  │
 │                          │◄── session ───── │                    │                  │
 │                          │                  │                    │                  │
 ├─ search "Acme Ltd" ────► │                  │                    │                  │
 │                          ├─ GET /search ───►│                    │                  │
 │                          │                  ├─ fuseIndex.search()│                  │
 │                          │◄── results ───── │                    │                  │
 │                          │                  │                    │                  │
 ├─ click Watch ──────────► │                  │                    │                  │
 │                          ├─ POST /watches ─►│                    │                  │
 │                          │                  ├─ INSERT watches ──►│                  │
 │                          │                  │                    │                  │
 │  [next day, 00:30 UTC]   │                  │                    │                  │
 │                          │               [cron]                  │                  │
 │                          │                  ├─ discoverCsvUrl() ─────────────────► │
 │                          │                  │◄─ CSV URL ──────────────────────────  │
 │                          │                  ├─ download CSV → disk                  │
 │                          │                  ├─ qsv validate + count                 │
 │                          │                  ├─ buildFingerprintedCsv()              │
 │                          │                  ├─ runCsvDiff() ──────────              │
 │                          │                  ├─ applyStateMachine()  │               │
 │                          │                  ├─ INSERT changes ──►  │               │
 │                          │                  ├─ SELECT watches ──►   │               │
 │                          │                  ├─ SELECT prefs ────►   │               │
 │◄─ email alert ─────────  │                  ├─ POST Resend API      │               │
```

### 4.2 COS Check Flow

```
User uploads PDF
      │
      ▼
[multer validates: PDF, ≤10MB]
      │
      ▼
SHA-256 hash computed
      │
      ├─── hash exists in verification_results? ──► return cached result
      │    (prevents reprocessing same document)
      │
      ▼ (new document)
PDFAnalyzer.extractMetadata()
      │
      ▼
PDFAnalyzer.verifyWithRules()
      │
      ▼
analyzeAgainstTrustedPatterns()
      │
      ▼
AI API call (with fallback chain)
      │
      ▼
classify(score) → genuine/suspicious/fake
      │
      ▼
receiptId + integrityHash generated
      │
      ▼
INSERT verification_results
      │
      ▼
unlink(tempFile)  ← DELETE DOCUMENT IMMEDIATELY
      │
      ▼
return result to user
```

---

## 5. External Service Integration

### 5.1 gov.uk Sponsor Register
- **Method:** HTTP scrape + CSV download (no official API)
- **Page URL:** `https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers`
- **Pattern:** `discoverCsvUrl()` in `sponsorListFetcher.ts` — scrapes HTML with cheerio to find `assets.publishing.service.gov.uk/*.csv` link, throws if only HTML fallback available
- **Download:** Streamed directly to disk via `ensureTodaysArchive()` — never fully loaded into RAM
- **Validation:** qsv validate (structural) + qsv count (≥100,000 records hard floor)
- **Timeout:** 2-minute abort controller on download
- **User-Agent:** `CheckByAI-SponsorBot/1.0; +https://checkbyai.net`
- **Retry:** None (validation gate + idempotency make retries unnecessary — job can safely re-run)

### 5.2 Stripe
- **Mode:** Checkout Sessions (hosted page)
- **Webhook:** `POST /api/stripe-webhook` — raw body verified via `stripe.webhooks.constructEvent()`
- **Idempotency:** `processed_checkouts` table prevents duplicate fulfillment on webhook replay
- **Events handled:** `checkout.session.completed`, `customer.subscription.created/updated/deleted`

### 5.3 AI Providers (COS Check + Daily Digest)
- **Primary:** OpenAI GPT-4o
- **Fallback 1:** Anthropic Claude 3.5 Sonnet
- **Fallback 2:** DeepSeek Chat
- **Centralised in:** `server/services/aiService.ts` (`createChatCompletionWithFallback`)
- **Zero-provider handling:** Returns HTTP 503 gracefully

### 5.4 Notification Providers
| Channel | Provider | API |
|---|---|---|
| Email | Resend | `POST https://api.resend.com/emails` |
| SMS | Brevo | `POST https://api.brevo.com/v3/transactionalSMS/sms` |
| WhatsApp | Twilio | SDK `client.messages.create()` |

### 5.5 Python FastAPI Backend
- **URL:** `http://localhost:8000` (`PYTHON_BACKEND_URL` env var)
- **Endpoints used:**
  - `POST /api/scrape-companies-house` — enrichment data
  - `POST /api/scrape-jobs` — job board scraping
- **Timeout:** 60 seconds
- **Failure mode:** Silent skip (enrichment missing = degraded notification, not failure)

### 5.6 Binary Tools (Sponsor Monitor)
| Tool | Purpose | Binary path |
|---|---|---|
| qsv (Rust) | CSV validation + row counting | `$PATH/qsv` |
| csvdiff (Go) | Fingerprinted CSV diffing | `$PATH/csvdiff` |

Both are optional — if missing, the pipeline degrades gracefully (qsv skipped, csvdiff falls back to error).

---

## 6. Concurrency & Distributed Locking

Both background jobs use PostgreSQL session-level advisory locks to prevent duplicate execution across multiple server instances:

| Job | Lock Key |
|---|---|
| Sponsor Monitor | `pg_try_advisory_lock(7483920)` |
| Job Alert | `pg_try_advisory_lock(7483921)` |

Lock is acquired at job start and released in a `finally` block. If the DB connection drops, PostgreSQL automatically releases the lock, allowing the next instance to proceed.

The monitor job also has an **idempotency check** (separate from the advisory lock): it queries `monitor_job_runs` for `status='success' AND runDate=today`. If found and `source='cron'`, the job skips entirely. This means a manual trigger (`source='manual'`) can still run even if today's cron already succeeded.

**Caveat:** Session-level locks are tied to a specific DB connection. With Neon's serverless WebSocket pool, the connection holding the lock may be recycled. A DB-row mutex (`SELECT FOR UPDATE SKIP LOCKED`) would be more robust for a distributed setup.

### 6.1 BullMQ Job Reliability (`server/services/jobQueue.ts`)

| Setting | Value | Why |
|---|---|---|
| `defaultJobOptions.attempts` | 3 | Was 1 (no retry) — a transient failure permanently dropped a job |
| `defaultJobOptions.backoff` | exponential, 5s base | Avoids retry storms against external providers/DB |
| `removeOnComplete` | age 24h, count 5000 | Was unbounded — Redis memory grew forever |
| `removeOnFail` | age 7d, count 5000 | Failed jobs kept for inspection/replay, not lost immediately |
| Notification worker `concurrency` | 3 | `notifyUsersOfEvent()` fans out per-user via `p-limit(10)` internally; 3×10=30 against a DB pool `max:20` (`server/db.ts`) is the accepted ceiling — do not raise without also re-checking pool sizing |

Notification jobs use a deterministic `jobId` (`notif-${change.id}-${today}`, `change.id` = `sponsor_changes` primary key) so a crash/restart mid-pipeline-run can't double-queue the same change. The Redis-down inline fallback in `sponsorMonitorJob.ts` processes the full list of alertable changes (previously capped at 50, silently dropping the rest).

Per-user dispatch failures inside `notifyUsersOfEvent()` are caught individually so one user's failure (e.g. the rate limiter's fail-closed throw on a Redis blip) can't abort the whole batch — that would otherwise trigger a job-level BullMQ retry that re-sends to every user who already succeeded in the same attempt. Only failures before per-user dispatch starts (the DB queries that load watchers/prefs) propagate and trigger a retry, which is safe to replay.

---

## 7. Startup Sequence

```
1. Validate required env vars (DATABASE_URL, SESSION_SECRET, etc.)
   └─ EXIT in production if any missing

2. Express app initialized with middleware stack:
   compression → WWW redirect → security headers → CORS → body parsers → request logger

3. registerRoutes(app)
   ├─ setupAuth(app)          ← Passport + session store (PostgreSQL)
   ├─ All API routes registered
   ├─ rebuildSponsorIndex()   ← async, fire-and-forget (non-blocking)
   └─ startSponsorMonitorCron()  ← registers node-cron for 00:30 UTC Mon-Fri
                                    + hourly cron for delayed notifications

4. server.listen(5000)
   └─ seedAdminUser()         ← upsert admin user from ADMIN_EMAIL env var

5. [Non-blocking background]:
   └─ cleanupProcessedCheckouts()  ← delete idempotency records > 48h old
```

---

## 8. Request Processing Middleware Stack

```
Request
  │
  ▼
compression (gzip level 6, threshold 1KB)
  │
  ▼
WWW redirect (www.checkbyai.net → checkbyai.net, 301)
  │
  ▼
Security headers (CSP, HSTS, X-Frame-Options, Permissions-Policy)
  │
  ▼
CORS (same-origin, allows self only)
  │
  ▼
express.json (10MB limit, captures rawBody for Stripe webhook)
  │
  ▼
express.urlencoded (extended:false, prevents prototype pollution)
  │
  ▼
Request logger (method, path, status, duration)
  │
  ▼
Route handlers
  │
  ▼
Global error handler (status + message, no stack traces in response)
```

---

## 9. Known Architectural Constraints

| Constraint | Impact | Mitigation |
|---|---|---|
| Single process for API + cron | Cron failure blocks no requests; but resource contention during state machine (seconds) | State machine is database-bound async; advisory lock prevents duplicate runs |
| In-memory Fuse index | Lost on restart; ~200–500ms rebuild | Lazy rebuild on first request if not ready |
| gov.uk has no API | CSV scrape may break if gov.uk changes page structure | discoverCsvUrl() throws hard; admin alert sent; job aborts cleanly |
| qsv/csvdiff binaries | If binaries not installed, pipeline cannot diff | qsv gracefully skipped; csvdiff binary missing is a hard error (job fails) |
| Neon auto-pause | Cold start latency (2–10s) after idle period | Pool `idleTimeoutMillis=30s` releases connections; `dbRetry.ts` handles connection errors |
| Python backend at localhost:8000 | If Python process dies, enrichment and job scraping fail | Silent failure (degraded mode); job alerts skipped gracefully |
| sponsor_list table | Deprecated 2026-03-20; no new writes | Schedule DROP TABLE after 2026-04-20 (30-day holdback) |
