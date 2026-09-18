---
name: CoS entitlement boundaries
description: Durable product rules for keeping Sponsor Monitor subscriptions separate from CoS verification access and allowance.
---

Sponsor Monitor subscription tiers and CoS verification entitlement are separate product concepts. A Pro Sponsor Monitor subscription alone must not grant CoS checks. Customer CoS checks and human-review details require a paid CoS subscription, qualifying enterprise/unlimited grant, or purchased CoS credits. Admins and explicit admin limits remain operational bypasses.

**Why:** Mixing the Sponsor Monitor tier with CoS allowance caused the admin panel and customer dashboard to disagree, while daily free access exposed a paid human-review value proposition without requiring payment.

**How to apply:** Any backend gate, usage counter, API response, or customer-facing count for CoS checks should use the shared CoS entitlement contract. Do not let approval flags or default daily allowances grant customer access; redact human-review reasons from unpaid result and history responses.

The product named “Unlimited Monthly” is a £99.99 one-time CoS purchase despite its legacy name. Checkout mode must follow the Stripe price type rather than infer recurrence from this package name.

**Why:** The live Stripe price is non-recurring and the pricing page explicitly promises no recurring charge; forcing subscription mode prevents Checkout from opening for that price.

**How to apply:** Create CoS Checkout Sessions from the selected, server-validated Stripe price. Use payment mode for one-time prices and subscription mode only for recurring prices.