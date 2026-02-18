# Performance Baseline Report

**Date**: 2026-02-18  
**Stack**: React 18 + Vite + Express (Node.js)  
**Deployment**: Replit (Google Frontend / GFE proxy)

## Architecture Summary

- **Frontend**: React SPA with Vite bundler, all routes lazy-loaded via `React.lazy()`
- **Backend**: Express server serving API routes + static files (production) or Vite dev middleware
- **3D Graphics**: Three.js + @react-three/fiber, double-lazy loaded (home → HeroSection → Enhanced3DDemo)
- **Animation**: framer-motion used across 21 component files
- **CSS**: Tailwind CSS + shadcn/ui component library
- **Entry**: `client/index.html` → `client/src/main.tsx` → `App.tsx` (lazy routes)

## Identified Bottlenecks

### Critical (High Impact)

1. **No server compression** — Express serves static files without gzip/brotli. All JS/CSS/HTML sent uncompressed, increasing transfer sizes 3-5x.
2. **No cache headers on static assets** — `express.static()` called with no `maxAge` or `immutable` options. Browser re-downloads assets on every visit.
3. **Render-blocking external script** — `replit-dev-banner.js` loaded synchronously at bottom of body. Blocks parsing completion.

### Moderate (Medium Impact)

4. **Large index.html head** — ~220 lines including 3 separate JSON-LD structured data blocks (~140 lines of JSON) parsed before any rendering starts.
5. **No preconnect hints** — Only `dns-prefetch` for YouTube. No preconnect for critical origins.
6. **framer-motion bundle weight** — Imported across 21 files. ~90KB minified. Should verify tree-shaking effectiveness.

### Low (Potential Improvement)

7. **Large attached images** — Some PNGs in attached_assets/ are 300-400KB. Could benefit from WebP conversion.
8. **No explicit image dimensions** — Some images may lack width/height causing layout shift.
9. **modulepreload hint** — `<link rel="modulepreload" href="/src/main.tsx" />` only useful in dev; in production the entry point is the bundled JS.

## Positive Findings (Already Optimized)

- All routes lazy-loaded in App.tsx ✓
- Three.js double-lazy loaded (not in critical path) ✓
- System fonts used (no external font loading) ✓
- HeroSection lazy-loaded on home page ✓
- No external CSS CDN dependencies ✓
- Inline critical styles in index.html ✓

## Expected Impact of Fixes

| Fix | Expected LCP Impact | Expected FCP Impact |
|-----|---------------------|---------------------|
| Compression | -500ms to -1500ms | -300ms to -800ms |
| Cache headers | -200ms (repeat visits) | -200ms (repeat visits) |
| Defer scripts | -100ms to -300ms | -50ms to -150ms |
| Preconnect hints | -50ms to -150ms | -50ms |
| Image optimization | -200ms to -500ms | Minimal |
