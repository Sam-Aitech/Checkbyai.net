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
