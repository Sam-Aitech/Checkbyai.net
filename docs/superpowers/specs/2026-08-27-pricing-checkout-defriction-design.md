# Pricing Consolidation & Checkout Defriction

**Date:** 2026-08-27
**Status:** Approved, ready for implementation planning

## Context

An external audit of the pricing/landing funnel raised several claims. Cross-checking against the current codebase (branch `feat/pricing-hero-conversion-redesign`) found most were already addressed or were factually wrong about the current architecture:

| Audit claim | Actual state |
|---|---|
| No programmatic SEO, sponsor DB hidden behind a paywall | False. `server/routes/seo.ts` already serves a sitemap index → `sitemap-sponsors.xml` covering ~124k sponsor pages, bot-specific meta injection per `/sponsor/:id/:slug`, schema.org markup, `robots.txt`, `llms.txt`. No work needed. |
| No free tier / PLG hook | Half true. `server/utils/tierConfig.ts` already defines a `free` tier (1 company watch, email-only, next-morning delivery) and `SponsorMonitor.tsx` already gates on it. It's just not surfaced on `Pricing.tsx` or the hero — a visibility gap, not a missing feature. Out of scope here (tracked as a separate workstream). |
| Alert-timing SLA differentiation is fake (cron runs once daily) | Partially wrong. `getDeliverAfter()` in `tierConfig.ts` genuinely enforces the same-day-6pm-vs-immediate distinction in code, it isn't just copy. Not addressed in this pass. |
| "Login to Subscribe" kills checkout momentum | **True, confirmed live** — see below. This is what this spec fixes. |
| Redundant pricing layout (annual + monthly plans both on one page, overlapping) | **True, confirmed live** — see below. This is what this spec fixes. |
| Hero is a bare pricing table | False — hero already leads with a free instant search box; pricing is already below the fold. Already fixed by prior work. |

This spec covers only the two confirmed, still-open items: **checkout friction** and **pricing layout redundancy**. Free-tier surfacing and copy/positioning are separate workstreams, intentionally out of scope.

## Problem detail

### Checkout friction

Every checkout-creating route (`/api/checkout/credits`, `/api/checkout/sign`, `/api/create-subscription` in `server/routes/billing.ts`) is gated by `isAuthenticated` and bakes `userId` into the Stripe session's `metadata`/`client_reference_id` *before* the session is created. There is no guest-checkout path in the current architecture — a Stripe session cannot be created without a resolved `userId` in hand.

This is why `Pricing.tsx` (lines ~251-291, ~293-318) redirects logged-out visitors to `/login` before they can reach Stripe: the architecture requires it today, not just the UI copy.

Auth itself is already lightweight: `/api/auth/email/send-otp` and `/api/auth/email/verify-otp` (`server/auth.ts`) implement email-OTP login (6-digit code, 10-minute expiry, session cookie on verify) — there's no password form. So the actual friction is the *navigation away* from the pricing page, not the OTP mechanic itself.

### Pricing layout redundancy

`Pricing.tsx` renders two parallel plan sets on one page, both selling the same underlying product (sponsor licence monitoring), differing in billing cadence and slightly in limits:

- **Annual** (`alert_annual` £9.99/yr — 1 company; `alert_annual_pro` £19.99/yr — 5 companies)
- **Monthly** (`notification_starter` £24.99/mo — 2 companies; `notification_pro` £49.99/mo — 5 companies)

Both stacks are visible simultaneously ("Prefer to pay monthly instead?" divider), which reads as four competing plans rather than one product with a billing choice.

## Decisions

1. **Checkout defriction: inline capture, not guest checkout.** Two approaches were considered:
   - *Guest checkout* — let Stripe collect email, resolve/create the user from `session.customer_details.email` inside the `checkout.session.completed` webhook instead of trusting pre-set `metadata.userId`. Matches the audit's literal suggestion but reworks webhook user-resolution and accepts unverified-email accounts holding paid entitlements. Rejected for this pass — too much blast radius on a payment webhook for the risk it fixes.
   - **Inline OTP capture (chosen)** — keep the existing auth requirement and webhook logic completely untouched. Replace the "Login to Subscribe" button + redirect with an inline email → OTP → auto-continue widget directly on the pricing card. No navigation away from `/pricing`. Reuses `/api/auth/email/send-otp` and `/api/auth/email/verify-otp` as-is.

