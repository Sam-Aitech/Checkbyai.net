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

### Remaining (Not Yet Scoped)
- Fuse.js search index versioning for instant CDV cache bust on rebuild.
- React Query `gcTime` reduction for sponsor pages (currently default 5min).
- Consistent `stale-while-revalidate` policy across all endpoints.
- Full free history browse endpoint wiring.
- Observability dashboard UI for diagnostics.
- In-memory SSR digest cache (optional) — currently queries DB on every landing page load; <10ms overhead.

### Relevant Files
| File | Purpose |
|------|---------|
| `server/utils/sponsorMonitorDiagnostics.ts` | Diagnostics module (11 health checks) |
| `server/utils/sponsorMonitorJob.ts` | Nightly job + lock management |
| `server/utils/redisClient.ts` | Cache flush, get/set with TTL |
| `server/utils/sponsorSearch.ts` | Fuse.js index + `getIndexHealth()` |
| `server/routes/sponsors.ts` | `/api/sponsor-changes`, `/api/daily-digest/current` (with `lastPipelineRun`) |
| `server/routes/sponsorPages.ts` | Public endpoints + Cache-Control headers |
| `server/routes/admin.ts` | Rebuild-index, diagnostics, force-unlock |
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
| `migrations/0022_push_subscriptions.sql` | Push subscriptions table |
| `migrations/0023_notification_preferences_webhook.sql` | Webhook prefs columns |
