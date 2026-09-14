---
name: CoS entitlement boundaries
description: Durable product rules for keeping Sponsor Monitor subscriptions separate from CoS verification access and allowance.
---

Sponsor Monitor subscription tiers and CoS verification entitlement are separate product concepts. A Pro Sponsor Monitor subscription alone must not grant unlimited CoS checks. CoS access can instead come from explicit admin approval or limits, CoS subscriptions, qualifying enterprise/unlimited grants, or purchased CoS credits.

**Why:** Mixing the Sponsor Monitor tier with CoS allowance caused the admin panel and customer dashboard to disagree, and risked changing one product when administering the other.

**How to apply:** Any backend gate, usage counter, API response, or customer-facing count for CoS checks should use the shared CoS entitlement contract. Preserve purchased credits, finite admin limits, daily allowances, and unlimited grants as distinct sources.