2. **Pricing consolidation: toggle, not merge.** Both Stripe products stay exactly as they are (no billing.ts, tierConfig.ts, or Stripe dashboard changes) — this is a `Pricing.tsx`-only presentation fix. Collapse the page from 4 stacked cards to 2 card slots (Starter-tier, Pro-tier) with an Annual/Monthly toggle, annual selected by default. The company-count mismatch between cadences (1 vs 2 on the Starter tier) is left as-is and called out in copy rather than normalized — normalizing it is a separate product/pricing decision, not a defrictioning one.

## Design

### Components touched

- **`client/src/pages/Pricing.tsx`** — add toggle state (`'annual' | 'monthly'`), reduce to a 2-card grid keyed off the toggle, wire each card's CTA to the new inline widget for logged-out visitors.
- **New: `client/src/components/InlineEmailCheckout.tsx`** — self-contained widget with an internal state machine: `idle → email-entry → code-entry → verifying → done`. Takes the selected plan as a prop and calls the *existing* `handleSelectAnnual` / `handleSelectNotification` callbacks on successful verification.

No backend files change. No new API endpoints. No Stripe dashboard changes.

### Data flow (logged-out visitor)

1. Visitor clicks a plan CTA. `isLoggedIn` is false, so the CTA morphs in place (framer-motion height animation, consistent with existing card motion) into an email input instead of navigating to `/login`.
2. `POST /api/auth/email/send-otp` (existing route, already rate-limited via `otpLimiter` + `otpEmailLimiter`) → widget shows a 6-digit code input.
3. `POST /api/auth/email/verify-otp` (existing route) → server sets the session cookie on success.
4. Widget immediately invokes the plan's existing `onSelect` handler (`handleSelectAnnual` or `handleSelectNotification`, unchanged) → existing `/api/checkout/credits` or `/api/checkout/sign` call → Stripe redirect.

Logged-in visitors skip straight to step 4, identical to current behavior.

### Error handling

- `send-otp` failure (rate limit, email provider down): inline error message under the email field; selected plan and entered email are preserved so the visitor can retry without re-selecting.
- `verify-otp` wrong code: inline error, retry allowed up to the existing `otpLimiter` cap; no new rate-limit logic needed.
- Checkout-session creation failure after successful verify: falls through to the existing toast-based error handling already in `handleSelectAnnual`/`handleSelectNotification` — unchanged.
- Network/timeout at any step: existing loading-state reset pattern, no new handling required.
- Edge case of an email already registered via a different flow: already handled by the existing first-time-OTP-user branch in `auth.ts` (creates a `notification_preferences` row if missing) — not a new case introduced here.

### Testing

- **Unit:** `InlineEmailCheckout` state machine (idle → email → code → success), fetch mocked for both OTP endpoints.
- **Integration:** toggle switches the correct plan data source and preserves the `?company=` / `?plan=` prefill behavior `Pricing.tsx` already has.
- **E2E (Playwright):** full logged-out flow — land on `/pricing?company=X`, confirm annual is the default toggle state, select a plan, complete inline OTP, confirm redirect to Stripe. Separately confirm the logged-in skip-OTP path is unchanged (regression).
- **Visual regression:** 320/768/1024/1440 breakpoints, per this project's web testing rules.

## Out of scope (tracked separately)

- Surfacing the existing free tier on `Pricing.tsx` / hero (workstream B)
- Positioning/copy rewrite — "visa protection insurance" framing, trust badges (workstream C)
- Normalizing company-count limits across annual/monthly cadences
- Programmatic SEO — already built, no action needed
