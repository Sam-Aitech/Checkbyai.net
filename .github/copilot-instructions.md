# Project Guidelines

## Scope
These instructions apply workspace-wide. Keep changes focused, minimal, and consistent with existing patterns.

## Architecture
- This is a single-process Node.js monolith: Express API + Vite/React frontend on port 5000.
- Frontend code lives in `client/src`.
- Backend API and jobs live in `server`.
- Shared contracts and DB schema live in `shared`.
- `shared/schema.ts` is the database source of truth for Drizzle.
- There is an optional Python FastAPI sidecar for enrichment/scraping (`backend`, launched via `run_backend.py`, default port 8000).

## Build And Test
Use these commands first; do not invent alternatives unless needed.

- Install: `npm install`
- Dev server: `npm run dev`
- Type-check: `npm run check`
- Tests (watch): `npm run test`
- Tests (CI/single run): `npm run test:run`
- Production build: `npm run build`
- Production start: `npm run start`
- DB schema sync: `npm run db:push`
- DB migrations: `npm run db:migrate`
- Binary setup/check: `npm run setup:binaries`, `npm run check:binaries`

## Conventions
- TypeScript is strict and `noEmit`; keep code type-safe and avoid `any` unless justified.
- Keep routing logic in `server/routes/*` and business logic in `server/services` or `server/utils`.
- Use path aliases already configured:
  - `@/*` -> `client/src/*`
  - `@shared/*` -> `shared/*`
- Prefer additive, backward-compatible schema changes and keep `shared/schema.ts` and migrations aligned.
- For API or behavior changes, update docs rather than duplicating explanations in code comments.

## Repo-Specific Gotchas
- The app may start without some optional env vars, but behavior can silently degrade (for example Stripe webhooks without `STRIPE_WEBHOOK_SECRET`).
- In production, missing critical env vars causes startup failure. Check `server/index.ts` for required keys.
- Sponsor monitor quality depends on external binaries (`qsv`, `csvdiff`) and archive/diff pipeline utilities.
- Test config currently targets server tests (`server/**/__tests__/**/*.test.ts`). Add tests in the expected location unless intentionally expanding scope.
- `CONTRIBUTING.md` references lint/format commands; verify script availability in `package.json` before using them.

## Documentation Links (Link, Don’t Embed)
Use these docs as the source of detail and keep instructions concise:

- Setup and local workflow: `DEVELOPMENT.md`
- Contribution and PR workflow: `CONTRIBUTING.md`
- System architecture: `docs/SYSTEM_DESIGN.md`
- API endpoints and contracts: `docs/API_REFERENCE.md`
- Data model: `docs/DATA_MODEL.md`
- Security model: `docs/SECURITY.md`
- Operations and incidents: `docs/RUNBOOK.md`
- ADRs and design decisions: `docs/ARCHITECTURE_DECISIONS.md`
- Full docs map: `docs/INDEX.md`

## Change Hygiene
- Keep edits scoped to the requested area; avoid broad refactors.
- Preserve established naming and file layout.
- When touching sponsor monitor, billing, auth, or security-sensitive paths, call out risks and add/update targeted tests.
