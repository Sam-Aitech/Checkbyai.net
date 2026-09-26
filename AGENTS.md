<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`
- **Refactoring**: `refactor_tool` for rename/dead-code planning

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.

---

# Checkbyai.net — Agent Instructions

Polyglot monorepo: React/Vite client + Express/TypeScript server
(`server/`) + Python FastAPI sidecar (`backend/`), Postgres (Neon),
Redis, BullMQ workers.

## Commands & Gates

Run ALL THREE gates before declaring any code change done:

```sh
npm run lint          # eslint + CSS validation
npm run check         # tsc --noEmit
npx vitest run        # unit/integration tests (58 files)
```

Other common tasks:

```sh
npm run dev           # Vite + Express dev server
npm run build         # client build + esbuild server bundle
npm run test:run      # vitest (CI name for npx vitest run)
npm run audit         # audit-ci (high/critical fail the gate)
npm run db:seed-history && npm run db:migrate   # prod cutover: record drift, apply rest
```

Python sidecar (uv-managed, Python pinned by `.python-version`):

```sh
uv sync                                    # install deps from uv.lock
uv run --with pytest pytest                # sidecar tests (backend/)
uv run uvicorn main:app --port 8000        # run from backend/ (flat imports)
python backend/benchmark_verifier.py       # engine benchmark (via uv run)
```

CI (`.github/workflows/ci.yml`): lint+typecheck → audit → node tests +
python sidecar tests → build.

## Hard Constraints

- **Do not restore proprietary logic.** `backend/cos_verifier.py` and
  `backend/ai_engine.py` are deliberate typed stubs raising
  `NotImplementedError` (commit `3f35d77`); the shipped verification
  engine is the in-repo metadata comparison in `backend/main.py`
  (`extract_pdf_metadata` + `compare_with_trusted`). Contract tests in
  `backend/test_cos_verifier.py` enforce this.
- **Stripe webhook reads `req.rawBody` ONLY** (`server/routes/billing.ts`);
  body parsers in `server/index.ts` must keep providing it.
- **Boot DDL (`applyDataFixbacks`) must stay** — it is the drift safety net
  under the migration cutover (`npm run db:seed-history` + idempotent
  `0000`/`0024`–`0030`, wired into `start:with-migrate`; see
  `migrations/README.md`). It is single-flighted behind a Postgres advisory
  lock; do not remove it, do not widen it.
- **Required env vars** (`REQUIRED_ENV_VARS`, `server/index.ts`):
  `DATABASE_URL`, `SESSION_SECRET`, `PHONE_ENCRYPTION_KEY`, `IP_HASH_SALT`,
  `CHECKOUT_HMAC_SECRET`, `DIGEST_SIGNING_KEY`, `STRIPE_WEBHOOK_SECRET`.
  `SESSION_SECRET` must be ≥32 chars with entropy (prod boots fail otherwise).
  Full matrix: `docs/ENV_REFERENCE.md`.
- **Never commit** unless explicitly asked. Nothing in `.env*` (except
  `.env.example`), `data/archives/`, `uploads/`, or `__pycache__` is
  committable.
- Rate/page limits passed from clients must be clamped server-side
  (pattern: `Math.min(..., MAX)`); see `server/routes/admin.ts`.
- If you change Python deps: update **both** `pyproject.toml` and
  `backend/requirements.txt`, then `uv lock`.

## Python Sidecar Contract

Runbook: [`docs/PYTHON_SIDECAR.md`](docs/PYTHON_SIDECAR.md). Key facts:

- Node health-probes `GET /health` and `GET /api/health` (both must answer
  200); enrichment worker uses `GET /api/health`.
- Node→sidecar data endpoints: `POST /api/v1/enrich/companies-house`,
  `POST /api/scrape-jobs`. The client-facing `POST /api/verify` is served
  by **Node** (`server/routes/verification.ts`), not Python.
- Deps in `pyproject.toml` are the import graph truth; `requirements.txt`
  mirrors it for humans. No dead heavyweight deps (sklearn/onnx removed).

## Documentation Map

- Index: [`docs/INDEX.md`](docs/INDEX.md) — every doc, audience, freshness.
- Ops: `docs/RUNBOOK.md`, `DEPLOYMENT.md`, `DEVELOPMENT.md`, `README.md`
- Security: `docs/SECURITY.md`, `docs/ENV_REFERENCE.md`
- Architecture: `docs/SYSTEM_DESIGN.md`, `docs/DATA_MODEL.md`,
  `docs/ARCHITECTURE_DECISIONS.md`
- API: `docs/API_REFERENCE.md` (live), `docs/API_CONTRACT.md` (draft v1)
- Archived session records: `docs/session-notes/` — historical context
  only; never treat as current state.
