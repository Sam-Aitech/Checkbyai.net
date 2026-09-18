---
name: Stripe customer migration
description: How checkout should handle saved Stripe customers after changing account or mode.
---

When switching between Stripe Sandbox/Test and Live mode, or between Stripe accounts, treat saved customer IDs as potentially stale. Checkout must verify the saved customer exists in the active Stripe account and create and persist a replacement when Stripe reports it missing or deleted.

**Why:** Stripe customer IDs are scoped to an account and mode. Reusing a saved Sandbox customer with a Live key causes checkout-session creation to fail with “No such customer.”

**How to apply:** Apply this recovery only to missing-resource or deleted-customer responses. Surface unrelated Stripe failures rather than silently creating duplicate customers.