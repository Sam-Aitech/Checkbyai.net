# Proof 5 — Double upload, evict first, poll both

## What changed
- `POST /api/verify` records a Redis job index at enqueue time:
  `verify:job:{jobId}` → `{ receiptId, userId, documentHash }` (24 h TTL).
- `GET /api/verify/job/:jobId` resolution order is now:
  1. Live BullMQ job → `completed` (+ result) / `failed` / active state.
  2. Missing job + index hit → `200 { status: 'evicted', receiptId,
     documentHash, receiptUrl: '/api/receipt/{receiptId}' }` so the client
     can always map a job back to its own receipt and fall back to the
     receipt endpoint or history.
  3. Missing job + no index → `404` (never existed / index expired).
- `server/routes/__tests__/verifyJobs.test.ts` (new, 5 tests): evicted-job
  tombstone, two-upload isolation after evicting the first, unknown-id 404,
  plus 2 failure-mode tests (503 without analysis, `?sync=1` 400 gate).

## Verified in this environment
- `npx vitest run server/routes/__tests__/verifyJobs.test.ts`: 5/5 pass.

## Live runbook (operator: staging, authenticated COS-enabled user)
1. Upload the same PDF twice → `202` job A (receipt A), `202` job B (receipt B).
   Assert `receiptA !== receiptB`, same `documentHash`.
2. Evict job A: `redis-cli DEL "bullmq:verification-job:<id>"`-equivalent
   (or `job.remove()` via a console) — do NOT delete the `verify:job:<id>` key.
3. Poll both: A → `status: 'evicted'`, `receiptId: A`;
   B → `status: 'completed'`, `result.receiptId: B`.
4. `GET /api/receipt/A` resolves independently of job state.

## Evidence (paste transcripts before sign-off)
- [ ] two `202` responses (distinct receipts, identical hash)
- [ ] poll A → evicted + receipt A
- [ ] poll B → completed + receipt B
- [ ] `GET /api/receipt/A` body
