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

#### Phase 6 — Frontend Craft Audit Remediation (P0+P1)

**Scope:** P0+P1 visual defects from ruthless frontend audit; global pill buttons; SSR→CSS-var migration.

- `server/ssr/renderLanding.ts`: all hardcoded hex (`#2563eb/#6b7280/#1f2937/#f9fafb/#e5e7eb/#2563eb10`) → `var(--primary/foreground/muted/muted-foreground/border/card/primary-foreground)`; `1280px/2rem` → `80rem/1.5rem` to match client `max-w-7xl px-6`; CTAs `0.75rem` → pill `999px`; step tiles use `var(--muted)` + `0.5rem` radius.
- Containers: `NightlyStatsBar` `-mt-16` removed, `max-w-5xl px-4` → `max-w-7xl px-6 md:px-8`; `RecentlyRevokedSection` wrapped in shared `max-w-7xl px-6 md:px-8` with inner `max-w-4xl` preserved for readability; `PageLayout` nav `px-6 sm:px-8 lg:px-12` → `px-6 md:px-8`; logo `h-10 sm:h-12` → `h-10` (no nav jump).
- Type/contrast: status badges `text-[11px]/text-[10px] font-bold tracking-wide` → `text-xs font-semibold tracking-[0.08em]` (`SponsorMonitor.tsx` 6×, `SponsorDirectory.tsx` 7×); `text-muted-foreground/70` timestamp → solid `text-xs`; `badge-live` `#10b981→#047857`, `11px→12px`; mobile menu labels `/50` → solid; `Submit.tsx` dead `text-sm+text-lg` conflict + `emerald-600→700` fixed; `home.tsx` dead `text-2xl font-bold` removed (editorial class owns size).
- Components: `home.tsx` fake spinner → border spinner; modal spring → `0.2s [0.16,1,0.3,1]` tween; close `w-8 rounded-xl` → `w-11 rounded-full`; result badge `transition-all 300` → scoped `200ms`; `ui/button.tsx` global `rounded-md→rounded-full` (`h-10 px-5 / h-9 px-4 / h-12 px-8`), scoped transition + `active:scale-[0.98]`; `ui/input.tsx` `rounded-full px-4`, `placeholder/60`, `min-h-[44px]`; `FeatureCard` tile `w-16 rounded-2xl` → `w-12 rounded-[8px]`; revoked rows `px-5 py-3.5` → `px-4 py-3`; skeletons `h-14 rounded-xl` → `h-[56px] rounded-[8px]`.
- Motion: `FeatureCard` stagger capped `min(index*0.06,0.18)`; `theme-card`/`icon-tile`/`otp-box` transitions use `cubic-bezier(0.16,1,0.3,1)` scoped properties (never `all`/`ease`); `icon-tile` gains `:focus-visible` parity; `float` reduced to `translateY(-6px)` `6s` (was `-20px` + `180deg` spin); OTP `2px/10px` → `1px/8px` + two-ring focus; mobile 44px media-query hack narrowed to non-button elements.
- Verify: `eslint` clean on all 10 touched files. Full `npm run lint` has 732 pre-existing backend errors (untouched). `tsc` fails pre-existing missing `@react-three/fiber`/`vite/client` types. `vitest` unrunnable (no `node_modules` in worktree).

#### Phase 7 — Full Frontend Visual-System Remediation (audit of 82089bb)

**Scope:** Re-audited 82089bb (30 findings: 12 fixed, 14 open, 2 regressed, 2 N/A); implemented complete system below. Verified with headless Chromium (390/1280px, no overflow), computed WCAG ratios, `lint` 0 errors, `tsc` clean, 475 tests pass, `vite build` OK.

- Tokens (`index.css`): surfaces, text, borders, status (+bg) light/dark, hero fg/secondary/tertiary/placeholder, radii (control 8/card 12/panel 16/hero 24/pill), motion (120/180/260ms + `[0.16,1,0.3,1]`), containers (75/60/45rem + `px-6 md:px-8`), type roles, `.st-soft-*` badges, `.hero-*` utilities, `.dash-*` dashboard primitives, icon gradient vars. Deleted dead: `pulse-glow`, `shimmer`, `urgency-dot`, `glass-card`.
- Contrast (measured): hero tokens 5.8–17:1 vs gradient; muted 5.12:1; emerald/red/blue-600+ and amber-700 white-text ≥4.8:1; placeholders solid (muted/hero-tertiary). Footer overlay deepened (`to-black/50`) + hero tokens.
- Hero: H1 → `type-display` (no leading override); search gets `focus-visible:ring-white`, `aria-label`, `role=status` loaders; switch `scale-90` removed, 44px label, visible ring; chips → AA shades + `text-xs`; trust tiles static (no fake hover); AnimatedBackground shapes deleted, 12 particles, static doc shadow.
- Components: `theme-card` static / `theme-card-interactive` (NavigationLinks); buttons semantic (default+lg pill, base control, sm compact); CardTitle `leading-tight`; inputs/select/textarea control radius + solid placeholders; OTP slots scoped + 8px; progress width-only; tabs trigger nested-radius 4px; toast transform+opacity; accordion/content scoped; sidebar rail scoped; chart dots pill.
- Badges: solid `-700/-600` whites + `st-soft-*` tinted (Pro/Intel/Admin); `unknown` neutral never resembles `active`; icons + text (never color-alone); `aria-hidden` on decorative icons.
- Dashboards: T hexes → status vars; StatusPill/licence maps → `st-soft` classes; ~120 inline patterns → `dash-*`/Tailwind; `borderRadius:99→999`; data-driven geometry kept inline (virtualizers, widths, state colors); dead `glowCardStyle`/`inputStyle` removed.
- SSR: `shared/landingCopy.ts` shared by client + server; section order mirrors client (nav/hero/check/why/how/cos/revoked/footer); gradient wrapper + static search form + trust (invented 99.9% stats grid removed); mobile nav hides secondary links ≤640px.
- Login: single BrandLogo (2 dup imgs removed), modal tween, input follows system radius.
- Motion policy: scoped properties only, ≤260ms routine, springs for spatial entrances only, one ambient language per viewport, reduced-motion intact.
- Remaining (documented exceptions): radix-internal `rounded-md` geometry; admin-internal dark tint badges; illustration mock micro-type (`AnimatedBackground` doc, UK-flag spec colors); gradient display text (`text-gradient-*`); `leading-none` on icon-paired micro-glyphs; 26px stat display + fixed avatar/skeleton dims; footer/hero share hero tokens by design.

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
