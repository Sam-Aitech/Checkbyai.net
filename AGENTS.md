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

<!-- ── Session Context: Sponsor Monitor Pipeline Fix (Phases 1–5) ── -->

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

#### Phase 5 — Landing Page Stale-Date Trust Fix
- **A1/A2:** Added `lastPipelineRun` field to `/api/daily-digest/current` — queries `monitor_job_runs` for the most recent `status='success'` row, so the frontend shows when the pipeline actually ran.
- **B1 (Fix 4a):** On no-change days, instead of inserting a hidden row (`displayedOnLanding=false`), the currently displayed digest's `snapshotDate` advances to today via transactional delete+update. The date marches forward even when the register is static.
- **C1:** `LandingDigest.tsx` uses `lastPipelineRun` for the "Updated" label (falls back to `snapshotDate`), so users always see the correct last-run date.
- **D1:** `renderLanding.ts` is now async — fetches the live digest from DB at render time and injects real stats (active licences, revocations, additions, updates) into the SSR HTML instead of hardcoded placeholders. Falls back to static placeholders when no data available.
- **Prod SSR:** Removed static HTML caching — renders live data on every request (async).
- **Cache strategy:** The 5-minute Redis cache on `/api/daily-digest/current` shields the DB on repeated requests; the SSR skips client-side cache entirely for the initial paint.

#### Phase 6 — SEO Content & Guide Pages
- **SEO strategy** written to `docs/SEO_STRATEGY.md` (358 lines) — keyword research (25+ targets), competitor analysis (5 competitors), content plan, technical SEO roadmap, link-building strategy, phased 180-day timeline.
- **`server/routes/guides.ts`** — SSR route engine for SEO-optimized guide pages. Renders full HTML via template + SSR markers, injects `Article` + `FAQPage` schema markup, breadcrumbs, CDN-friendly cache headers. Extensible `GUIDES` array pattern.
- **First guide:** `/guides/sponsor-licence-revoked-what-to-do` — targets "sponsor licence revoked what to do" (~1,900/mo). 2,000+ words, TL;DR box, comparison table, 5-step action plan, 6 FAQ schema items, internal links, CTA.
- **`CORE_URLS`** and `seoMetaMap` updated in `seo.ts` for bot meta injection on the guide path.
- **0 lint errors, 328 tests pass** — verified.

