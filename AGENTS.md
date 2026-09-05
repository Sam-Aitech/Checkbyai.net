<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes � gives risk-scored analysis |
| `get_review_context` | Need source snippets for review � token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.

<!-- ── Session Context: Sponsor Monitor Pipeline Fix (Phases 1–3) ── -->

## Session Context: Sponsor Monitor Pipeline Fix

**Goal:** Diagnose and fix why the Sponsor Monitor frontend shows no changes despite real daily changes from the Home Office register.

### Done

#### Phase 1 — Diagnostic Tooling
- Created `server/utils/sponsorMonitorDiagnostics.ts` with 10 parallel health checks (`checkCronOwnership`, `checkAdvisoryLock`, `checkRecentRuns`, `checkArchiveIntegrity`, `checkChangeProduction`, `checkRedisHealth`, `checkPythonBackend`, `checkBinaries`, `checkQueueHealth`, `checkDigestHealth`, `checkSearchIndexHealth`).
- Wired `GET /api/admin/sponsor-monitor/diagnostics` and `POST /api/admin/sponsor-monitor/force-unlock` in `admin.ts`.
- Exported `SPONSOR_MONITOR_LOCK_KEY` and `isWeekday` from `sponsorMonitorJob.ts`.
- Fixed 5 lint errors (unused `channel`, semicolons, IIFE, interface naming).

#### Phase 2 — Pipeline Failures (P0–P3)
- **P0.1:** Zombie lock auto-cleanup (delete from `job_locks` if idle)
- **P0.2:** Gap-day county normalization (treat missing snapshot as `"000000"`)
- **P0.3:** `PENDING_SYNC` auto-recovery (re-process after 30min)
- **P0.4:** First-run suppression fix (check `sponsor_canonical` row count < 1000)
- **P1.1:** Pre-flight binary check before job starts
- **P1.2:** Length-adjusted rename threshold (ratio-based instead of fixed 50 chars)
- **P1.3:** HTML-fallback pipeline block (skip URL if < 50K records)
- **P2.1:** Cache invalidation retry (3 attempts, 500ms backoff)
- **P2.2:** Notification failure alerting (> 10% failure rate)
- **P3.1:** Gap-day zero-diff sanity check
- **P3.2:** Migration 0020: `isGapDay` column on `monitor_job_runs`

#### Phase 3 — Stale-Data Risks in Display Layer (P0–P2)
- **P3.0:** Filtered `is_test` from `/api/sponsor-changes` and admin digest refresh queries (`sponsors.ts`)
- **P3.1:** Atomic `displayedOnLanding` swap wrapped in `db.transaction()` in both nightly job and admin refresh paths
- **P3.2:** Cache flush (`cacheFlushPattern("sponsors:*")`) after admin rebuild-index (`admin.ts`)
- **P3.3:** `checkDigestHealth()` in diagnostics — reports `displayedOnLandingCount`, mismatch detection, staleness
- **P3.4:** Extended `checkRedisHealth` with per-key TTL (`changesCacheTtlSeconds`, `searchIndexTtlSeconds`); added `checkSearchIndexHealth()` wrapping `getIndexHealth()`
- **P3.5 (P1):** Frontend cache staleness — reduced React Query `staleTime` on digest queries (1min) and sponsor-changes (5min), added `refetchInterval` (5min) and `refetchOnWindowFocus: true` (`LandingDigest.tsx`, `SponsorMonitor.tsx`)
- **P3.6 (P2):** HTTP Cache-Control hardening across all sponsor API endpoints — reduced `max-age` to ≤5min (was 1–12h), removed `stale-while-revalidate` where it could mask stale data

### Key Architecture Decisions
- Diagnostics lives in `sponsorMonitorDiagnostics.ts` (separate from routes) so individual check failures never 500 the endpoint.
- Phase 2 P0.1 uses `DELETE FROM job_locks` directly to avoid circular dependency.
- Phase 2 adds `isGapDay` column via migration rather than reusing `changeSummary` jsonb.
- Phase 3 P0 focuses on display layer because Phases 1+2 fixed the pipeline.
- React Query global `staleTime: Infinity` left unchanged (too wide a blast radius); overrides applied only to sponsor-specific queries.

