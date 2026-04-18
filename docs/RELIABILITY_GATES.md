# Reliability Gates
# checkbyai.net — Phase 6

Owner: CTO / Tech Lead
Status: Active
Last Updated: 2026-04-18

---

## Release Gate Contract

**No deploy to production without a green reliability suite.**

```bash
npm run test:reliability
```

This runs:
1. `server/routes/__tests__/ops.test.ts` — full ops route integration suite (trigger, idempotency, replay, shadow, incidents, callbacks, status)
2. `server/routes/__tests__/ops.fault.test.ts` — fault injection suite (DB failures, 500 error paths)

All tests must pass. A single failure blocks the release.

---

## What the Reliability Suite Covers

| Test Category | File | Count |
|---|---|---|
| Trigger flow (202, 400, 403, 409) | ops.test.ts | 4 |
| Idempotency / replay detection | ops.test.ts | 1 |
| Callback validation (unsafe URL) | ops.test.ts | 1 |
| Status endpoint (found, not found, invalid ID) | ops.test.ts | 3 |
| Shadow run trigger and parity | ops.test.ts | 2 |
| Incident evaluate (empty, admin gate, ticket creation) | ops.test.ts | 3 |
| Incident list (count, RBAC) | ops.test.ts | 2 |
| Incident get by ID (200, 400, 404) | ops.test.ts | 3 |
| Incident resolve (200, 404, RBAC) | ops.test.ts | 3 |
| Fault injection: trigger DB failure | ops.fault.test.ts | 1 |
| Fault injection: incident list DB failure | ops.fault.test.ts | 1 |
| Fault injection: incident get DB failure | ops.fault.test.ts | 1 |
| Fault injection: resolve DB failure | ops.fault.test.ts | 1 |
| Fault injection: status endpoint DB failure | ops.fault.test.ts | 1 |

---

## How to Run

```bash
# Full reliability suite only (fast — excludes unit tests)
npm run test:reliability

# Full suite including unit tests
npm run test:run

# Watch mode during development
npm test
```

---

## Expanding the Suite

When adding new ops endpoints:
1. Add happy-path tests to `ops.test.ts`
2. Add a fault injection test to `ops.fault.test.ts`
3. Add a row to the table above

When adding new job runners:
1. Add a unit test to `server/utils/__tests__/<jobName>.test.ts`
2. Update the trigger flow test in `ops.test.ts` to cover the new jobName

---

## Out of Scope for this Suite

- Database schema migrations (test against a real DB in a separate CI step)
- Email delivery (test against SendGrid sandbox in staging)
- Companies House API (mocked at the worker level; test against real API in staging)
- E2E user flows (handled by the future Phase 8 hypercare validation)
