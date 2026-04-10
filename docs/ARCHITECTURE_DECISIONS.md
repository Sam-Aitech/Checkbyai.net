# Architecture Decision Records (ADR)
# checkbyai.net
**Version:** 2.0 | **Last Updated:** 2026-03-20

---

ADRs document the significant architectural choices made in this system, the context that drove them, and the trade-offs accepted. This document allows future engineers to understand *why* things are built the way they are, not just *how*.

---

## ADR-001: Monolith over Microservices

**Status:** Accepted

**Context:**
The system has two distinct product areas (COS Check and Sponsor Monitor) plus background jobs, notifications, and billing. A microservice split was considered.

**Decision:**
Single Express process serves all routes, background jobs, and the static frontend.

**Rationale:**
- Team size of 1–2 engineers makes the operational overhead of microservices (Docker, service discovery, network latency) counterproductive
- All features share the same PostgreSQL database — splitting would require distributed transactions or eventual consistency for things like credit deduction + verification logging
- Background jobs need database access; running them in-process is simpler than a separate worker queue

**Trade-offs accepted:**
- Cron job state machine (seconds per run) runs in the same process as API requests — mitigated by Node.js async I/O (state machine is database-bound, not CPU-bound)
- Single point of failure — mitigated by Neon managed PostgreSQL surviving server restarts

---

## ADR-002: In-Memory Fuse.js Search Index

**Status:** Accepted

**Context:**
The sponsor register has ~124,000 companies. Users need fuzzy search (typo tolerance, partial name matching). Options considered:
1. PostgreSQL full-text search with `tsvector`
2. Elasticsearch / OpenSearch
3. In-memory Fuse.js index

**Decision:**
In-memory Fuse.js index rebuilt from `sponsor_canonical` table.

**Rationale:**
- 124,000 records × ~200 bytes ≈ 25MB in memory — acceptable on a modern server
- Fuse.js provides fuzzy matching with configurable thresholds; PostgreSQL `tsvector` is token-based and does not handle misspellings
- No external service dependency; Elasticsearch adds operational complexity for a dataset that fits comfortably in RAM
- Rebuild time: ~200–500ms; done on startup and after each daily job — users never experience a stale index for more than 24 hours

**Trade-offs accepted:**
- Index is lost on server restart; first ~500ms after restart, search may return a 503 if index not yet built (mitigated by lazy rebuild on first request)
- Historical names are indexed at weight 0.2 — a company renamed 3 years ago may not surface in search if only the old name is used

---

## ADR-003: PostgreSQL Advisory Locks for Job Deduplication

**Status:** Accepted

**Context:**
The sponsor monitor cron runs daily. If the server is deployed with multiple instances (horizontal scaling), two pods could both fire the cron at 00:30 UTC and both attempt to process the same data, producing duplicate changes and double notifications.

**Decision:**
Use `pg_try_advisory_lock(7483920)` at the start of each job. If the lock is already held by another instance, the job exits immediately. Combined with a DB-level idempotency check (`monitor_job_runs WHERE status='success' AND runDate=today`).

**Rationale:**
- Zero additional infrastructure (no Redis, no ZooKeeper)
- PostgreSQL advisory locks are crash-safe — if the server crashes mid-job, the lock is automatically released when the connection drops
- Atomic acquisition: `pg_try_advisory_lock` is a non-blocking test-and-set
- DB idempotency check provides a second layer: even if the lock is not held, a previously successful run for today is not repeated

**Trade-offs accepted:**
- Advisory lock is **session-scoped** — tied to the specific database connection. With Neon's serverless WebSocket pool, that connection may be silently recycled under load. If the connection holding the lock is recycled mid-job, the lock releases and a second instance could start.
- Future hardening: replace with a DB-row mutex (`SELECT ... FOR UPDATE SKIP LOCKED` on a `job_locks` table) for transactional safety.

---

