# Proof 2 — Job retrieves the document through a durable object key

## What changed
- `server/services/documentStore.ts` (new): `DocumentStore` interface
  (`put/get/delete/purgeStale`) with two drivers selected by
  `DOCUMENT_STORE_DRIVER` (`local` default, `s3` for S3-compatible buckets:
  AWS S3, Cloudflare R2, MinIO via `S3_ENDPOINT`).
  - Local driver: atomic write (`.part` + rename) under
    `UPLOADS_DIR/documents/`, key-jailing on read/write/delete, stale sweeper.
  - S3 driver: `Put/Get/Delete/ListObjectsV2` via `@aws-sdk/client-s3`
    (dynamically imported; bucket/key layout `{S3_PREFIX}/verify/...`).
  - Keys: `verify/{receiptId}/{sha256}.pdf` via `buildDocumentKey()`;
    traversal rejected by pattern + jail check.
- `POST /api/verify`: reads the multer temp file ONCE, `put`s bytes under the
  key, unlinks temp immediately. The BullMQ job carries ONLY `documentKey`
  (no local path). Admin-override path deletes the stored object after use.
- `server/workers/verificationWorker.ts`: `get(key)` → temp file →
  `runVerificationAnalysis` → persist → `finally` deletes temp AND store key
  (exactly-once document lifecycle; retries re-download from the store).
  Inline (`?sync=1`) path materializes from the store the same way.
- `server/worker.ts`: best-effort `purgeStale(24h)` orphan sweep at boot.
- `.env.example`: `DOCUMENT_STORE_DRIVER`, `S3_*`, `UPLOADS_DIR`,
  `PROCESS_ROLE` documented.

## Verified in this environment
- `npx tsc --noEmit`: zero errors in route, worker, store, entrypoint.
- No object bytes cross Redis — job data is `{ documentKey, userId,
  receiptId, documentHash, originalName, ipAddress, useCredits, useDailyLimit }`.

## Live runbook (operator: two instances, NO shared volume)
1. Instance A (API): `DOCUMENT_STORE_DRIVER=s3` (+ `S3_*`), `PROCESS_ROLE=api`.
   Instance B (worker): same store config, `PROCESS_ROLE=worker`.
   Confirm A has no `uploads/` mount shared with B.
2. Submit a PDF to A → `202 { jobId, receiptId }`.
3. B logs `started for receipt {receiptId} (key verify/...)` → completes;
   poll `GET /api/verify/job/{jobId}` → `completed` with matching receipt.
4. Confirm the S3 object is gone after completion (lifecycle delete) and that
   stopping B mid-job then restarting still completes (re-download on retry).
5. Negative control (pre-fix behavior): with the old code this run fails with
   `ENOENT` on B — keep one transcript showing old-vs-new if required.

## Evidence (paste live outputs here before sign-off)
- [ ] API enqueue log + worker resolve-by-key log (different hosts)
- [ ] `completed` poll response with matching receipt
- [ ] Bucket listing empty after completion (or lifecycle rule)
- [ ] Restart-mid-job recovery transcript
