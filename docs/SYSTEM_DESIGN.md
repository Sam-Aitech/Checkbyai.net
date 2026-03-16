# System Design Document
# checkbyai.net
**Version:** 1.0 | **Last Updated:** 2026-03-16

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
│                 │         │       notificationDispatcher.ts     │  │
│                 │         │  email (Resend) · SMS · WhatsApp     │  │
│                 │         └─────────────────────────────────────┘  │
│                 │                                                   │
│  ┌──────────────▼──────────────────────────────────────────────┐   │
│  │              Neon Serverless PostgreSQL (DATABASE_URL)       │   │
│  │  Pool: max=10  idleTimeout=30s  connTimeout=10s             │   │
│  └─────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────┘

External:  gov.uk CSV · Stripe · Resend · Brevo · Twilio · OpenAI/Claude/DeepSeek
           Python FastAPI backend (localhost:8000) for Companies House + job scraping
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

---

## 3. Component Deep-Dives

### 3.1 Sponsor Monitor Pipeline

The sponsor monitor job is the core data pipeline. It runs daily and is responsible for maintaining the canonical state of every UK sponsor.

```
Trigger (cron 00:30 UTC or HTTP request)
          │
          ▼
pg_try_advisory_lock(7483920)  ──► false → skip (another instance running)
          │ true
          ▼
downloadWithRetry()
  ├─ findCsvUrl(): scrape gov.uk HTML → extract CSV href
  └─ fetchWithTimeout(csvUrl, 60s): download + parse CSV
          │
          ▼  ~80,000 SponsorRecord objects
storeSnapshot(records, today)
  └─ batch INSERT into sponsor_list (500/batch, onConflictDoNothing)
          │
          ▼
loadActiveCanonical()
  └─ SELECT * FROM sponsor_canonical WHERE status='ACTIVE'
     → Map<fingerprint, CanonicalRecord>
          │
          ▼
buildTodayRecords(csvRecords)
  └─ Map<fingerprint, TodayRecord> (deduped by fingerprint)
          │
          ▼
reconcile(canonicalMap, todayMap, today)
  │
  ├─ Phase 1: Match fingerprints
  │   ├─ Phase 1a: Bulk UPDATE matched records (last_seen, consecutive_misses=0)
  │   │            Batched 500/batch via ARRAY[...]::int[]
  │   ├─ Phase 1b: Individual UPDATE for name/rating changes
  │   └─ Phase 1c: INSERT new records (250/batch, onConflictDoNothing)
  │
  └─ Phase 2: Process missing records
      ├─ miss=1: fuzzy rename check (85% Jaro-Winkler, same city+route bucket)
      │          rename → UPDATE fingerprint + historical_names
      │          no rename → UPDATE consecutive_misses=1
      └─ miss≥2: UPDATE status='NOT_LISTED', emit REMOVED change
          │
          ▼
rebuildSponsorIndex()  ← in-memory Fuse.js index from sponsor_canonical
          │
          ▼
INSERT sponsor_changes (batch 500)
          │
          ▼
notifyAffectedUsers() per alertable change
  └─ 4 DB queries total (batch pattern):
     ① COUNT sent notifications last 24h per user (rate limit check)
     ② SELECT user records
     ③ SELECT notification preferences
     Dispatch: email + WhatsApp + SMS in parallel (Promise.all)
          │
          ▼
generateHeadline() → INSERT daily_digest
          │
          ▼
INSERT monitor_job_runs (status, duration, counts)
          │
          ▼
pg_advisory_unlock(7483920)
```

**Fingerprint Design:**
The fingerprint is the stable identity of a sponsor across name changes:
```
fingerprint = normalize(name) + "|" + normalize(city) + "|" + lowercase(route)
```
`normalize()` strips punctuation, suffixes (Ltd, PLC, LLP, etc.), and extra whitespace. This means "Acme Ltd" and "Acme Limited" both produce the same fingerprint.

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

All 3 rebuild paths call `rebuildSponsorIndex()` which issues a single `SELECT` against `sponsor_canonical` and instantiates a new Fuse instance. With ~80,000 records this takes ~200–500ms. During the rebuild, the old index continues to serve requests.

### 3.4 Notification Engine

```
notifyAffectedUsers(change: SponsorChange)
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
 │                          │               [cron] ──── GET ──────────────────────────►│
 │                          │                  │◄── CSV ────────────────────────────── │
 │                          │               [reconcile]             │                  │
 │                          │                  ├─ INSERT changes ──►│                  │
 │                          │                  ├─ SELECT watches ──►│                  │
 │                          │                  ├─ SELECT prefs ────►│                  │
 │◄─ email alert ─────────  │                  ├─ POST Resend API   │                  │
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
- **Pattern:** Scrape HTML with cheerio to find `assets.publishing.service.gov.uk/*.csv` link, then download
- **Timeout:** 30s for HTML page, 60s for CSV download
- **User-Agent:** `CheckByAI-SponsorBot/1.0; +https://checkbyai.net`
- **Retry:** 3 attempts with 5min/15min staged delays

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

---

## 6. Concurrency & Distributed Locking

Both background jobs use PostgreSQL session-level advisory locks to prevent duplicate execution across multiple server instances:

| Job | Lock Key |
|---|---|
| Sponsor Monitor | `pg_try_advisory_lock(7483920)` |
| Job Alert | `pg_try_advisory_lock(7483921)` |

Lock is acquired at job start and released in a `finally` block. If the DB connection drops, PostgreSQL automatically releases the lock, allowing the next instance to proceed.

**Caveat:** Session-level locks are tied to a specific DB connection. With Neon's serverless WebSocket pool, the connection holding the lock may be recycled. A DB-row mutex (`SELECT FOR UPDATE SKIP LOCKED`) would be more robust for a distributed setup.

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
   ├─ startSponsorMonitorCron()  ← registers node-cron for 00:30 UTC
   └─ startJobAlertScheduler()  ← registers node-cron for 02:00 UTC Mon-Fri

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
| Single process for API + cron | Cron failure blocks no requests; but resource contention during reconcile (30–120s) | Reconcile is async; advisory lock prevents duplicate runs |
| In-memory Fuse index | Lost on restart; ~200–500ms rebuild | Lazy rebuild on first request if not ready |
| gov.uk has no API | CSV scrape may break if gov.uk changes page structure | cheerio scrape + error alerting to admin email |
| Neon auto-pause | Cold start latency (2–10s) after idle period | Pool `idleTimeoutMillis=30s` releases connections; `dbRetry.ts` handles connection errors |
| Python backend at localhost:8000 | If Python process dies, enrichment and job scraping fail | Silent failure (degraded mode); job alerts skipped gracefully |
