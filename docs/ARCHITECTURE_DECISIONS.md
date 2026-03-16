# Architecture Decision Records (ADR)
# checkbyai.net
**Version:** 1.0 | **Last Updated:** 2026-03-16

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
- Cron job reconciliation (30–120s) runs in the same process as API requests — mitigated by Node.js async I/O (reconcile is database-bound, not CPU-bound)
- Single point of failure — mitigated by Neon managed PostgreSQL surviving server restarts

---

## ADR-002: In-Memory Fuse.js Search Index

**Status:** Accepted

**Context:**
The sponsor register has ~80,000 companies. Users need fuzzy search (typo tolerance, partial name matching). Options considered:
1. PostgreSQL full-text search with `tsvector`
2. Elasticsearch / OpenSearch
3. In-memory Fuse.js index

**Decision:**
In-memory Fuse.js index rebuilt from `sponsor_canonical` table.

**Rationale:**
- 80,000 records × ~200 bytes ≈ 16MB in memory — trivial on a modern server
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
The sponsor monitor cron runs daily. If the server is deployed with multiple instances (horizontal scaling), two pods could both fire the cron at 00:30 UTC and both attempt to reconcile the same data, producing duplicate changes and double notifications.

**Decision:**
Use `pg_try_advisory_lock(7483920)` at the start of each job. If the lock is already held by another instance, the job exits immediately.

**Rationale:**
- Zero additional infrastructure (no Redis, no ZooKeeper)
- PostgreSQL advisory locks are crash-safe — if the server crashes mid-job, the lock is automatically released when the connection drops
- Atomic acquisition: `pg_try_advisory_lock` is a non-blocking test-and-set

**Trade-offs accepted:**
- Advisory lock is **session-scoped** — tied to the specific database connection. With Neon's serverless WebSocket pool, that connection may be silently recycled under load. If the connection holding the lock is recycled mid-job, the lock releases and a second instance could start.
- Future hardening: replace with a DB-row mutex (`SELECT ... FOR UPDATE SKIP LOCKED` on a `job_locks` table) for transactional safety.

---

## ADR-004: Two-Day Confirmation Before Marking a Sponsor REMOVED

**Status:** Accepted

**Context:**
gov.uk sometimes temporarily omits companies from the CSV (download errors on their side, data pipeline issues) and re-adds them the next day. A single-day absence triggering REMOVED notifications would generate false positives and erode user trust.

**Decision:**
A company must be absent from the CSV for **2 consecutive days** before a REMOVED change is emitted and notifications sent.

**Rationale:**
- Analysis of historical gov.uk data showed occasional single-day omissions that were not actual removals
- The visa impact of a false "REMOVED" notification is significant — it causes unnecessary panic
- 2-day window balances false-positive prevention with timely alerting for genuine removals
- `consecutiveMisses` field tracks the count; status changes to `NOT_LISTED` only at miss ≥ 2

**Trade-offs accepted:**
- A genuine removal will notify users 24 hours after it actually happened
- The 24-hour delay is explicitly documented in the product as a data quality measure

---

## ADR-005: Fingerprint as Stable Sponsor Identity

**Status:** Accepted

**Context:**
Companies rename frequently (acquisition, rebrand, trading name change). If identity is based on the exact name string, a rename would create a new entity — users watching "Acme Ltd" would lose their watch continuity after "Acme Holdings Ltd" appears.

**Decision:**
Fingerprint = `normalize(name)|normalize(city)|lowercase(route)`. The fingerprint is the primary key for `sponsor_canonical`. When a rename is detected (85%+ string similarity + same city+route), the fingerprint is updated on the existing row.

**Rationale:**
- Stable identity survives: `Acme Ltd` → `Acme Limited` (same fingerprint), `Acme Corp Limited` → `Acme Corp Ltd` (same fingerprint)
- Historical names stored in `historicalNames[]` array — searchable and auditable
- Rename detection uses locality bucketing (only compare candidates in same city+route) — prevents O(M×N) comparison across all 80,000 sponsors

**Trade-offs accepted:**
- Companies that move cities get a new fingerprint — treated as a new entity. Rare but possible.
- 85% similarity threshold may miss extreme renames (`Acme Ltd` → `Global Services Ltd`) — these would appear as a REMOVED + ADDED pair rather than a NAME_CHANGE

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

## ADR-010: Staged Retry Delays for gov.uk CSV Download

**Status:** Accepted

**Context:**
gov.uk experiences transient failures (DNS timeouts, 503s) that typically resolve within 2–5 minutes. The original implementation used a flat 30-minute retry delay — if the first attempt failed, the job would wait 30 minutes before retry, potentially delaying the day's monitor completion by 60+ minutes.

**Decision:**
Staged retry delays: 5 minutes after attempt 1, 15 minutes after attempt 2. Maximum total wait: 20 minutes for 3 attempts.

**Rationale:**
- gov.uk transient errors resolve quickly — a 30-minute wait wastes the window when notifications should be sent
- Staged delays (5→15 min) match the observed recovery pattern: most transient issues resolve within 5 minutes; persistent issues (maintenance windows) require the full 15
- 20-minute worst-case is substantially better than the previous 60-minute worst-case

**Trade-offs accepted:**
- Still a single retry path for both the HTML page scrape and the CSV download — a failure in either triggers the full retry delay
- Future improvement: cache the last-known CSV URL to skip the page scrape on retry
