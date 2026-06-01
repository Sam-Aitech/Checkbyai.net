# Application Flow Document
# checkbyai.net
**Version:** 1.0 | **Status:** Live | **Last Updated:** 2026-06-01

---

## 1. Actor Map

| Actor | Primary Goals | Primary Surfaces |
|---|---|---|
| Visitor | Understand value, sign up, authenticate | Marketing pages, auth entry points |
| Authenticated User | Run COS checks, manage watched sponsors, manage notifications and billing | Product dashboard + authenticated APIs |
| Admin / Operator | Observe jobs, trigger operational actions, inspect incidents | Admin endpoints and operational views |
| Background Jobs | Run scheduled ingestion, reconciliation, and alert dispatch | Scheduler, job services, queue/DB |
| External Systems | Provide sponsor data, auth/payment/notification capabilities | gov.uk CSV source, provider integrations |

---

## 2. Entry Points and States

| Entry Point | Initial State | Possible Next States |
|---|---|---|
| Public homepage | Anonymous | Sign-up, sign-in, product exploration |
| Auth callback/session start | Pending auth | Authenticated dashboard or auth error |
| COS upload/check request | Authenticated | Analysis in progress, completed result, failed validation |
| Sponsor watch actions | Authenticated | Watch added/updated/removed or validation error |
| Scheduled monitor trigger | Idle system | Running pipeline, completed with changes, failed run |
| Admin run trigger | Operator action | Queued/running/completed/failed with diagnostics |

---

## 3. Sponsor Licence Monitor Flows

### 3.1 Happy Path (User + Backend)
1. User authenticates and searches sponsor records.
2. User creates/updates watch entries with notification preferences.
3. Scheduled job discovers current source CSV and validates archive readiness.
4. Diff and state machine phases classify changes (new, active, grace, removed/revoked).
5. Notification dispatcher delivers applicable alerts and records outcomes.
6. User views updated status and notifications in product UI.

### 3.2 Error and Exception Paths
- Source fetch/validation failure -> run marked failed, diagnostics persisted, admin visibility required.
- Diff/state processing anomaly -> processing halts safely with failure reason and retry path.
- Notification delivery failure -> channel-level failure tracked; retry/fallback policy applies.
- User watch request invalid/unauthorized -> API validation/authorization rejection with error envelope.

### 3.3 Decision Points and Handoffs
- Frontend -> API: authenticated search/watch actions.
- API -> Job layer: scheduled/manual monitor orchestration.
- Job layer -> DB: archive, canonical, run-history persistence.
- Job layer -> Notification pipeline: batched dispatch with success/failure recording.

---

## 4. COS Check Flows

### 4.1 Happy Path (User + Analysis Pipeline)
1. User uploads COS document and submits analysis request.
2. API validates request and accepted file constraints.
3. Analysis service performs metadata/authenticity checks.
4. Result is persisted and returned to user with status indicators.
5. User reviews findings and suggested next actions.

### 4.2 Error and Exception Paths
- File validation fails -> immediate user-facing validation error.
- Analysis pipeline fails or times out -> controlled failure response and logged diagnostics.
- Persistence failure -> operation fails safely; partial state is not exposed as completed analysis.
- Access control breach attempt -> authorization denied and event logged.

### 4.3 Decision Points and Handoffs
- Frontend upload -> API validation boundary.
- API -> analysis services (`pdfAnalyzer` and authenticity checker) boundary.
- Analysis services -> DB write boundary for verification results.
- API -> frontend response boundary with standardized success/error shape.

---

## 5. Admin and Operational Flows

### 5.1 Happy Path
1. Operator accesses protected admin routes.
2. Operator reads orchestration status, incidents, and recent run history.
3. Operator triggers manual run when required.
4. System executes and exposes completion/failure telemetry.
5. Operator resolves incidents and validates stabilization.

### 5.2 Error and Exception Paths
- Admin auth/role mismatch -> access denied.
- Job trigger fails -> explicit error, no ambiguous run state.
- Incident resolution write fails -> error retained and surfaced for retry.
- Status/read failures -> graceful error response with operational context.

---

## 6. Cross-Document References

- [PRD.md](PRD.md)
- [TRD.md](TRD.md)
- [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md)
- [DATA_MODEL.md](DATA_MODEL.md)
- [API_REFERENCE.md](API_REFERENCE.md)
- [SECURITY.md](SECURITY.md)
- [ENTERPRISE_EXECUTION_PLAN.md](ENTERPRISE_EXECUTION_PLAN.md)
- [EXECUTION_PHASES_0_8.md](EXECUTION_PHASES_0_8.md)

---

## 7. Governance

| Field | Value |
|---|---|
| Owner | Product + Engineering Leads |
| Review Cadence | Monthly and after flow-impacting feature releases |
| Update Rule | If any linked source doc changes user flow, API sequence, or job behavior, update this App Flow doc in the same PR |