#### Phase 7 — Tech-Debt Refactor (Items 1–4)
- **Item 1 (routes/schema bloat):** `server/routes/admin.ts` (2433 lines, 68 endpoints) split into 7 controllers under `server/routes/admin/` (`patterns`, `verifications`, `sponsorMonitor`, `users`, `system`, `paid`, `notifications`); `admin.ts` is now a 12-line barrel preserving `registerAdminRoutes()`. `shared/schema.ts` (40 tables) split into 6 domain models under `shared/models/` (`users`, `verification`, `sponsors`, `notifications`, `billing`, `ops`); `schema.ts` is a re-export barrel so `server/db.ts` (`import * as schema`) is unaffected. Route-for-route (68/68) and export-for-export (114/114) parity verified.
- **Item 2 (sync PDF verify → async):** `POST /api/verify` is now a job producer returning `202 { jobId, statusUrl }`. New `VERIFICATION_JOB` queue + `server/workers/verificationWorker.ts` (concurrency 2) run `PDFAnalyzer`/`COSAuthenticityChecker` out-of-band; shared analysis extracted to `server/services/verificationAnalysis.ts`. Progress via Socket.IO `verify:progress` (`user:{id}` room) + `GET /api/verify/job/:jobId` poll fallback. Admin-override fast path stays sync; `?sync=1` and Redis-down inline fallback preserved; credit/daily-limit deduction moved into the worker transaction (exactly-once). Frontend (`FileUpload.tsx`, `FileUploadSimple.tsx`, `lib/api.ts`) polls via new `lib/verifyJob.ts`, handling both 200 (sync) and 202 (async) shapes.
- **Item 3 (duplicate notification engines):** Finding misnamed the duplicate — `consolidatedNotificationEngine.ts` never existed. Real duplication was `services/notificationEngine.ts` (`notifyUsersOfEvent`, production path) vs `utils/notificationDispatcher.ts` (`notifyAffectedUsers`, admin-test-only path) with divergent rate limits (3/hr Redis vs 10/day DB) and audit tables (`notif_log` vs `notification_log`). Admin test endpoint now dispatches through `notifyUsersOfEvent`; `notifyAffectedUsers` kept but deprecated. `sendViaResend` retained (still used by state machine + monitoring).
- **Item 4 (registry indexes):** `pg_trgm` + GIN on `current_name`/`town_city` (0003) and compounds (0014) already existed; proposed `(licence_status, rating_tier, last_updated_at)` rejected (columns don't exist — actual: `status`, `type_rating`, no `last_updated_at`). New `migrations/0024_sponsor_directory_route_trgm.sql`: GIN trigram on `route` (only directory filter with zero index coverage) + partial btree on `removed_at` for the directory-stats aggregation.
- **Verify:** 0 new type errors (5 pre-existing client-only), 328 tests pass, lint 261 errors byte-identical to baseline `admin.ts` (relocated verbatim, zero new).

#### Phase 8 — Optimisation Verification Programme (Proofs 1–7)
Code + automated evidence complete; live-environment transcripts still required — see `docs/perf-evidence/README.md` (do not mark complete until all boxes ticked).
- **Proof 1 (processes):** `server/worker.ts` standalone PDF-worker entrypoint; `PROCESS_ROLE=api|worker|all` split in `jobQueue.ts`/`index.ts`; `dist/worker.js` via multi-entry esbuild; compose `worker:` service (`3g/2.0 CPUs`) vs `app:` (`1g/1.0`).
- **Proof 2 (storage):** `server/services/documentStore.ts` (local + S3-compatible drivers, `DOCUMENT_STORE_DRIVER`); jobs carry `documentKey` only; worker/inline paths materialize-then-cleanup; boot-time orphan purge; `@aws-sdk/client-s3` added. **P0 fixes:** retry-safe lifecycle (temp always cleaned, key deleted on success or exhausted attempts only — `verificationWorker.test.ts` 4 tests); compose shared `documents-data:/app/uploads` volume + `UPLOADS_SHARED=true`, worker/API boot refusal via `validateDocumentStoreConfig()` on invalid split config; **production store is Cloudflare R2** (optional `S3_SSE`, R2 bucket policy in `.env.example` + `02-storage-proof.md`).
- **Proof 3 (load):** `server/utils/perfMonitor.ts` (per-route p50/p95/p99, event-loop delay, heap, queue wait/service) surfaced at `GET /metrics/perf`; zero-dep `scripts/load/verify-load.mjs` writes `load-<label>-*.json`.
- **Proof 4 (DB):** `scripts/db/explain-sponsors.sh` captures `EXPLAIN (ANALYZE, BUFFERS)` for the 4 real sponsor query shapes before/after 0024.
- **Proof 5 (correctness):** Redis job index (`verify:job:{id}`) + `evicted` tombstone in `GET /api/verify/job/:jobId`; `verifyJobs.test.ts` covers eviction + double-upload isolation.
- **Proof 6 (failure mode):** Redis-down `POST /api/verify` now `503` (no inline CPU burn, stored doc deleted, `Retry-After: 30`); `?sync=1` gated behind `ALLOW_SYNC_VERIFY`; covered by tests.
- **Proof 7 (frontend):** visualizer (`ANALYZE=true`), `scripts/frontend/bundle-budget.mjs` CI gate (passes: 576.9 KB total gzip), web-vitals beacon → `POST /api/rum` → perf snapshot, virtualized `SponsorDirectory` results, `lighthouserc.cjs` + weekly/dispatch LHCI workflow. **P1 fixes:** `useWindowVirtualizer` with measured `scrollMargin` (the `getScrollElement: () => null` revision never attached scroll observers — fixed pre-release) + `journey4-directory-virtualization` Playwright spec; CI triggers widened to `opencode/**` so branch pushes produce evidence.
- **Verify:** 339 tests pass (incl. 5 verify-job + 2 RUM + 4 worker-lifecycle), 0 new type errors, `perf:budget` green, all new proof files lint-clean (repo total still 261, byte-identical to baseline).

### Remaining (Not Yet Scoped)
- Fuse.js search index versioning for instant CDV cache bust on rebuild.
- React Query `gcTime` reduction for sponsor pages (currently default 5min).
- Consistent `stale-while-revalidate` policy across all endpoints.
- Full free history browse endpoint wiring.
- Observability dashboard UI for diagnostics.
- In-memory SSR digest cache (optional) — currently queries DB on every landing page load; <10ms overhead.
- Remaining guide pages (14+ scheduled), FAQ page, free tool pages, blog section.

### Relevant Files
| File | Purpose |
|------|---------|
| `server/utils/sponsorMonitorDiagnostics.ts` | Diagnostics module (11 health checks) |
| `server/utils/sponsorMonitorJob.ts` | Nightly job + lock management |
| `server/utils/redisClient.ts` | Cache flush, get/set with TTL |
| `server/utils/sponsorSearch.ts` | Fuse.js index + `getIndexHealth()` |
| `server/routes/sponsors.ts` | `/api/sponsor-changes`, `/api/daily-digest/current` (with `lastPipelineRun`) |
| `server/routes/sponsorPages.ts` | Public endpoints + Cache-Control headers |
| `server/routes/admin.ts` | Barrel delegating to `server/routes/admin/` controllers (patterns, verifications, sponsorMonitor, users, system, paid, notifications) |
| `server/routes/verification.ts` | Async `POST /api/verify` (202 producer) + `GET /api/verify/job/:jobId` status |
| `server/services/verificationAnalysis.ts` | Shared PDF forensic analysis (worker + inline fallback) |
| `server/workers/verificationWorker.ts` | BullMQ `VERIFICATION_JOB` consumer (concurrency 2) |
| `server/services/jobQueue.ts` | Queue registry (`VERIFICATION_JOB`, `getVerificationQueue()`) |
| `server/utils/notificationDispatcher.ts` | Deprecated `notifyAffectedUsers`; canonical path is `notifyUsersOfEvent` |
| `shared/models/` | Domain schema models (users, verification, sponsors, notifications, billing, ops) |
| `client/src/pages/SponsorMonitor.tsx` | Frontend sponsor monitor page |
| `client/src/components/LandingDigest.tsx` | Homepage digest |
| `client/src/lib/queryClient.ts` | React Query global defaults |
| `client/src/lib/queryDefaults.ts` | Standardized staleTime constants |
| `client/src/components/LandingDigest.tsx` | `/api/daily-digest/current` consumer — displays `lastPipelineRun` as "Updated" label |
| `shared/schema.ts` | DB schema (sponsorChanges.isTest, dailyDigest) |
| `migrations/0020_monitor_job_runs_is_gap_day.sql` | Phase 2 migration |
| `server/ssr/renderLanding.ts` | SSR landing page generator (async, fetches live digest from DB) |
| `server/vite.ts` | Dev/prod SSR wiring |
| `client/index.html` | SSR comment markers |
| `server/services/notificationChannels/` | 6 notification channels |
| `server/services/socketGateway.ts` | Socket.IO real-time gateway |
| `server/routes/pushSubscriptions.ts` | Push API endpoints |
| `server/routes/guides.ts` | SEO guide rendering engine |
| `docs/SEO_STRATEGY.md` | Full SEO strategy — keyword targets, content plan, timeline |
| `migrations/0022_push_subscriptions.sql` | Push subscriptions table |
| `migrations/0023_notification_preferences_webhook.sql` | Webhook prefs columns |
| `migrations/0024_sponsor_directory_route_trgm.sql` | GIN trigram on `route`, partial btree on `removed_at` |
| `server/worker.ts` | Standalone PDF-worker entrypoint (`PROCESS_ROLE=worker`) |
| `server/services/documentStore.ts` | Durable document store (local + S3-compatible, key-based handoff) |
| `server/utils/perfMonitor.ts` | Latency/event-loop/heap/queue/RUM reservoirs + `GET /metrics/perf` |
| `server/routes/rum.ts` | Web-vitals beacon sink (`POST /api/rum`) |
| `scripts/load/verify-load.mjs` | Zero-dep load runner writing `load-<label>-*.json` |
| `scripts/db/explain-sponsors.sh` | EXPLAIN before/after harness for the 4 sponsor query shapes |
| `scripts/frontend/bundle-budget.mjs` | CI gzip-budget guard (wired into `ci.yml` build job) |
| `docs/perf-evidence/` | Proof index + 7 runbook/evidence docs (sign-off gate) |
| `lighthouserc.cjs` + `lighthouse.yml` | LHCI lab audits (dispatch + weekly, CLS error gate) |
