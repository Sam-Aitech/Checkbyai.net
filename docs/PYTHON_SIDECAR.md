# Python Sidecar (`backend/`)

FastAPI service backing Companies House enrichment, job scraping, and the
metadata-comparison fallbacks. Node treats it as optional: without
`PYTHON_BACKEND_URL`, Node falls back to Cheerio scraping and skips
enrichment.

**Audience:** Engineering / Ops
**Last updated:** 2026-09-26

## Quick reference

```sh
uv sync                              # install deps (uv.lock is truth)
uv run --with pytest pytest          # sidecar tests (from repo root)
uv run python run_backend.py         # dev server on :8000 (reload=True)
cd backend && uv run uvicorn main:app --port 8000   # production-style
uv run python backend/benchmark_verifier.py         # engine benchmark
```

- Python version is pinned by `.python-version` (3.11 — matches CI and
  deploy workflows; scipy has no 3.14 wheels).
- Tests live in `backend/test_*.py`, configured via
  `[tool.pytest.ini_options]` in `pyproject.toml` (`pythonpath = ["backend"]`
  so flat imports resolve).
- CI job: `python-sidecar` in `.github/workflows/ci.yml` (runs on every PR).

## Endpoints Node actually calls

| Endpoint | Called by (Node) | Purpose |
|----------|------------------|---------|
| `GET /health` | `server/index.ts` startup probe, `sponsorMonitorDiagnostics.ts` | liveness |
| `GET /api/health` | `enrichmentWorker.ts` | liveness (alias) |
| `POST /api/v1/enrich/companies-house` | `companyEnricher` | CH company enrichment |
| `POST /api/scrape-jobs` | `jobScraper` | job listing scrape |

**Not** a sidecar endpoint: client `POST /api/verify` is served by Node
(`server/routes/verification.ts`). Same-origin only; the sidecar's
`/api/verify` exists for direct/internal use.

## Verification engine contract (hard constraint)

Commit `3f35d77` deliberately stripped proprietary logic:

- `backend/cos_verifier.py`, `backend/ai_engine.py` are **typed stubs**
  raising `NotImplementedError`. Do not restore the originals.
- Shipped logic = in-repo metadata comparison in `backend/main.py`:
  `extract_pdf_metadata()` (PyMuPDF, opens from in-memory bytes — never
  from a file path, see WinError 32 note in code) +
  `compare_with_trusted()` (hash match → score thresholds
  `>=0.8 Genuine / >=0.5 Edited / else Fake`).
- `backend/test_cos_verifier.py` enforces the stub contract (legacy
  methods must stay removed); `backend/test_integration.py` covers
  health aliases, genuine/edited/fake paths, upload→verify roundtrip,
  and 422 on unreadable PDFs.

## Dependencies

- `pyproject.toml` [project].dependencies is the import graph truth;
  `backend/requirements.txt` mirrors it for humans (keep in sync).
- Rule: a dependency with **no importer** under `backend/` gets removed
  (sklearn, onnxruntime, numpy, duckdb, protobuf, camoufox were removed
  2026-09-26). Direct pins kept for transitive reasons: `lxml`
  (GHSA fix), `curl-cffi` (scrapling transport).
- After any dep change: `uv lock`. Root `pyproject.toml`
  `[tool.uv.sources]` carries exactly one redirect (`huggingface-hub` → CPU
  index on Linux); the ~1100-entry Replit dump of unrelated packages was
  pruned 2026-09-26 with a byte-identical `uv.lock` (re-lock to verify
  after any edit).

## File-handling notes

- Uploads go to `os.getenv("TEMP_DIR") or tempfile.gettempdir()` and are
  deleted in `finally` — never assume `/tmp` exists (Windows).
- Unreadable/corrupt PDFs must return **422**, not 500. Tests assert this.
- `fitz.open()` on a path leaks the OS handle when parsing fails; always
  open via `fitz.open(stream=data, filetype="pdf")` after reading bytes.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Node diagnostics `checkPythonBackend` red | sidecar not running / wrong `PYTHON_BACKEND_URL` | `uv run python run_backend.py`; probe `/health` manually |
| `ModuleNotFoundError: cos_verifier` | launched as `backend.main` package | use `run_backend.py` (sets `app_dir="backend"`) or run from `backend/` |
| `scipy` build failure on sync | Python 3.14 interpreter | use `.python-version` (3.11): `uv sync --python 3.11` |
| WinError 32 on verify | file handle held during `os.remove` | open PDFs from memory (see above) |
