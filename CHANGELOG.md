# Changelog

All notable changes to CheckByAI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Changed
- **Pricing restructure — annual alert passes + pay-per-use CoS checks**: Added `alert_annual` (£9.99/yr, 1 company), `alert_annual_pro` (£19.99/yr, up to 5 companies), and `cos_check_single` (£4.99, one-time) packageTypes end to end through `server/routes/billing.ts` (webhook grant, `/api/checkout/verify`, `/api/checkout/credits`). New Stripe products created and tagged with `metadata.packageType` so `/api/packages` resolves their price IDs at runtime, no hardcoded Payment Links needed for these three. Existing monthly Notification Engine (Starter/Pro) and CoS credit plans (`starter`/`pro`/`unlimited`) kept unchanged for existing subscribers, no grandfathering migration. Annual passes are modeled as a 12-month Stripe subscription with `cancel_at` set via a follow-up `stripe.subscriptions.update()` call (Checkout's `subscription_data` has no `cancel_at` field), so the existing `customer.subscription.deleted` webhook auto-downgrades the user to `free` at expiry without a new cron job. `CosPricing.tsx` restructured: Master Package (human review) folded into a new Enterprise contact-sales card, `cos_check_single` added as the primary pay-per-use option, Unlimited/Starter/Pro repositioned as secondary.
- **Freemium tier unblocked**: `POST /api/watches` (`server/routes/sponsors.ts`) no longer hard-rejects free-tier users with a 403; `tierConfig.ts`'s `free` tier (`watchLimit: 1`) is now the real gate. `free.channels` changed from `[]` to `['email']` so the free tier's "1 company + email alerts" is real rather than a UI-only claim. `server/auth.ts`'s email-OTP `verify-otp` handler now also auto-provisions a `notification_preferences` row (previously only created via the Settings UI, which free users never reach), closing a gap where a free-tier watch would never actually deliver an email alert. Unauthenticated watch-add now routes through the existing Turnstile-gated email-OTP login flow (`/login?redirect=...`) instead of a dead-end `/pricing` redirect, and auto-completes the watch-add on return.
- **Hero and landing-page redesign** (`client/src/components/HeroSection.tsx`, `client/src/pages/SponsorMonitor.tsx`): replaced urgency-driven copy ("Your Sponsor Was Revoked Last Night. Nobody Told You.", "You Will Only Know... After It Is Too Late") with authoritative framing consistent with a compliance-monitoring product. Collapsed three competing hero CTAs (search / verify-document / buy-alerts) into one primary search box with an "also alert me" toggle. Added a step-by-step CoS verification preview (`CosSamplePreview.tsx`) using real check names sourced from `cosAuthenticityChecker.ts` rather than fabricated ones. Added a visible "not affiliated with the UK Home Office" disclaimer near both primary CTA surfaces, previously only in the FAQ accordion and footer. Homepage SEO title/description (`home.tsx`) updated to match the reworked tone, previously still read "Is Your UK Sponsor Licence Safe? / Don't get caught out" after the on-page copy had already changed.
- **Trust-indicator scaffolding added, content deliberately deferred**: hero trust strip and footer gained slots for company registration number and ICO registration, sourced from a single `client/src/lib/companyDetails.ts` file. Real values are not fabricated; both surfaces hide each field (and the whole footer column) while its value is `null` rather than rendering placeholder text.
- **Route Layer Refactoring (Phases 1-7)**: All route files migrated from inline Express handler pattern to a modular architecture with separation of concerns:
  - `server/lib/` — Shared utilities: `errorHandler.ts` (`asyncHandler`), `response.ts` (`success`/`fail`), `validate.ts` (`validateBody`), `apiError.ts`
  - `server/validation/` — Zod schemas per route domain: `auth.ts`, `billing.ts`, `verification.ts`
  - `server/services/` — Business logic services: `authService.ts` (register, login, password reset), `subscriptionService.ts` (plan management), `verificationService.ts` (file analysis pipeline)
  - `server/repositories/` — Data access layer (reserved for future use)
  - `server/storage.ts` — Consolidated storage layer extracting inline DB queries from routes: added `createPaidSubmission()`, `getPaidSubmission()`, `updateVerificationFeedback()`, `getUser()`, `getUserByEmail()`, `checkDailyLimit()`, `getUserNotifPrefs()`, `updateUserNotifPrefs()`
  - All 10 route files refactored: `auth.ts`, `billing.ts`, `enrichment.ts`, `health.ts`, `notifications.ts`, `sponsorPages.ts`, `sponsors.ts`, `stats.ts`, `verification.ts`, `admin.ts`
  - All routes use `asyncHandler` for automatic error forwarding to Express error middleware
  - `fail()`/`success()` response helpers replace inline `res.status().json()` patterns

- **Backend Patterns Audit — Logging migration**: All `console.log`/`console.error`/`console.warn` calls (~369 across 47 files) migrated to the structured Pino logger (`server/utils/logger.ts`). Error objects passed as `{ err }` context for structured log aggregation.
- **Backend Patterns Audit — Column projections**: Added explicit column projections to hot-path Drizzle ORM queries:
  - `settingsRepository.getSystemSetting()` — projects only `{ value }` (called on every verification)
  - `sponsors.ts` full-scan watch creation query — projects 4 of 13 `sponsorCanonical` columns
  - `sponsors.ts` watch ownership/status checks — projects only `id`, `userId`, `isActive`
  - `sponsors.ts` history/changes enrichment — projects only display columns
- **Documentation accuracy pass**: Corrected claims that did not match the code. `README.md` listed SMS as Twilio and email as "Resend / Brevo" — SMS is Brevo, WhatsApp is Twilio, and email is Resend with a SendGrid fallback that was documented nowhere; it also described `backend/` as an Express API server (it is a Python FastAPI sidecar), advertised API access as a shipped Unlimited/Enterprise feature (no public or partner API exists), and omitted the mandatory `npm run setup:binaries` step. `TEST_RESULTS.md` was headed "ALL TESTS PASSED / PRODUCTION READY" for what was a static code inspection with zero tests executed, citing file locations that had since moved; it is now titled as a code review, states plainly that no automated tests cover the feedback system, and points at current paths. `DEPLOYMENT.md` still said "Docker (Coming Soon)" despite a working `Dockerfile` and `docker-compose.yml`. `DEVELOPMENT.md` cited two test files that do not exist and never mentioned the Playwright suite, its mandatory `TEST_BASE_URL`, or that the suite is smoke-level and not wired into CI. `GOOGLE_OAUTH_SETUP.md` hardcoded a single dead Replit redirect URI. Removed the last fabricated `99.8%` accuracy literal (`backend/main.py`), which now reports a completion rate computed from actual verification counts.
- **Backend Patterns Audit — RBAC unification**: Legacy `isAdmin` guard (hard-coded `role === 'admin'` check in `auth.ts`) replaced with `requireRole("admin")` from the 6-level `roleGuard.ts` hierarchy. Applied across `admin.ts` (62 usages), `sponsors.ts`, `support.ts`, and `monitoringService.ts`.


### Fixed
- **Landing-page usability audit (16 heuristics)**: consolidated the five competing emerald/blue button styles into a single `brand` variant (`client/src/components/ui/button.tsx`), so Search, Get Alerts, Verify a Document, Set Up Alerts and Start Monitoring Now share one action colour; removed all sub-12px landing copy (`text-[8/9/10/11px]` → `text-xs`/`text-sm`) and the `lg:text-[3.4rem]` one-off; dropped long all-caps runs (hero badge, digest date, sample-result label) to sentence case, keeping uppercase only for short labels; fixed the H1→H3 skip (decorative CoS mock `h3` → `p` + `aria-hidden`) and the footer H2→H4/H5 skip (`h4`/`h5` → `h2` in `nav`-labelled groups); moved the "verify a CoS document instead?" link directly beneath the search input; demoted the hero trust strip from five glossy pills to a plain three-item list; fixed cramped revoked-list rows (`py-4`, relaxed leading); split `#cos-verification` into a demo/CTA section plus a separate "Built for compliance and privacy" features section. No e2e selectors depend on the changed markup; `eslint` clean on all touched files.
- **BILL-001 follow-up — Pro Package display price still said £49.99 after the link was already fixed**: BILL-001 repointed the CoS "Pro Package" Payment Link to charge the correct £39.99, but `CosPricing.tsx`'s plan card, description, SEO schema, and `server/scripts/seedProducts.ts`'s seed data still displayed £49.99 (and described it as a `/month` subscription with an "annual billing" discount). Live Stripe data confirms the actual price is £39.99 one-time. Corrected the display copy and seed script to match; no further Stripe change needed.
- **CoS Starter/Pro/Unlimited packages described as monthly subscriptions that were never real**: live Stripe Payment Links for all three are one-time payments (`subscription_data: null` on the Payment Link, `recurring: null` on the price), but app copy said "/month", "billed annually (20% off)", and "Cancel anytime", and `seedProducts.ts` specified `recurring: {interval: 'month'}` for all three — if that script were ever re-run, it would create prices diverging from what's actually live. Copy and seed script now describe them as one-time, credits-never-expire purchases. No Stripe change (would risk affecting the billing terms of existing purchasers).
- **Live `[PENDING]` placeholder text visible to real visitors**: the hero trust strip and footer "Company Details" block rendered literal `Company No. [PENDING]` / `ICO Registration: [PENDING]` text pending real business data. `client/src/lib/companyDetails.ts` fields are now `null` until supplied; both surfaces hide each field (and the whole footer column, avoiding an empty grid cell) rather than rendering broken-looking placeholder text.
- **Em-dash used as a stylistic connector throughout reworked landing-page copy**: replaced with periods, commas, or parentheses across `HeroSection.tsx`, `SponsorMonitor.tsx`, `Pricing.tsx`, `CosPricing.tsx`, `AlertAddOnModal.tsx`, `CosSamplePreview.tsx`, and billing notification emails (`billing.ts`) for tone consistency with the rest of the reworked copy.
- **API-001 (Critical) — Response envelope ignored by raw `fetch` consumers**: Every route wraps its payload as `{ success, data }` (`server/lib/response.ts`), and React Query's `getQueryFn` unwraps it — but ~8 components calling `fetch`/`apiRequest` directly read fields off the envelope instead of `.data`, so every field was `undefined`. Effects: `FileUploadSimple` rendered *every* verification as "FAKE at 0% confidence" (`typeMapping[undefined] || 'fake'`); the receipt page, anonymous sponsor search, billing-portal button and admin stats all read blank; and both Stripe checkout paths sent `client_reference_id=undefined`, so paid checkouts arrived with no attribution. All raw consumers now unwrap with `envelope?.data ?? envelope`.
- **BILL-001 (Critical) — Wrong Stripe Payment Links on the CoS pricing page**: `CosPricing.tsx` reused the Sponsor Licence Monitor Payment Links for its own `starter`/`pro` plans. The CoS "Pro Package" advertised £39.99 but the link charged £49.99 — a real overcharge, and the plan granted depended on the signed `client_reference_id` rather than what Stripe billed. Repointed to the correct product links; `unlimited`/`master` verified against the Stripe dashboard and unchanged.
- **BILL-002 — Stripe webhook could reject with an unhandled promise**: `POST /api/stripe-webhook` was not wrapped in `asyncHandler` and its event `switch` had no `catch`, so a DB failure mid-handler produced an unhandled rejection and no response — Stripe retried blind against a handler that would fail identically. The switch is now wrapped; failures log with `eventType`/`eventId` and return 500 so Stripe's retry is meaningful.
- **BILL-003 — `GET /api/stripe/publishable-key` 500s on any non-Replit host**: The handler read Replit connector env vars exclusively, breaking exactly the Railway/Docker deployments `DEPLOYMENT.md` recommends. Now reads `STRIPE_PUBLISHABLE_KEY` first and falls back to the connector only when it is absent. Added to `.env.example`.
- **OPS-001 — Health endpoints turned DB outages into unhandled rejections**: `/api/health` and `/api/health/sponsor-monitor` were bare `async` handlers, so a database failure crashed the request instead of returning an error response — the endpoints uptime monitors poll were the ones that failed hardest under the outage they exist to report. Both wrapped in `asyncHandler`.
- **PERF-001 — `GET /api/watches` loaded the entire sponsor table into memory**: When any watch lacked a fingerprint the handler read all ~140k `sponsor_canonical` rows to resolve it in JS. Now prefilters in SQL. The prefilter matches a single normalized *token* against `regexp_replace(lower(current_name), '[^a-z0-9_ ]', '', 'g')` — matching the whole normalized name would be incorrect, since `normalizeName()` deletes characters and "Smith & Jones Ltd" normalizes to `smith jones`, which is not a substring of the raw name. Invariant covered by `server/utils/__tests__/namePrefilter.test.ts`.
- **COS-003 — Verdict override was one-directional**: A `GENUINE` cosCheck verdict overrode a disagreeing pattern analysis and forced confidence to ≥85, but the reciprocal case was silently discarded — an `EDITED` verdict against a `genuine` pattern result kept the `genuine` verdict. `EDITED` now downgrades to `suspicious` and caps confidence at 50, leaving the document for human review rather than passing it.
- **UI-001 — `ApiError` carried no error code, making two access-denied screens dead code**: `FileUploadSimple` branched on `errorData.code === 'cos_access_denied' | 'beta_login_required'`, but `ApiError` had no `code` field and the error handler never emitted one, so neither branch could ever run and every denial fell through to a bare error toast. Added `code` to `ApiError`/`errorHandler`, tagged both 403 sites in `verification.ts`, and split the client screen into distinct **Log In** (anonymous) and **Upgrade** (no entitlement) states.
- **UI-002 — Inert controls**: "Watch Demo" called `startDemo()`, which advanced the animation state but never set `showDemo`, so `Enhanced3DDemo`'s `isVisible` could not flip and the modal never opened. "Upgrade Now" in the free-check overlay had no handler at all; it now links to `/cos-pricing`. The Google login button existed but was never imported anywhere — wired into `login.tsx` behind a new `GET /api/auth/providers` check so it appears only when Google OAuth is configured.
- **UI-003 — Client search reported a fabricated match score**: `HeroSection`'s client-side index computed a real relevance score to rank hits, then discarded it and emitted a hardcoded `matchScore: 100` for every result, so the "% match" badge was meaningless. Now maps the computed rank (prefix vs. substring) to 100/60.
- **DB-001 — Migration history could not rebuild the database**: `migrations/meta/_journal.json` was missing entirely, so `npm run db:migrate` was inert and Drizzle had never tracked which of `0001`–`0023` ran; 23 of 40 tables (`sponsor_canonical`, `job_locks`, `daily_digest`, `paid_submissions`, …) had no `CREATE TABLE` in any migration; `0003` put `CREATE INDEX CONCURRENTLY` inside an explicit transaction (invalid in PostgreSQL, fails wholesale); and `0011`/`0017` contradicted `shared/schema.ts`. Production only worked because boot-time DDL in `server/index.ts` patched the drift. Added a generated `0024_catchup.sql` (34 `CREATE TABLE`, 90 indexes, 24 `ADD COLUMN`, 22 FK constraints — no `DROP`/`TRUNCATE`) plus a journal covering `0000` and `0024`; `0001`–`0023` are retained as history but excluded. See `migrations/README.md` for the production cutover, which still requires seeding `__drizzle_migrations` and has **not** been run.
- **SCRIPT-001 — Broken utility scripts**: `clear-lock.ts` terminated PostgreSQL advisory-lock holders, but the job moved to a table-backed lock (`job_locks`) and nothing acquires that advisory lock any more; it also wrote camelCase columns (`"errorMessage"`, `"completedAt"`) that do not exist. Rewritten against `job_locks` with correct snake_case columns. `db-check.ts` selected `csvArchive.createdAt` (the column is `downloadedAt`). `check-count.ts` and `create-admin.ts` crashed without a `dotenv` preload.
- **COS-001 (Critical) — Genuine Certificates of Sponsorship classified as Fake**: A chain of four defects caused every verification to return `fake` once any admin had marked a single document fake. Root cause was an XMP parsing defect: `parseXMPWithRegex()` matched only bare text nodes, but Dublin Core wraps `dc:date` in an `rdf:Seq` and `dc:language` in an `rdf:Bag`, which is exactly what Apache FOP — the UK Home Office CoS generator — emits. Genuine documents therefore reported "missing dc:date, dc:language", an admin reasonably read that as tampering and flagged a genuine CoS, and the fake-override handler auto-created a permanent `hitl-override` rule. Fixes:
  - `pdfAnalyzer.dcFieldPatterns()` reads Dublin Core values from `rdf:Seq` / `rdf:Bag` / `rdf:Alt` containers as well as bare text nodes
  - Removed the blanket `rule.category === 'hitl-override'` relevance clause, under which every rule of that category applied to every document ever verified
  - Rule relevance matching routed through `mentions()`, which rejects match keys under 4 characters — `'anything'.includes('')` is always true, so a document with an unextractable Producer previously matched every rule at once
  - Injected admin and HITL checks downgraded from `critical` to `warning`. Admin knowledge is advisory and can downgrade a result to Suspicious, but only forensic checks can classify a document as Fake
  - HITL producer matching compares the full producer string rather than the `normalizeProducer()` family, which collapsed every Apache FOP release to one identifier and so implicated the entire legitimate CoS population
  - `COSAuthenticityChecker` incremental-update detection accounts for linearized ("fast web view") PDFs, which carry two `startxref` tokens by design and were counted as re-saved
- **COS-002 — Unverifiable documents passed as genuine**: `verifyWithRules()` treated absent metadata as evidence of authenticity. A PDF with no readable Producer, or one whose metadata extraction failed outright, scored 100 and returned `genuine`. Both now raise a warning and land on `suspicious` for human review.
- **SEC-001 (Critical) — Path traversal on file upload endpoints**: Three endpoints (`/api/admin/extract-metadata`, `/api/admin/trusted-patterns`, `/api/verify`) used `req.file.path` directly without sanitization, allowing path traversal via crafted filenames. Created `server/utils/uploadGuard.ts` with `sanitizeUploadPath()` that resolves paths relative to the uploads directory and rejects traversal attempts.
- **SEC-002 — HMAC secret fallback chain**: `hmacSecret` in billing.ts fell back through multiple env vars (`CHECKOUT_HMAC_SECRET` → `STRIPE_WEBHOOK_SECRET` → `secret`), leaking which env vars are set to an attacker who can provoke an error. Now requires `CHECKOUT_HMAC_SECRET` unconditionally.
- **SEC-003 — Timing-safe cron secret comparison**: `/api/ops/cron-ping` used string comparison (`!==`) against the cron secret, vulnerable to timing attacks. Replaced with `crypto.timingSafeEqual`.
- **SEC-004 — Timing-safe OTP comparison**: Two OTP verification code paths in `auth.ts` used string comparison (`!==`). Replaced both with `crypto.timingSafeEqual`.
- **SEC-005/006 — X-Forwarded-For IP spoofing**: `getClientIp()` in `ipRateLimit.ts` parsed the `X-Forwarded-For` header directly, allowing an attacker to spoof their IP and bypass rate limits. Now uses `req.ip` (trusted proxy chain) exclusively.
- **SEC-008/009 — Paid submissions IDOR**: `POST /api/paid/submit/:submissionId` and `GET /api/paid/status/:submissionId` lacked ownership checks, allowing any authenticated user to submit documents to or read the status of another user's submission. Added `userId` column to `paid_submissions` table, stored at creation time, with ownership guard checks in both endpoints.
- **SEC-030 — PDF uploads validated by content, not just client-supplied MIME type**: `upload.single('file')`'s `fileFilter` only checked `file.mimetype`, a header the client sets and can spoof — a non-PDF payload with a forged mimetype would reach `PDFAnalyzer` unvalidated. Added `assertPdfMagicBytes()` to `uploadGuard.ts`, which reads the first 5 bytes on disk and requires the literal `%PDF-` signature. Applied to all three upload endpoints: `/api/verify`, `/api/admin/extract-metadata`, `/api/admin/trusted-patterns`.
- **SEC-031 — OTP requests only rate-limited per IP, not per target email**: `otpLimiter` on `/api/auth/email/send-otp` and `/api/auth/admin/send-otp` capped requests per caller IP (5 / 15 min), but a caller distributed across many IPs — or behind a shared NAT/proxy — could send unlimited OTP emails to one target address. Added `otpEmailLimiter`, keyed on the target email in the request body (case-insensitive), applied to both endpoints alongside the existing IP limiter.
- **SEC-032 — Bare `console.*` calls replaced with structured logger**: `admin.ts`, `consolidatedNotificationEngine.ts`, and `sponsorEtlClient.ts` had 12 `console.log`/`console.warn`/`console.error` calls that bypassed the structured logger and its redaction/formatting. Replaced with `logger` calls carrying structured fields.

### Added
- **`GET /api/auth/providers`**: Reports which optional auth providers are configured (currently `{ google: boolean }`) so the login page can show or hide the Google button instead of offering a route that is not registered.
- **Name-prefilter invariant tests**: `server/utils/__tests__/namePrefilter.test.ts` (20 tests) pins the property the `/api/watches` SQL prefilter depends on — that a normalized token always survives contiguously in the SQL-stripped name — across real-world punctuation (`&`, straight and curly apostrophes, hyphens, parentheses), non-ASCII names, mid-string company suffixes, and 500 generated combinations. Includes an explicit regression guard against the naive whole-name prefilter, which silently dropped 11 of 17 real-world sample names. Exported `namePrefilterToken()` and `stripToSqlComparable()` from `sponsorListFetcher.ts` so the tested code is the code that runs.
- **PDF magic-byte and OTP per-email rate-limit tests**: `server/utils/__tests__/uploadGuard.test.ts` gains 5 tests for `assertPdfMagicBytes()` (valid header, spoofed content, empty file, truncated file, header not at offset 0). New `server/middleware/__tests__/otpEmailLimiter.test.ts` covers per-email limiting, independence across emails from the same IP, case-insensitivity, and the IP-keyed fallback when no email is present.
- **CoS verdict regression suite**: `server/services/__tests__/cosVerification.test.ts` (end-to-end — writes real PDFs to a temp uploads directory and runs the full `extractMetadata` → `COSAuthenticityChecker` chain) and `cosVerdict.test.ts` (verdict assembly and admin rule injection), with shared fixtures in `__tests__/fixtures/cosFixtures.ts` modelling genuine, linearized, and incrementally-updated Apache FOP documents. Covers COS-001/COS-002 plus guard cases pinning the fraud detection that must keep working: Photoshop producers, inverted dates, true re-saves, absent XMP, and genuinely missing DC fields.
- **`POST /api/feedback` extracted to dedicated route**: Moved from `/api/admin` catch-all to `server/routes/feedback.ts` with its own rate limiter (3 req / 15 min) for better isolation and observability.
- **Soft-delete for verification logs**: `verification_results` now has a `deleted_at` column. `deleteVerificationLog()` uses `UPDATE ... SET deleted_at = now()` instead of `DELETE`. All 13 read queries filter with `deleted_at IS NULL`.

### Sprint 2 Fixes
- **SEC-011 — `SESSION_SECRET` null check**: Replaced `process.env.SESSION_SECRET!` with explicit null check that throws at startup if missing.
- **SEC-013 — HSTS preload**: Changed HSTS header from `max-age=31536000; includeSubDomains` to `max-age=63072000; includeSubDomains; preload` (2-year max-age + preload for HSTS preload list eligibility).
- **SEC-016 — Redis-backed phone OTP store**: Replaced in-memory `Map` with Redis SET + TTL via `server/utils/phoneOtpStore.ts`. Graceful in-memory fallback when Redis is unavailable. Eliminates OTP loss on server restart and enables horizontal scaling.
- **SEC-017 — Rate limit on `/api/stripe/publishable-key`**: Added `rateLimit({ windowMs: 60s, max: 10 })` to prevent enumeration abuse.
- **SEC-018 — System settings allowed-keys validation**: Added `ALLOWED_SYSTEM_SETTINGS = ['defaultDailyLimit', 'notifications_paused']` whitelist to `PATCH /api/admin/system-settings/:key` — rejects unknown keys with 400.
- **SEC-019 — Full UUID for admin user IDs**: Replaced `crypto.randomUUID().slice(0, 8)` with full `crypto.randomUUID()` to eliminate collision risk.

### Sprint 3 Fixes
- **SEC-021 — Inline migrations replaced with Drizzle migration files**: Removed 200+ lines of inline SQL from `index.ts`. Schema migrations now live in `migrations/` directory (0016, 0017) and run via `npm run db:migrate` (CI/CD only). `applyPendingMigrations()` replaced with `applyDataFixbacks()` for one-time data backfills only.
- **SEC-022 — Removed fabricated `suspiciousToday` stat**: The `suspiciousToday` field in `getStats()` was a duplicate query with a fabricated multiplier (`* 0.15`). Removed from `StatsResponse` type, `getStats()` implementation, and `api-types.ts`.
- **SEC-023 — Sanitized adminFeedback in LLM prompts**: Added `sanitizeForPrompt()` that strips `< >` backticks and `{}` from admin feedback before injection into LLM system prompts. Applied to all 3 usage sites.
- **SEC-024 — Compression filter skips `/api/auth` routes**: Auth responses (OTP, session cookies) no longer compressed — reduces attack surface for BREACH-style attacks.
- **SEC-025 — `generateDocumentHash` made async**: Replaced `fs.readFileSync` with `fs.promises.readFile` to avoid blocking the event loop during file hashing.
- **SEC-026 — Normalized IP cooldown to 1-day**: `ipRateLimit.ts` used 7-day cooldown while `verification.ts` used 1-day. Both now consistently use 1-day.
- **SEC-027 — `APP_URL` env var with Replit fallback**: Google OAuth callback URL now uses `APP_URL` as primary, `REPLIT_DOMAINS` as fallback, with startup warning if both missing.
- **SEC-028 — Atomic session claim via `tryClaimSession()`**: Replaced check-then-mark race condition with single `INSERT ... ON CONFLICT DO NOTHING RETURNING id` — only one webhook handler can claim a session.
- **SEC-029 — `user_id` column on sessions table**: Added `user_id` varchar column with index to `sessions` table for efficient user-based session queries and invalidation.

### Sprint 4 Quality Fixes
- **QA-001 — `package.json` name → `checkbyai`**: Updated project name from placeholder to `checkbyai` for package registry consistency.
- **QA-003 — `ADVISORY_LOCK_KEY` extracted to `server/constants.ts`**: Moved the advisory lock key constant out of the migration block into a dedicated constants module for reuse.
- **QA-004 — `getStats` queries parallelized**: Wrapped 4 independent DB queries in `Promise.all` for ~3× latency reduction on the admin stats endpoint.
- **QA-005 — `is_test` column on `sponsorChanges`**: Added `is_test` boolean column to `sponsorChanges` table for filtering test data from production change feeds. Migration `0018`.
- **QA-007 — Email/brand fix**: Changed `CoS Verify UK <reports@cosverify.uk>` to `CheckByAI <reports@checkbyai.net>` in admin email sender.
- **QA-008 — Dockerfile `npm prune --omit=dev`**: Added `npm prune --omit=dev` after `npm ci` in multi-stage Docker build to remove dev dependencies from the production image (~40% image size reduction).
- **QA-009 — `.dockerignore` add `uploads/`**: Excluded the runtime uploads directory from Docker build context to reduce image size and prevent stale files.
- **QA-011 — Turnstile CAPTCHA on `/api/auth/admin/send-otp`**: Added Cloudflare Turnstile verification to the admin OTP endpoint. Requires `turnstileToken` in request body. Gated behind `TURNSTILE_SECRET_KEY` env var — skips verification if unconfigured.
- **QA-013 — `cleanupExpiredOtps` already removed**: The function was removed in Sprint 2 when OTP storage moved to Redis with built-in TTL (SEC-016). No further action needed.
- **QA-014 — `parseIntParam()` helper**: Created `server/utils/parseParam.ts` with a `parseIntParam()` utility that safely parses URL parameters and returns `null` for invalid inputs.
- **QA-015 — Stripe apiVersion typing**: Removed `as any` cast on `apiVersion: "2025-11-17.clover"` — TypeScript now correctly validates the version string.
- **QA-017 — Cloudflare challenges in CSP**: Added `https://challenges.cloudflare.com` to `frame-src` and `script-src` in the Content-Security-Policy header to allow Turnstile CAPTCHA to render and execute.
- **QA-018 — User-fetch retry on invoice webhook**: Wrapped `storage.getUserByStripeCustomerId()` in `withRetry()` for the `invoice.payment_succeeded` webhook handler to handle transient DB failures.
- **QA-019 — `hasOwnProperty` guard on `notifPrefs` merge**: Added `Object.prototype.hasOwnProperty.call(DEFAULT_NOTIF_PREFS, k)` check before merging notification preference patches to prevent prototype pollution.
- **QA-020 — Redis requirepass**: Added `redis-server --requirepass ${REDIS_PASSWORD:-redis}` to docker-compose.yml, with password passed to `redis-cli ping` in healthcheck.

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
