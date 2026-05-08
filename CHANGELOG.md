# Changelog

All notable changes to CheckByAI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned
- Docker containerization
- PostgreSQL Row Level Security (RLS) policies
- Webhook delivery for Enterprise tier

---

## [1.0.5] — 2026-05-08

### Fixed
- **SponsorMonitorJob — Phase E rename detection caused nightly crash (critical)**: `detectRenames()` in `sponsorStateMachine.ts` was updating the `fingerprint` primary key of the old GRACE_PERIOD row to the new candidate fingerprint. Because Phase C had already inserted a NEWLY_GRANTED row with that fingerprint, this produced a unique constraint violation that crashed the job every night a rename was detected. Fixed by updating the NEWLY_GRANTED record (`candidate.fp`) with merged historical name data and the original `grantedAt`, then deleting the superseded GRACE_PERIOD record (`oldFP`) — no PK mutation required.
- **SponsorMonitorJob — no automatic recovery after midnight crash**: If the server restarted after 00:30 UTC (e.g., OOM from 140k-record processing), `checkAndTriggerIfNeeded()` only fired via `setInterval` — up to 60 minutes later. Admins had to manually trigger or restart the server. Added a `setTimeout(5 min)` startup catchup in `registerRoutes()` that calls `checkAndTriggerIfNeeded(true)` so the job self-recovers within 5 minutes of boot with no admin action.
- **SponsorMonitorJob — `hour < 1` guard blocked midnight-hour recovery**: After a midnight crash+restart, the guard `if (hour < 1) return` inside `checkAndTriggerIfNeeded()` prevented triggering until 01:00 UTC, compounding the delay. Startup calls now bypass this guard and only yield during the exact cron execution window (00:20–00:45 UTC) to avoid racing with an actively running cron.
- **SponsorMonitorJob — `onConflictDoUpdate` overwrote original trigger source**: When a failed cron run was retried via "startup-catchup", the success audit log in `monitor_job_runs` overwrote the original `source` field ("cron") with the retry source — making it look like the cron never ran. Removed `source` from the `onConflictDoUpdate` SET clause so the first-written trigger source is preserved.
- **`sponsor_watches` table missing from migrations**: The `sponsor_watches` table was defined in `shared/schema.ts` but had no corresponding migration SQL file, meaning the table did not exist in production. Added `migrations/0015_sponsor_watches.sql`. Without this, `notifyReactivationWatchers()` was silently failing on every run.

### Added
- **`GET /api/health/sponsor-monitor`**: New dedicated health endpoint returning `{ status, running, lastRun: { date, success, hoursAgo, ... }, nextCronUtc }`. Status is `"ok"` (ran within 48h and succeeded), `"stale"` (failed or too old), `"running"` (job in progress), or `"unknown"` (no data). Useful for uptime monitors and admin dashboards.
- **`checkAndTriggerIfNeeded(startup?: boolean)`**: New `startup` parameter on the trigger-check function. When `true`, bypasses the 1-hour per-process throttle and the broad midnight-hour guard, and uses source `"startup-catchup"` for observability.

---

## [1.0.4] — 2026-05-03