#### Phase 4 — SSR Landing Page
- **Server-side render** for `/` route (landing page) in both dev (`setupVite`) and production (`serveStatic`).
- **`server/ssr/renderLanding.ts`** — generates rich HTML landing page (hero, stats, features, how-it-works, CTA, footer) with inline styles (no Tailwind dependency).
- **Comment marker replacement** (`<!--SSR-->...<!--/SSR-->` in `client/index.html`) for robust root content injection without regex fragility.
- **`createRoot` (not `hydrateRoot`)** — avoids hydration mismatches with complex client components (framer-motion, lazy imports, useAuth).
- SSR runs at request time → users see content immediately → React replaces on JS load.
- No new dependencies; uses existing `react-helmet-async` (already in deps) for head management if needed.

#### Phase 5 — Performance Optimization (DB, Compute, Notifications, Frontend)

**Goal:** Production-grade performance across data layer, compute pipelines, notification engine, and frontend bundle with zero breaking changes.

**Database Layer & Full-Text Search**
- `server/db.ts: max 10` (was 20), `statement_timeout 30s`, `idle_in_transaction_session_timeout 10s` — prevents pool exhaustion at 5-10 HPA replicas on Neon pooled endpoints.
- Migration `0027_trgm_perf_indexes.sql` (non-concurrent — see migrations/README.md for why `CONCURRENTLY` isn't usable under this project's `drizzle-kit migrate`): `pg_trgm` extension, GIN `idx_sc_trgm_hist` on `array_to_string(historical_names)`, `idx_sc_trgm_route`, `idx_changes_trgm_org`, `idx_changes_detected_desc`, plus name/city GIN.
- `server/routes/sponsors.ts: /sponsors/directory` refactored from `ILIKE '%…%'` SeqScan to trigram `current_name % $q` + `similarity()` ranking with `GREATEST()` fallback to ILIKE on `42883`.
- `server/utils/redisClient.ts`: ephemeral per-pod LRU (5k entries / 50MB / 5m TTL) as circuit-breaker when Redis down; read-through on `cacheGet`, write-through on `cacheSet`, `cacheFlushPattern` evicts both tiers. Cold restart mitigated by pg_trgm.
- Pagination: `GET /api/sponsor-changes?page&limit` and `GET /api/sponsors/:fp/history?page&limit` with `totalPages`; legacy 500/100 defaults preserved.

**Compute Offloading & PDF Forensics**
- `server/services/jobQueue.ts`: new `PDF_VERIFY_QUEUE='pdf-verify'` (concurrency 2, `attempts 3`, exponential 5s, `jobId=verify-${hash16}-${userId}`).
- `server/workers/pdfVerifyWorker.ts` (isolated BullMQ worker process, not `worker_threads`): `extractMetadata` + `trustedPatterns` + `COSCheck` + `combineWithCosVerdict` off main loop; progress 5→100, `emitToUser VERIFICATION_COMPLETE`.
- `server/routes/verification.ts`: streaming `createReadStream` SHA-256, `GET /api/verify/status/:jobId`, `POST /api/verify` returns `202 {jobId, status:'accepted', mode:'bullmq'}` when queued (fallback to inline `200` when Redis down or admin-override cache-hit), `req.on('close')` aborts.

**Notification Dispatch Engine**
- `server/utils/tokenBucket.ts`: Redis Lua token-bucket (`resend 2/s burst10`, `twilio 1/s burst1` per sending number, `brevo 10/s`, `webhook 5/s` per host).
- `server/utils/jitterRetry.ts`: `jitterDelay = base*2^attempt + random*1000` capped 30s, `parseRetryAfter`.
- `server/utils/notifIdempotency.ts`: `sha256(userId:changeId:channel:snapshotDate)` + Redis `SET NX EX 86400` + `Idempotency-Key` header.
- `server/services/notificationChannels/*`: email/webhook/sms/whatsapp use token-bucket, jitter 1s→30s, 3 attempts, 429 detection, idempotency guard. Webhook `retry-after` respected. Email `Resend Idempotency-Key`.
- `server/services/consolidatedNotificationEngine.ts`: batch `emails/batch` now gated by token-bucket + jitter 3×, `Idempotency-Key` per chunk, `idx_notif_log_idem` partial unique on `notif_log` (`success=true`).
- Migration `0028_notif_idempotency.sql`: `CREATE UNIQUE INDEX idx_notif_log_idem` (non-concurrent, same reason as 0027).

