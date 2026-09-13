---
name: Development preview framing
description: Replit Preview requires development responses to permit iframe embedding.
---

Replit Preview renders the development app inside an iframe. Do not emit `X-Frame-Options: DENY` or CSP `frame-ancestors 'none'` in development; keep both protections enabled in production.

**Why:** The server can be healthy, return HTTP 200, and render in direct screenshots while the user's Preview remains blank because the browser blocks iframe embedding.

**How to apply:** When changing Helmet or other response-security middleware, verify development response headers permit framing and production headers continue to deny it.