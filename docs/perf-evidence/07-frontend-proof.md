# Proof 7 — Bundle output + Lighthouse/Core Web Vitals before/after

## What changed
- `vite.config.ts`: `rollup-plugin-visualizer` gated on `ANALYZE=true`
  (`npm run build:analyze` → `dist/stats.html`, gitignored treemap).
- `scripts/frontend/bundle-budget.mjs` (new, zero-dep): gzip-size caps
  enforced in CI (`Bundle budget guard` step in `ci.yml`, `npm run
  perf:budget`): total JS ≤ 700 KB gzip, entry chunk ≤ 150 KB gzip, no
  chunk > 550 KB raw (except the lazy three.js demo, allowlisted).
- `client/src/lib/webVitals.ts` (new) + mounted in `main.tsx`: samples 20%
  of page views, beacons CLS/INP/FCP/LCP/TTFB to `POST /api/rum`.
- `server/routes/rum.ts` (new, registered in `routes.ts`): zod-validated,
  rate-limited (60/min/IP) beacon sink into the perf reservoirs; visible in
  `GET /metrics/perf` as `rum` percentiles — field data, not estimates.
- `SponsorDirectory.tsx`: results list virtualized with the
  already-installed `@tanstack/react-virtual` via `useWindowVirtualizer`
  (page-level scroll observation with measured `scrollMargin`, dynamic row
  measurement, overscan 10, identical row markup, per-row `border-b`
  replaces `divide-y`). An earlier revision used `useVirtualizer` with
  `getScrollElement: () => null`, which never attaches scroll observers —
  fixed before release. Browser coverage: `tests/e2e/journey4-...`
  (bounded mounts, scroll swaps rows, last-row visibility, link/keyboard/
  mobile checks).
- `lighthouserc.cjs` + `.github/workflows/lighthouse.yml` (dispatch +
  weekly schedule, skips cleanly without `BASE_URL`): asserts LCP ≤ 2.5 s
  (warn), CLS ≤ 0.1 (error), INP ≤ 300 ms (warn), TBT ≤ 400 ms (warn);
  artifacts land in `docs/perf-evidence/lhci/`.

## Production bundle output (measured here, `vite build`)
| Chunk | Before | After | Δ |
|---|---|---|---|
| `SponsorDirectory-*.js` raw / gzip | 15.55 KB / 4.64 KB | 31.02 KB / 9.55 KB | +15.5 / +4.9 KB (react-virtual) |
| `index-*.js` entry raw / gzip | 406.24 KB / 132.82 KB | 412.50 KB / 135.21 KB | +6.3 / +2.4 KB (web-vitals + rum client) |
| Total JS gzip (100 chunks) | 569.9 KB | 576.9 KB | +7.0 KB |
| Budget (`perf:budget`) | pass | pass | — |

Stated plainly: virtualization costs ~5 KB gzip on this route; its payoff
is runtime, not bytes — up to 100 rich rows (≈1,500 DOM nodes) collapse to
visible + overscan (≈15–20 rows). Route-level code-splitting was already in
place (24 lazy routes); no `manualChunks` change was warranted — splitting
`index-*.js` further would churn long-term cache hashes for no measured gain.

## Lighthouse / Core Web Vitals (operator: Nicolas)
Not runnable in this environment (no browser, no deployed URL). Procedure:
1. `BASE_URL=<staging> npx @lhci/cli autorun` on the pre-change build →
   save `docs/perf-evidence/lhci/before/`.
2. Same on this build → `docs/perf-evidence/lhci/after/`.
3. Compare LCP/CLS/INP/TBT on `/`, `/sponsor-directory`, `/sponsor-changes`.
4. DOM check on `/sponsor-directory` (100-row page):
   `document.querySelectorAll('*').length` at scroll-top — expect ≈5–8× fewer
   nodes after (virtualized) vs before (100 rows mounted).
5. Field data after 7 days: `GET /metrics/perf` → `rum` percentiles.

## Evidence (before sign-off)
- [x] bundle before/after table above (this environment)
- [x] `perf:budget` passes after
- [ ] LHCI before/after reports (`lhci/before/`, `lhci/after/`)
- [ ] DOM-node count before/after on a 100-row directory page
- [ ] 7-day field `rum` percentiles from `/metrics/perf`
