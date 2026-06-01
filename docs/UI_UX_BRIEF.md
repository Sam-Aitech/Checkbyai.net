# UI/UX Brief
# checkbyai.net
**Version:** 1.0 | **Status:** Live | **Last Updated:** 2026-06-01

---

## 1. Product UX Principles

1. **Clarity over density:** show critical compliance risk status first.
2. **Trust and transparency:** explain outcomes and confidence signals clearly.
3. **Actionability:** every key result state should present a next action.
4. **Consistency:** shared interaction patterns across Sponsor Monitor and COS Check.
5. **Operational resilience:** surface recoverable errors with clear user guidance.

---

## 2. IA and Navigation Model

| Area | Purpose | Primary User Type |
|---|---|---|
| Public marketing/auth | Product education and entry into authenticated experience | Visitor |
| Sponsor Monitor | Search sponsors, manage watches, view status and alerts | Authenticated user |
| COS Check | Upload document, run analysis, review findings | Authenticated user |
| Account/billing/preferences | Manage identity, subscription, notification channels | Authenticated user |
| Admin/operations | Monitor jobs, incidents, and platform operational state | Admin/operator |

Navigation model should prioritize product separation (Sponsor Monitor vs COS Check) with a stable account/settings surface and role-gated admin access.

---

## 3. Screen Inventory and Priority

| Priority | Screen Group | Notes |
|---|---|---|
| P0 | Authentication and session recovery | Required for all protected workflows |
| P0 | Sponsor search + watch management | Core compliance-monitoring workflow |
| P0 | COS upload + result summary | Core document-verification workflow |
| P1 | Notification preferences and delivery settings | Required for effective alerting |
| P1 | Billing/subscription management | Required for entitlement and conversion |
| P1 | Admin run status + incident views | Required for operational control |
| P2 | Historical trend/reporting extensions | Nice-to-have once P0/P1 are stable |

---

## 4. Interaction and Validation Patterns

### 4.1 Interaction Patterns
- Use explicit loading, success, and failure states for all async actions.
- Preserve context on failures (do not clear user input on recoverable errors).
- Use progressive disclosure for advanced/technical details.

### 4.2 Validation and Error Patterns
- Validate input client-side for immediate feedback and server-side for authority.
- Present error messages in plain language, with technical detail only where useful.
- Use consistent error envelopes aligned with [API_REFERENCE.md](API_REFERENCE.md#10-error-response-format).

### 4.3 Accessibility Baseline
- Keyboard navigable primary workflows (auth, watch management, COS submission).
- Semantic labels and readable status text for assistive technologies.
- Color is not the sole status signal; pair with iconography/text.

---

## 5. Content Tone and Messaging

- Tone: professional, calm, and compliance-focused.
- Avoid alarmist language; communicate risk with factual precision.
- For critical states (e.g., sponsor removed/revoked), use clear urgency and next-step guidance.
- Keep legal/compliance phrasing consistent with product and security documentation.

---

## 6. Mobile and Responsive Expectations

- P0 workflows (auth, sponsor search/watch, COS submission/results) must be fully usable on mobile.
- Navigation must collapse without hiding critical actions.
- Tables/lists should use responsive patterns (stacked rows, horizontal scroll with sticky labels where needed).
- Forms should minimize required typing and support touch-friendly controls.

---

## 7. Cross-Document References

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

## 8. Governance

| Field | Value |
|---|---|
| Owner | Product Design + Product Manager |
| Review Cadence | Monthly and before major UI release milestones |
| Update Rule | If any linked source doc changes UX-relevant flows, requirements, or constraints, update this UI/UX Brief in the same PR |

