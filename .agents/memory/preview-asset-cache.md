---
name: Preview asset cache
description: Distinguish cached Replit Preview assets from actual Vite development routing.
---

When a Replit Preview route shows a blank page with MIME errors for hashed `/assets/*` files after a workflow restart, first fetch the route directly and confirm that development HTML references `/src/main.tsx`. A fresh Vite response can be healthy even while the preview browser retains an older built shell.

**Why:** Preview browser state can outlive the workflow process and report stale production asset failures that are not present in the current development server response.

**How to apply:** Check the fresh route response and workflow logs before changing SPA fallback or lazy-route code; use a cache-busting reload or a newly queried route when validating the preview.