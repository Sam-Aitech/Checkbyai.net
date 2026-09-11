# UI/UX Brief
# checkbyai.net
**Version:** 2.0 | **Status:** Live | **Last Updated:** 2026-09-11

---

## 1. Product UX Principles

1. **Protection first:** show clearance status before counts; every screen answers "Am I safe?" before "What can I do?"
2. **Trust and transparency:** explain outcomes and confidence signals clearly; every technical detail has a "What does this mean?" plain-language disclosure.
3. **Actionability:** every key result state presents one obvious next action; no empty states without a primary CTA.
4. **Consistency:** shared interaction patterns (bottom nav, alert bell, protection status) across Monitor, Verify, and Account.
5. **Operational resilience:** surface recoverable errors with clear user guidance; never leave the user wondering whether their data is safe.
6. **Microcopy policy:** outcome-oriented language; reserve uppercase for small metadata/status indicators; avoid alarmist phrasing.

---

## 2. IA and Navigation Model

| Area | Purpose | Primary User Type |
|---|---|---|
| Public marketing/auth | Product education and entry into authenticated experience | Visitor |
| **Dashboard** (overview/monitor/verify/alerts/your checks/support) | Paid user daily view — protection status, attention, sponsors, activity | Paid user |
| **Monitor** | Manage watched sponsors, view changes, add sponsors | Paid user |
| **Verify** | Upload & verify CoS documents, view result history | Paid user |
| **Alerts** | Configure and view alert channels and events | Paid user |
| **Your checks** | View verification history as a decision timeline | Paid user |
| **Account** | Profile, plan & usage, billing, security, support | Paid user |
| Admin/operations | Monitor jobs, incidents, and platform operational state | Admin/operator |

**Navigation model:** Dashboard uses persistent bottom nav on mobile (Home/Monitor/Verify/Alerts) and fixed sidebar on desktop; sub-routes (`/pro-dashboard/monitor`, `/pro-dashboard/verify`, etc.) are deep-linkable, refresh-safe, and browser-back friendly.

---

## 3. Screen Inventory and Priority

| Priority | Screen Group | Notes |
|---|---|---|
| P0 | Authentication and session recovery | Required for all protected workflows; OTP cooldown, session expiry, login required states |
| P0 | **Protection Status** (dashboard overview) | Clear/Attention/Critical with CTAs; replaces counts-first approach |
| P0 | **Checkout Activation** (payment success) | Receipt UI, entitlement card, `[Protect your first sponsor]` CTA, no automatic redirect |
| P0 | **Sponsor search + watch management** | Core compliance-monitoring workflow; outcome cards with `Last checked`, `What changed`, `What does this mean?` |
| P0 | **COS verification result** (3-tier: verified/review/failed) + confidence + `[What does this mean?]` | Replaces dense metadata-above-conclusion layout |
| P1 | Notification preferences and delivery settings | Simplified 3-group UI (licence/rating/route + delivery) with Advanced disclosure |
| P1 | **Billing/subscription management** | Plan/Usage card (sponsors used/limit, checks remaining), `[Upgrade capacity]` at 100% |
| P1 | Dashboard sub-routes (deep-linkable, refresh-safe) | `/pro-dashboard/monitor`, `/pro-dashboard/verify`, etc. |
| P1 | Trust indicators (last-checked timestamps, stale-data banners) | Every important monitoring surface exposes freshness info |
| P1 | Account page (Profile/Plan&usage/Billing/Security/Support) | Frontend-only summary from `useAuth` + `/api/credits` + watch count |
| P2 | Historical trend/reporting extensions | Nice-to-have once P0/P1 are stable |

---

## 4. Interaction and Validation Patterns

- Use explicit loading, success, and failure states for all async actions.
- Preserve context on failures (do not clear user input on recoverable errors).
- Use progressive disclosure for advanced/technical details (e.g., `What does this mean?` disclosures).
- **Motion diet:** framer-motion reserved for drawer/dialog/success transitions; per-card/list/item motion removed; `prefers-reduced-motion` honored throughout.
- **Layout mirroring:** loading skeletons mirror final layout structure, preventing layout shifts.

### 4.2 Validation and Error Patterns

- Validate input client-side for immediate feedback and server-side for authority.
- Present error messages in plain language, with technical detail only where useful; always include `what happened + whether data is safe + what to do next`.
- Use consistent error envelopes aligned with `API_REFERENCE.md#10-error-response-format`.

### 4.3 Accessibility Baseline

- Keyboard navigable primary workflows (auth, watch management, COS submission).
- Semantic labels and readable status text for assistive technologies.
- Color is not the sole status signal; pair with iconography/text.
- 44px+ touch targets; `aria-label` on icon buttons; `aria-hidden` on decorative SVGs.
- Focus trap on drawer/dialog; escape-to-close; focus returns to trigger after close.

### 4.4 OTP and Auth Patterns

- 6-digit code with paste support and automatic verification.
- Resend cooldown displayed (`Resend in Ns`); disabled state prevents double-resend.
- Email preserved across step re-runs; Turnstile optional but present.

---

## 5. Content Tone and Messaging

- Tone: professional, calm, and compliance-focused.
- **Outcome-oriented microcopy:** "Protect this sponsor" vs "Monitor Sponsor"; "What changed" vs "Recent Changes"; "Alerts" vs "Notifications"; "Your checks" vs "Verification History"; "Your plan" vs "Subscription Status"; "Checks remaining" vs "Verification Limit".
- Avoid alarmist language; communicate risk with factual precision.
- For critical states (e.g., sponsor revoked), use clear urgency and next-step guidance.
- Keep legal/compliance phrasing consistent with product and security documentation.

---

## 6. Mobile and Responsive Expectations

- P0 workflows (auth, protection status, sponsor search/watch, COS submission/results) must be fully usable on mobile.
- **Bottom nav primary destinations** (Home/Monitor/Verify/Alerts) with 44–48px targets; safe-area bottom padding; `aria-current` on active item.
- Navigation collapses without hiding critical actions; drawer remains as fallback.
- Tables/lists use responsive patterns (stacked rows, horizontal scroll with sticky labels where needed).
- Forms minimize required typing and support touch-friendly controls.

---

## 6. Cross-Document References

- [PRD.md](PRD.md)
- [TRD.md](TRD.md)
- [APP_FLOW.md](APP_FLOW.md)
- [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md)
- [DATA_MODEL.md](DATA_MODEL.md)
- [API_REFERENCE.md](API_REFERENCE.md)
- [SECURITY.md](SECURITY.md)
- [ENTERPRISE_EXECUTION_PLAN.md](ENTERPRISE_EXECUTION_PLAN.md)
- [EXECUTION_PHASES_0_8.md](EXECUTION_PHASES_0_8.md)

---

## 7. Governance

| Field | Value |
|---|---|
| Owner | Product Design + Product Manager |
| Review Cadence | Monthly and before major UI release milestones |
| Update Rule | If any linked source doc changes UX-relevant flows, requirements, or constraints, update this UI/UX Brief in the same PR |