**Frontend Bundle & Virtualization**
- `vite.config.ts`: `manualChunks` (`vendor`, `query`, `motion`, `radix`, `three`, `charts`), `chunkSizeWarningLimit 800`.
- `client/src/pages/SponsorDirectory.tsx`: `memo(StatusBadge/StatCard)`, `useVirtualizer` (64px, overscan 8, 640px viewport) for 50-row pages.
- `client/src/pages/VerificationHistory.tsx`: `memo(VerificationCard)`, `useVirtualizer` (160px, 720px viewport), animation delay clamped to 0.3s.

#### Phase 6 — Landing Usability Audit (16 heuristics)

- **Buttons:** new `brand` variant in `ui/button.tsx` (`bg-emerald-600 hover:bg-emerald-700 rounded-full font-bold`); all landing primary CTAs migrated to it (#4, #14).
- **Type/colour/radii:** no `text-[…]` arbitraries left on landing (`text-xs` min), `lg:text-[3.4rem]` → `text-5xl`; trust-strip colour explosion removed (single `text-white/60` list); `rounded-lg` cards → `rounded-xl`, `.icon-tile` → `var(--radius)` (#1–3).
- **Typography:** long all-caps → sentence case (hero badge, digest date, sample label); short-label caps kept (#5, #9).
- **Headings:** decorative mock `h3` → `p` + `aria-hidden`; footer `h4`/`h5` → `h2` in labelled `nav`s (#10–11).
- **Grouping:** CoS link moved directly under search input; trust strip demoted to 3-item `ul[aria-label]` (#12–13).
- **Spacing/density:** revoked rows `py-4` + relaxed leading (#15); `#cos-verification` split into demo/CTA + `cos-features` sections (#16).

### Remaining (Not Yet Scoped)
- Fuse.js search index versioning for instant CDV cache bust on rebuild.
- React Query `gcTime` reduction for sponsor pages (currently default 5min).
- Consistent `stale-while-revalidate` policy across all endpoints.
- Full free history browse endpoint wiring.
- Observability dashboard UI for diagnostics.

### Relevant Files
| File | Purpose |
|------|---------|
| `server/utils/sponsorMonitorDiagnostics.ts` | Diagnostics module (11 health checks) |
| `server/utils/sponsorMonitorJob.ts` | Nightly job + lock management |
| `server/utils/redisClient.ts` | Cache flush, get/set with TTL |
| `server/utils/sponsorSearch.ts` | Fuse.js index + `getIndexHealth()` |
| `server/routes/sponsors.ts` | `/api/sponsor-changes`, admin digest refresh |
| `server/routes/sponsorPages.ts` | Public endpoints + Cache-Control headers |
| `server/routes/admin.ts` | Rebuild-index, diagnostics, force-unlock |
| `client/src/pages/SponsorMonitor.tsx` | Frontend sponsor monitor page |
| `client/src/components/LandingDigest.tsx` | Homepage digest |
| `client/src/lib/queryClient.ts` | React Query global defaults |
| `client/src/lib/queryDefaults.ts` | Standardized staleTime constants |
| `shared/schema.ts` | DB schema (sponsorChanges.isTest, dailyDigest) |
| `migrations/0020_monitor_job_runs_is_gap_day.sql` | Phase 2 migration |
| `server/ssr/renderLanding.ts` | SSR landing page generator |
| `server/vite.ts` | Dev/prod SSR wiring |
| `client/index.html` | SSR comment markers |
| `server/services/notificationChannels/` | 6 notification channels |
| `server/services/socketGateway.ts` | Socket.IO real-time gateway |
| `server/routes/pushSubscriptions.ts` | Push API endpoints |
| `migrations/0022_push_subscriptions.sql` | Push subscriptions table |
| `migrations/0023_notification_preferences_webhook.sql` | Webhook prefs columns |
| `client/src/components/HeroSection.tsx` | Landing hero, CoS section, revoked list (Phase 6) |
| `client/src/components/AnimatedBackground.tsx` | Decorative CoS mock (Phase 6) |
| `client/src/components/CosSamplePreview.tsx` | CoS demo/result preview (Phase 6) |
| `client/src/components/Footer.tsx` | Footer nav + heading outline (Phase 6) |
| `client/src/components/ui/button.tsx` | `brand` button variant (Phase 6) |
| `client/src/index.css` | `.icon-tile` radius token (Phase 6) |