## ADR-004: Two-State Removal Confirmation (GRACE_PERIOD → REMOVED_REVOKED)

**Status:** Accepted | **Supersedes:** Original single-state removal

**Context:**
gov.uk sometimes temporarily omits companies from the CSV (download errors on their side, data pipeline issues) and re-adds them the next day. A single-day absence triggering REMOVED_REVOKED notifications would generate false positives and erode user trust.

**Decision:**
A company transitions through two states before being confirmed removed:
1. **Day 1 absent:** `ACTIVE` → `GRACE_PERIOD` (emit `GRACE_PERIOD` change, increment `consecutiveMisses=1`)
2. **Day 2 absent:** `GRACE_PERIOD` → `REMOVED_REVOKED` (emit `REMOVED_REVOKED` change)

GRACE_PERIOD state is detected via csvdiff Deletions (day 1) and a separate Phase D2 check (companies already in GRACE_PERIOD that are still absent in today's fingerprint set).

**Rationale:**
- Analysis of historical gov.uk data showed occasional single-day omissions that were not actual removals
- The visa impact of a false "REMOVED" notification is significant — it causes unnecessary panic
- 2-day window balances false-positive prevention with timely alerting for genuine removals
- GRACE_PERIOD notification provides an early warning without the urgent language of REMOVED_REVOKED

**Trade-offs accepted:**
- A genuine removal will not send the urgent notification until day 2 (24-hour delay)
- The 24-hour delay is explicitly documented in the product as a data quality measure

---

## ADR-005: Fingerprint as Stable Sponsor Identity + csvdiff Primary Key

**Status:** Accepted | **Updated:** 2026-03-20

**Context:**
Companies rename frequently (acquisition, rebrand, trading name change). If identity is based on the exact name string, a rename would create a new entity — users watching "Acme Ltd" would lose their watch continuity after "Acme Holdings Ltd" appears.

Additionally, the previous in-memory reconcile() approach loaded all ~124k records into RAM to compare. This was error-prone and slow.

**Decision:**
Fingerprint = `normalize(name)|normalize(city)|lowercase(route)`. The fingerprint is:
1. The primary key for `sponsor_canonical`
2. Prepended as the first column of every fingerprinted CSV (`*_sponsors_fp.csv`)
3. The primary key used by `csvdiff` to detect additions, deletions, and modifications

**Rationale:**
- Stable identity survives: `Acme Ltd` → `Acme Limited` (same fingerprint), `Acme Corp Limited` → `Acme Corp Ltd` (same fingerprint)
- Historical names stored in `historicalNames[]` array — searchable and auditable
- Using fingerprint as csvdiff primary key means the diff output maps 1:1 to sponsor_canonical rows — no lookup required
- csvdiff is O(N) in file size, not O(M×N) in-memory comparison

**Trade-offs accepted:**
- Companies that move cities get a new fingerprint — treated as a new entity. Rare but possible.
- 85% similarity threshold in rename detection may miss extreme renames — these appear as REMOVED_REVOKED + NEW_LICENCE rather than NAME_CHANGE

---

## ADR-006: Zero Document Storage for COS Check

**Status:** Accepted

**Context:**
COS documents contain sensitive personal information (holder name, employer details, visa reference numbers). Storing them creates liability under UK GDPR data minimisation principles and is an attractive target for breach.

**Decision:**
PDF is processed entirely in memory; unlinked from the temp file system immediately after analysis. Only the SHA-256 hash, metadata, and result are stored.

**Rationale:**
- UK GDPR Article 5(1)(c): data minimisation — only collect what's necessary
- Hash is sufficient for deduplication (prevent re-processing the same document)
- Metadata (producer, dates, fonts) is sufficient for the forensic analysis — the document content itself is not needed
- Eliminates a class of breach risk entirely

**Trade-offs accepted:**
- If a user disputes a result, we cannot re-analyse the original document — only the stored metadata
- Admin HITL override is the mechanism for correcting disputed results

---

## ADR-007: Multi-Provider AI Fallback Chain

**Status:** Accepted

**Context:**
COS Check and Daily Digest depend on LLM inference. Any single AI provider can experience outages, rate limiting, or pricing changes.

**Decision:**
Centralised `aiService.ts` with ordered fallback: OpenAI GPT-4o → Anthropic Claude 3.5 Sonnet → DeepSeek Chat.

**Rationale:**
- COS Check is user-facing and synchronous — a provider outage must not block the feature
- Daily Digest is important for the landing page but non-critical — deterministic fallback available
- All three providers have different infrastructure and are unlikely to fail simultaneously

**Trade-offs accepted:**
- Results may differ slightly between providers — the AI prompt includes forensic metadata that is provider-agnostic, minimising variance
- Cost tracking across multiple providers is more complex than a single provider

---

## ADR-008: Stripe Checkout HMAC Signing

**Status:** Accepted

**Context:**
Stripe Checkout supports a `client_reference_id` field that is returned in the webhook. Without signing, a malicious actor could craft a Checkout Session with a tampered `client_reference_id` (e.g., `userId=admin`) to claim credits for another account.

**Decision:**
`client_reference_id` is set to a HMAC-SHA256 signed JSON payload containing `userId`, `packageType`, `credits`, and a timestamp. The server verifies the signature before fulfilling.

**Rationale:**
- Prevents parameter tampering at zero additional infrastructure cost
- HMAC is deterministic and fast (sub-millisecond verification)
- Timestamp in payload prevents replay attacks on the reference ID itself

**Trade-offs accepted:**
- `client_reference_id` has a character limit in Stripe — payload must be concise
- `CHECKOUT_HMAC_SECRET` rotation requires all in-flight checkout sessions to be re-initiated

---

## ADR-009: Application-Layer Authorization (No DB-Level RLS)

**Status:** Accepted (with outstanding remediation)

**Context:**
PostgreSQL Row Level Security (RLS) would enforce data isolation at the database layer, providing defence-in-depth if application code has a bug. Implementing RLS requires migrating the DB connection to use per-user roles, which adds complexity.

**Decision:**
Application-layer authorization only: `isAuthenticated` and `isAdmin` middleware, plus `userId` ownership checks on all data queries.

**Rationale:**
- Single Drizzle ORM connection pool makes per-user DB roles impractical without significant refactoring
- All data access goes through the Express API — there is no direct DB access for users
- Time-to-market priority over defence-in-depth

**Trade-offs accepted:**
- An application logic bug (e.g., missing `userId` filter on a query) could expose another user's data
- No database-level safeguard if the application is compromised

**Remediation plan:**
Add PostgreSQL RLS policies as a future hardening milestone when the connection model supports it.

---

## ADR-010: qsv Validation Gate (Hard Floor on Record Count)

## ADR-011: Operational Hardening Before Platform Decomposition

**Status:** Accepted

**Context:**
The product now has the core ingredients of a sellable platform: production billing, sponsor-monitor automation, admin workflows, security controls, and baseline CI. However, the current system still operates as a single-process monolith with binary role-based access, limited observability, and no explicit enterprise delivery model for staging, DR, or compliance evidence.

Requests for "enterprise" features can easily pull the system in the wrong direction: premature microservice work, broad infrastructure churn, or customer-specific one-offs before the platform has the operational controls to support them safely.

**Decision:**
For the next execution phase, engineering prioritises operational hardening over architectural decomposition.

Delivery order:
1. **Enterprise control plane**
	RBAC expansion, auditability, tenancy boundaries, environment promotion, admin safety rails
2. **Observability and reliability**
	Structured telemetry, alerting, SLOs, backup/restore drills, deployment safety
3. **Compliance and data governance**
	Retention schedules, access reviews, evidence collection, DSR/incident procedures
4. **Scale-out architecture changes only after hard metrics justify them**
	Separate workers, queue-backed pipelines, multi-instance topology, or service decomposition

**Rationale:**
- Enterprise buyers care more about control, evidence, and reliability than about internal service count
- Current bottlenecks are operational, not yet architectural
- The team remains small, so platform complexity must be purchased only when justified by measurable load, customer requirements, or reliability targets
- Hardening the operating model now reduces future migration risk if the system later moves to distributed workers or multi-tenant isolation

**Trade-offs accepted:**
- Some enterprise deals that require SAML, fine-grained RBAC, or formal compliance evidence may need phased delivery rather than immediate support
- In-process jobs remain acceptable in the short term, but only with explicit monitoring, runbooks, and failure containment
- The monolith remains a single deployment unit until capacity, recovery, or release-risk data proves otherwise

**Triggers to revisit this decision:**
- Sustained queue or cron workload that measurably degrades request latency
- Requirement for active-active or multi-region processing
- Enterprise customer commitments that require isolated workers, stronger tenancy boundaries, or dedicated integration surfaces
- Repeated release failures caused by the current single-unit deployment model

**Status:** Accepted | **Introduced:** 2026-03-20

**Context:**
The old pipeline had no validation of the downloaded CSV before processing. A corrupted, truncated, or accidentally replaced file from gov.uk could silently zero out all sponsors from `sponsor_canonical` — sending mass REMOVED notifications to all users.

**Decision:**
All CSV downloads must pass through `csvArchiver.ts` which runs:
1. `qsv validate` — structural validation (relaxed, non-fatal: sends admin alert but continues)
2. `qsv count` — hard abort if row count < 100,000 (the register has 120k+ entries; 100k is a safe floor)

If the count check fails, the job aborts, inserts a `isValid=false` record into `csv_archive`, sends an admin alert, and stops. No state machine changes are made.

**Rationale:**
- 100,000-record floor is far below the real register size (~124k) but well above any plausible legitimate truncation
- qsv (Rust) is extremely fast (~50ms for a 25MB file) — no meaningful overhead
- Admin alert ensures someone investigates gov.uk rather than silently serving stale data

**Graceful degradation:**
- qsv not installed → structural validation skipped (log warning), row count falls back to streaming csv-parse
- qsv binary reports -1 → same fallback

**Trade-offs accepted:**
- 100,000 threshold is a heuristic — a legitimate dramatic shrinkage of the register (unlikely) would false-positive abort
- qsv binary must be installed on the server for best performance; streaming fallback is slower for very large files

---

## ADR-011: csvdiff for Sponsor Register Diffing

**Status:** Accepted | **Introduced:** 2026-03-20 | **Replaces:** in-memory reconcile()

**Context:**
The original `reconcile()` function (~459 lines) loaded all ~124k canonical records and all ~124k today records into RAM as Maps, then iterated to detect additions/deletions/modifications. This was:
- Error-prone (subtle bugs in custom diff logic)
- Memory-intensive (~500MB peak)
- Hard to test in isolation

**Decision:**
Replace reconcile() with `csvdiff` (Go binary by aswinkarthik/csvdiff). Both yesterday's and today's fingerprinted CSVs are passed to the binary. It outputs JSON `{Additions, Deletions, Modifications}`. The state machine (`sponsorStateMachine.ts`) then processes this structured diff.

**Rationale:**
- csvdiff is purpose-built, extensively tested, and processes 100k+ rows in seconds
- Fingerprinted CSVs are stored on disk — the diff is reproducible and auditable
- Clean separation: Phase 2 (what changed) is entirely separate from Phase 3 (what to do about it)
- First-run handling: when no yesterday archive exists, `buildFirstRunDiff()` creates a synthetic diff with all records as Additions — state machine seeds DB normally

**Trade-offs accepted:**
- csvdiff binary must be installed on the server — hard failure if missing (no graceful degradation)
- CSV files accumulate on disk — requires periodic cleanup (retain at minimum yesterday + today)

---

## ADR-012: sponsor_list Table Deprecation

**Status:** Accepted | **Introduced:** 2026-03-20

**Context:**
The `sponsor_list` table stored ~124k rows per day as a snapshot of the CSV. With the csvdiff-based pipeline:
- The raw CSV lives on disk in `data/archives/` (registered in `csv_archive`)
- Per-company state lives in `sponsor_canonical`
- No code reads from `sponsor_list` anymore

Keeping the table active wastes PostgreSQL storage and creates confusion about the authoritative data source.

**Decision:**
- 2026-03-20: Stop all writes to `sponsor_list`. Mark table `@deprecated` in schema.ts and all related functions in `sponsorListFetcher.ts`.
- 2026-04-20: DROP TABLE `sponsor_list` (30-day holdback for safety).

**Rationale:**
- 30-day holdback ensures no hidden consumers are discovered after the fact
- Admin routes that read from `sponsor_list` have been redirected to `sponsorCanonical` / `csv_archive`
- The `/api/admin/sponsor-monitor/cleanup` and `/api/admin/migrate-canonical` routes return 410 Gone

**Trade-offs accepted:**
- Until DROP is executed, the table occupies disk space (but receives no new rows)

---

## ADR-013: Single Daily Cron + Idempotency (No Backup Cron)

**Status:** Accepted | **Introduced:** 2026-03-20 | **Replaces:** backup 4h cron + startup catch-up

**Context:**
The original implementation had three triggers:
1. Main cron at 00:30 UTC Mon-Fri
2. Backup cron every 4 hours Mon-Fri (in case the main cron failed)
3. `setTimeout(15s)` startup catch-up (in case the server restarted mid-day)

These overlapping triggers caused confusion and occasional double-runs despite the advisory lock.

**Decision:**
Single cron at 00:30 UTC Mon-Fri. No backup cron. No startup catch-up. The DB idempotency check (`monitor_job_runs WHERE status='success' AND runDate=today`) makes extra triggers safe, and the advisory lock prevents concurrent runs.

**Rationale:**
- The idempotency check is a complete solution: if today's job succeeded, any subsequent trigger skips immediately
- The request-triggered middleware (`checkAndTriggerIfNeeded`) still provides recovery if the cron fails — fires on the next API request after 01:00 UTC if today's job hasn't run
- Fewer moving parts = easier to reason about and debug

**Trade-offs accepted:**
- If the main cron fails AND no API requests come in before midnight, the day's job is missed
- Acceptable because gov.uk typically publishes at 09:00 UK time — the 00:30 UTC cron runs before the new register is available; the request-triggered path handles the actual download during business hours

---

## ADR-014: Security Hardening (April 2026)

**Status:** Accepted | **Introduced:** 2026-04-06

**Context:**
Code review identified several critical security vulnerabilities:
1. OTP generated with `Math.random()` — not cryptographically secure
2. Paid submission endpoints without authentication
3. HMAC secrets with fallback chains to weaker keys
4. Python backend path traversal vulnerability
5. CORS misconfiguration with wildcard origins + credentials
6. Fake authentication endpoint in Python backend
7. Default fallback values for security-critical secrets

**Decision:**
Systematic security hardening across all layers:

### Server (Node.js)
- OTP now uses `crypto.randomInt(100000, 999999)`
- All `/api/paid/*` endpoints require `isAuthenticated` middleware
- `CHECKOUT_HMAC_SECRET` required in production (hard-fail)
- `DIGEST_SIGNING_KEY` required (no default fallback)
- `IP_HASH_SALT` required (no default fallback)
- Billing error handlers now log instead of silently swallowing

### Client (React)
- FormData uploads no longer force `Content-Type: application/json`
- File upload includes `credentials: 'include'`
- Toast listener dependency array fixed (was causing memory leak)
- Confidence normalization unified across components

### Backend (Python)
- Path traversal fixed: `temp_{filename}` → sanitized path
- CORS now uses configurable `ALLOWED_ORIGINS` from environment
- Duplicate CORS middleware removed
- Fake auth endpoint removed
- Added `rapidfuzz` and `httpx` to dependencies
- Fixed wrong endpoint: `/api/scrape-companies-house` → `/api/v1/enrich/companies-house`

**Rationale:**
- Cryptographic security is non-negotiable for OTP generation
- Paid endpoints handle financial data and must require authentication
- Fallback chains weaken security by allowing degraded key usage
- Silent error swallowing prevents incident response

**Trade-offs accepted:**
- `CHECKOUT_HMAC_SECRET` is now required in production — requires deployment pipeline update
- `IP_HASH_SALT` is now required — existing deployments need env var update

---

## ADR-015: Bug Fixes and Performance Improvements (April 2026)

**Status:** Accepted | **Introduced:** 2026-04-06

**Context:**
Code review identified multiple bugs affecting functionality and performance:

### High Priority
1. `qsvDedup` built args array but ignored it — always used hardcoded array
2. Toast memory leak — listener re-added on every state change
3. Enrichment insert count overestimated due to `onConflictDoNothing`
4. DB retry used linear backoff (thundering herd risk)

### Medium Priority
1. `pdfAnalyzer` fake async — `Promise.resolve()` doesn't yield to event loop
2. Unused `customInstructions` parameter in `verifyWithRules`
3. Twilio client recreated on every WhatsApp message

**Decision:**
Applied fixes:

### Server
- `qsvDedup` now uses the built `args` array
- DB retry now uses exponential backoff with ±25% jitter
- `enrichmentWorker` uses `.returning()` to get actual inserted count
- Twilio client cached as module singleton
- `pdfAnalyzer` uses `setImmediate` for true async yield
- Removed unused `customInstructions` parameter
- Removed dead Python files (main_old.py, main_optimized.py, database.py, database_old.py, pdf_analyzer.py)

### Client
- Toast dependency array `[]` instead of `[state]`
- Toast delay fixed from 1000000ms (16min) to 10000ms (10sec)
- Dashboard cleaned up (removed unused state)
- FileUpload confidence normalized to 0-1 scale

### Dead Code Removed
- 5 Python files (28% of backend)
- Unused Dashboard state

**Rationale:**
- Exponential backoff with jitter prevents thundering herd
- Returning actual inserted count enables accurate metrics
- Memory leaks degrade performance over time
- Dead code increases cognitive load and maintenance burden

## ADR-016: Fuzzy Reconciliation for Sponsor Notification Engine
**Status:** Accepted
**Date:** 2026-04-10
**Context:** 
The Sponsor Monitor relies on \csvdiff\ which checks strict string fingerprints (Name + City + Route). When a sponsor corrects a minor typo in their name (e.g., "Tech Corp LTD" to "Tech Corp Limited"), the fingerprint breaks. This creates a "Deletion" of the old fingerprint and an "Addition" of the new fingerprint. The state machine treated these as a Revoked licence and a New Licence, causing "flicker" and false alarms.
**Decision:**
Implemented a Phase A� "Fuzzy Reconciliation" step immediately after \csvdiff\. It extracts orphaned Additions and Deletions and uses \string-similarity\ (Sorensen-Dice coefficient) to pair them.
- Matches requiring >88% similarity are converted into a single \NAME_CHANGE\ modification.
- Matched records bypass the standard Insertion/Revocation phases.
**Consequences:**
- Significant reduction in false positive "New Licence" and "Removed" notifications.
- The notification engine is now much more resilient to administrative formatting corrections by the Home Office.
- Minor performance cost due to string similarity calculations, offset by limiting it to only the subset of unresolved Additions and Deletions.