### Fixed
- **SponsorMonitor — ProofBar data inconsistency (QA #5)**: `ProofBar` was showing hardcoded values (`47,823 active sponsors`, `3 downgraded, 1 revoked`, `04:32 AM GMT`) while `LandingDigest` below it showed real API data — creating a factual contradiction visible to users. Replaced all three stat slots with `useQuery<DigestSummary>({ queryKey: ["/api/daily-digest/current"] })`. Renders `Skeleton` while loading and `"—"` when data is unavailable. React Query deduplicates the request with `LandingDigest`, so no additional network calls are made
- **LandingDigest — Live Data badge had no timestamp (QA #6)**: "Live Data" badge was CSS-only with no indication of data freshness. Added a `"Updated {formattedDate}"` caption directly below the badge (e.g. "Updated Sunday, 3 May 2025") in `text-[10px] text-muted-foreground`
- **SponsorMonitor — "View Recent Changes" link styling (QA #7)**: "View Recent Changes" previously used an `underline` class which clashed with the dark `bg-slate-900` bar. Replaced with an `inline-flex` anchor using `text-emerald-400 font-medium hover:text-emerald-300 transition-colors` and an `ArrowRight` icon from lucide-react
- **SponsorMonitor — StickyAlertBanner hardcoded content**: Banner showed hardcoded `"3 sponsor licences revoked in the last 48 hours. Last alert sent 14 minutes ago to 847 subscribers."` regardless of live data. Replaced with `useQuery<DigestSummary>` against the already-cached `/api/daily-digest/current` endpoint. Banner now: (a) hides entirely when `counts.removed === 0` to avoid false urgency, (b) shows the real revocation count and snapshot date, (c) drops the fabricated subscriber count
- **SponsorMonitor — SocialProof hardcoded content**: "Recent alert" box showed a fabricated event (`TechSolutions Ltd, 14 Jan at 00:33 AM, downgraded A→B-Rating`). Replaced with `useQuery<SponsorChange[]>({ queryKey: ["/api/sponsor-changes"] })` which picks the most recent REMOVED, REMOVED_REVOKED, or DOWNGRADED event and renders it with real organisation name, change type, and detected date. The box hides when there are no qualifying changes in the 7-day feed. The testimonial quote card below it is unchanged

---

## [1.0.3] — 2026-05-02

### Fixed
- **Nav — self-referential CTA**: "Get Alerts" button in the shared nav (desktop + mobile) is now hidden when the user is already on `/pricing`, eliminating the redundant self-link
- **Nav — Verify CoS URL mismatch**: "Verify CoS" nav link previously pointed to `/dashboard`; corrected to `/verify-cos`. Added `/verify-cos` as an alias route in `App.tsx` (renders `DashboardPage`)
- **SponsorMonitor — rogue custom nav/footer**: `SponsorMonitor.tsx` was rendering its own bespoke `<nav>` and `<footer>` (bypassing the shared `PageLayout`), causing nav inconsistency across pages — different links, no Monitor dropdown, no Resources section

### Changed
- **`PageLayout.tsx`**: Added `darkNav?: boolean` prop. When `true`, the sticky nav renders with a `bg-slate-950/95 border-slate-800` dark-slate palette, swaps the logo to `<BrandLogo variant="dark" />`, and switches all desktop links, dropdowns, hamburger, mobile menu, section headers, dividers, and Sign In CTA to dark-aware colour classes (`text-slate-300/text-white` palette)
- **`PageLayout.tsx` — `NavDropdown`**: Added `dark?: boolean` prop; button and active-state colours respond to dark mode
- **`SponsorMonitor.tsx`**: Replaced `<PageLayout hideNav hideFooter>` with `<PageLayout darkNav>`. Removed ~30-line custom inline `<nav>` block and ~12-line custom inline `<footer>` block. Removed unused `BrandLogo` import. The page now uses the full shared nav (Monitor dropdown, Verify CoS, Pricing, Resources) in dark styling and the shared gradient footer

---

## [1.0.2] — 2026-05-01

### Fixed
- **Sponsor register page**: Replaced vague "Could not load the register" error with a user-safe message and a **Try again** retry button (`SponsorLicenceSearch.tsx`)
- **Loading UX**: Replaced spinning loader with an 8-row skeleton placeholder for better perceived performance
- **Trust proxy**: Added `app.set('trust proxy', 1)` so `req.ip` resolves correctly behind Nginx / cloud load balancers (previously returned `undefined`, breaking rate limiter key generation)
- **Rate limiter IP fallback**: Changed fallback IP from empty string to `"127.0.0.1"` so in-process rate limiters function when `req.ip` is not set
- **Null-safe subscription status**: Fixed `TypeError` crash in `personalizedRateLimiter` when `req.user.subscriptionStatus` is `null`
- **Startup integrity check**: Added `sponsor_canonical` row count check on server boot — emits `warn` if the table is empty with remediation instructions for ops

### Changed
- **`sponsorListFetcher.ts`**: Removed all deprecated functions with no active callers — `storeSnapshot`, `getLatestSnapshotDate`, `cleanupOldSnapshots`, `downloadAndParseSponsorList`, `downloadAndStreamSponsorList` — along with the `InitProgressCallback` type. These all targeted the retired `sponsor_list` table
- **`sponsorListFetcher.ts`**: Removed unused imports: `db`, `sponsorList`, `eq`, `desc`, `lt`
- **Rate limiter store**: Added TODO comment to wire Redis-backed store for shared counters across pods (Phase-2)
- **`@mendable/firecrawl-js`**: Installed missing optional dependency listed in `package.json` (fixes TypeScript compile error)

---

## [1.0.2] — 2026-04-07

### Fixed
- **Proxy-aware IP handling**: Enabled `trust proxy` in Express so `req.ip` resolves correctly behind Nginx/load balancers
- **Startup integrity guard**: Added startup check for `sponsor_canonical` row count with explicit warning when the register is empty
- **Rate limiter null safety**: Fixed `subscriptionStatus` checks to avoid runtime `TypeError` when status is null
- **Rate limiter fallback key**: Replaced empty-string IP fallback with `127.0.0.1` for safer limiter key generation
- **Sponsors page error UX**: Replaced internal-style error copy with user-safe messaging and added a one-click retry action
- **Sponsors page loading UX**: Replaced spinner-only loading with multi-row skeleton placeholders for better perceived performance

### Changed
- **Legacy sponsor ingestion cleanup**: Removed deprecated `storeSnapshot`, `getLatestSnapshotDate`, and `cleanupOldSnapshots` functions
- **Retired table references removed**: Removed stale `sponsorList` usage and related unused imports from `sponsorListFetcher.ts`

---

## [1.0.1] — 2026-04-06

### Fixed
- **Free tier notifications**: Corrected configuration to send email-only next-morning alerts (previously no notifications)
- **Notification dispatcher**: Fixed syntax errors in channel dispatch logic to ensure proper tier-based channel enforcement

---

## [1.0.0] — 2026-03-27

### Added
- **Sponsor Licence Monitor** — real-time monitoring of the UK Home Office Register of Licensed Sponsors
  - 4-state reconciliation engine (`NEWLY_GRANTED`, `ACTIVE`, `GRACE_PERIOD`, `REMOVED_REVOKED`)
  - 7 alertable change types (removal, downgrade, upgrade, route change, name change, new licence)
  - Multi-channel notifications: email, WhatsApp, SMS per subscription tier
  - Immediate alerts for Pro/Unlimited/Enterprise; same-day for Starter; daily digest for Free
  - Fuzzy search (Fuse.js) across 124,000+ UK sponsors
  - Sponsor history view for all watched companies
  - Companies House intelligence enrichment (Pro+)
  - Job alerts weekly digest (Pro+)
- **COS Check** — forensic PDF analysis for Certificate of Sponsorship documents
  - Metadata extraction: producer, creator, creation/modification dates, fonts, XMP edit history
  - Detection of tampering software (Photoshop, GIMP, Canva, Inkscape, LibreOffice Draw)
  - AI scoring via OpenAI → Claude → DeepSeek fallback chain (confidence 0–100)
  - Tamper-proof receipt with SHA-256 document hash and integrity hash
  - Human-in-the-loop admin override
  - Expert Review packages (normal £19.99 / full £49.99, 24h SLA)
  - Closed beta gate via `cosCheckApproved` per user
- **Authentication**
  - Email OTP (6-digit, 10-minute expiry, Cloudflare Turnstile CAPTCHA)
  - Google OAuth 2.0 (Passport.js)
  - Admin OTP-only access with role enforcement
  - Session backed by PostgreSQL (`connect-pg-simple`)
- **Subscription tiers**: Free, Starter (£24.99/mo), Pro (£49.99/mo), Unlimited (£99.99/mo), Enterprise
- **Stripe integration** — subscriptions, webhooks, HMAC-signed checkout sessions
- **Phone number encryption** — AES-256-GCM at application layer
- **Rate limiting** — per-IP limits on OTP, search, file upload, and admin endpoints
- **Real-time updates** — Socket.io for live sponsor change notifications
- **Daily cron pipeline** — 5-phase sponsor monitor running 00:30 UTC Mon–Fri
  - Phase 1: CSV discovery + qsv validation
  - Phase 2: csvdiff fingerprinted diffing
  - Phase 3: 4-state machine reconciliation
  - Phase 4: multi-channel notification dispatch
  - Phase 5: AI headline generation + job run audit
- **Admin panel** — user management, sponsor monitor controls, COS pattern management, AI rules
- **SEO** — sitemap, canonical tags, structured data, Open Graph

### Security
- Parameterized queries only (Drizzle ORM — no raw SQL concatenation)
- `express.urlencoded({ extended: false })` — prototype pollution prevention
- `httpOnly` + `secure` + `sameSite: lax` session cookies
- multer 2.1.0 — patched 2 HIGH CVEs (DoS via malformed multipart)
- File upload isolation — OS temp dir, deleted immediately after analysis
- Content-Security-Policy headers

### Infrastructure
- **GitHub Actions CI** — type-check, test, build on every PR
- **GitHub Actions Security** — CodeQL SAST, TruffleHog secret scan, weekly npm audit
- **GitHub Actions Release** — automated releases on version tags
- MIT License

---

## Versioning Guide

| Change type | Version bump | Example |
|-------------|-------------|---------|
| Bug fix, security patch | Patch `x.x.N` | 1.0.0 → 1.0.1 |
| New feature, backward-compatible | Minor `x.N.0` | 1.0.0 → 1.1.0 |
| Breaking change | Major `N.0.0` | 1.0.0 → 2.0.0 |

[Unreleased]: https://github.com/Sam-Aitech/Checkbyai.net/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Sam-Aitech/Checkbyai.net/releases/tag/v1.0.0
