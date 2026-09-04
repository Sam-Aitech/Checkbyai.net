# Proof 1 — API and PDF consumer are separate deployments/processes

## What changed
- `server/worker.ts` (new): standalone entrypoint registering ONLY the
  `VERIFICATION_JOB` worker (concurrency 2). Logs `{ pid, role, NODE_OPTIONS,
  heapLimitMB }` at boot; exits(1) if Redis is unreachable; closes workers on
  SIGTERM/SIGINT.
- `server/services/jobQueue.ts`: `setupWorkers()` split into
  `setupApiWorkers()` (sponsor-refresh, scraping, notification-dispatch) and
  `setupVerificationWorkers()` (verification only, returns `Worker[]` for
  graceful shutdown). `setupWorkers()` retained as the `all` composite.
- `server/index.ts`: honors `PROCESS_ROLE=api|worker|all` (default `all`
  preserves single-process dev via `npm run dev`).
- `package.json`: `build` emits `dist/index.js` + `dist/worker.js`;
  `dev:worker` / `start:worker` scripts added.
- `Dockerfile`: same image serves both roles (worker overrides CMD).
- `docker-compose.yml`: new `worker:` service
  (`mem_limit: 3g`, `cpus: 2.0`, `NODE_OPTIONS=--max-old-space-size=2048`);
  `app:` pinned to `PROCESS_ROLE=api`
  (`mem_limit: 1g`, `cpus: 1.0`, `NODE_OPTIONS=--max-old-space-size=512`).

## Verified in this environment (no Docker available)
- `npx tsc --noEmit`: zero errors in `server/index.ts`, `server/worker.ts`,
  `server/services/jobQueue.ts`.
- `npx esbuild server/index.ts server/worker.ts --bundle ...`: emits two
  independent bundles (`index.js` ~779 KB, `worker.js` ~147 KB) — no shared
  HTTP listener in the worker graph.

## Live runbook (operator: host with Docker)
1. `docker compose up --build -d app worker`
2. `docker compose ps` → two containers, distinct IDs.
3. `docker stats --no-stream app worker` → record CPU/Mem + configured limits
   (`1g/1.0` vs `3g/2.0`). Paste output into §Evidence below.
4. `docker compose logs worker | head -5` → startup line with distinct `pid`,
   `heapLimitMB: ~2048`; `docker compose logs app` → `heapLimitMB` absent
   (API path) and no "Verification worker registered" line.
5. Resilience: `docker compose stop worker` → `curl /api/health` still 200;
   submit a verify → job stays `waiting` (not failed). `docker compose start
   worker` → job drains.
6. Upload a 10 MB PDF while running a CPU spike inside the worker container
   (`stress-ng` or parallel verifies) → API p95 must not track worker CPU.

## Evidence (paste live outputs here before sign-off)
- [ ] `docker stats` table (app vs worker, limits visible)
- [ ] worker boot log line (pid + heapLimitMB)
- [ ] app boot log showing API-only worker set
- [ ] kill-worker health-check transcript
