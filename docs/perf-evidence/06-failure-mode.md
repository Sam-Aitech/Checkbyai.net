# Proof 6 — Redis down: safe reject, no web-server CPU burn

## What changed (behavior change — sign-off required)
- `POST /api/verify` no longer falls back to inline analysis when the queue
  is unavailable. New behavior:
  - Queue down → stored document is deleted (no orphan), `Retry-After: 30`,
    `503 Verification queue unavailable — please retry shortly.`
  - `?sync=1` is now gated behind `ALLOW_SYNC_VERIFY=true` (emergency/ops
    use only, default off). Requesting it while disabled → `400`.
  - `ALLOW_SYNC_VERIFY=true` + queue down → previous inline path (unchanged
    code, materialized from the document store).
- `server/routes/__tests__/verifyJobs.test.ts` (+2 tests): 503 without
  invoking `runVerificationAnalysis` and with store put/delete paired
  (no orphan); `?sync=1` → 400 when the env flag is unset.

## Verified in this environment
- `npx vitest run server/routes/__tests__/verifyJobs.test.ts`: 5/5 pass.
- `npx tsc --noEmit`: zero errors in touched files.

## Live runbook (operator: staging)
1. `docker compose stop redis` (API keeps serving).
2. Submit a PDF → expect `503` in <1 s with `Retry-After: 30`.
3. During the attempt, sample `GET /metrics/perf` twice: event-loop p99 and
   heap must stay flat (no analysis runs — contrast with the old inline
   fallback, which pegged the loop for the full analysis duration).
4. `docker compose start redis` → resubmit → `202`, job completes.
5. Confirm no orphan keys/objects: S3 prefix (or `uploads/documents/`) has no
   leftover from the rejected attempts.

## Evidence (paste transcripts before sign-off)
- [ ] 503 response + `Retry-After` header
- [ ] `/metrics/perf` flat across the rejected attempt
- [ ] post-recovery `202` + `completed` poll
- [ ] store listing showing no orphans
