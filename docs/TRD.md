# Technical Requirements Document (TRD)
# checkbyai.net
**Version:** 1.0 | **Status:** Live | **Last Updated:** 2026-06-01

---

## 1. System Context and Boundaries

checkbyai.net is a single-process Node.js/Express platform serving API and React frontend, with in-process scheduled jobs and a shared PostgreSQL data layer.

| Boundary | In Scope | Out of Scope |
|---|---|---|
| Product scope | Sponsor Licence Monitor and COS Check products | New product lines not defined in PRD |
| Runtime model | Monolithic app process, cron jobs, queue-backed async notification work | Microservice decomposition |
| Data scope | Relational schema in `shared/schema.ts`, documented in `DATA_MODEL.md` | External data stores not documented in core architecture |
| Integration scope | gov.uk sponsor register ingestion, payment/auth providers, notification channels, API clients | Unapproved integrations outside current API/security model |

**Source docs:** [PRD.md](PRD.md), [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md), [DATA_MODEL.md](DATA_MODEL.md), [API_REFERENCE.md](API_REFERENCE.md)

---

## 2. Functional Requirements Mapping

| FR ID | Requirement | Primary APIs/Components | Source |
|---|---|---|---|
| FR-01 | User authentication and account lifecycle for protected features | Auth endpoints and session middleware | [PRD.md](PRD.md), [API_REFERENCE.md](API_REFERENCE.md#2-authentication), [SECURITY.md](SECURITY.md#2-authentication) |
| FR-02 | COS Check uploads, analysis, and result delivery | COS endpoints, `pdfAnalyzer.ts`, authenticity checker services | [PRD.md](PRD.md), [API_REFERENCE.md](API_REFERENCE.md#3-cos-check), [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) |
| FR-03 | Sponsor search and watch management | Sponsor search APIs, watchlist endpoints, storage layer | [PRD.md](PRD.md), [API_REFERENCE.md](API_REFERENCE.md#4-sponsor-monitor--search), [API_REFERENCE.md](API_REFERENCE.md#5-company-watches) |
| FR-04 | Sponsor monitoring and state transitions | `sponsorMonitorJob.ts`, state machine, diff/archive pipeline | [PRD.md](PRD.md), [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md#4-data-flow-diagrams), [EXECUTION_PHASES_0_8.md](EXECUTION_PHASES_0_8.md) |
| FR-05 | User alerting and notification preferences | Notification preference APIs, dispatcher pipeline, alert jobs | [PRD.md](PRD.md), [API_REFERENCE.md](API_REFERENCE.md#6-notification-preferences), [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) |
| FR-06 | Billing/subscription gating and feature access controls | Billing endpoints, tier config, entitlement checks | [PRD.md](PRD.md), [API_REFERENCE.md](API_REFERENCE.md#8-billing--subscriptions), [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) |
| FR-07 | Admin observability and operational controls | Admin endpoints for jobs/status/history | [API_REFERENCE.md](API_REFERENCE.md#9-admin-endpoints), [EXECUTION_PHASES_0_8.md](EXECUTION_PHASES_0_8.md), [ENTERPRISE_EXECUTION_PLAN.md](ENTERPRISE_EXECUTION_PLAN.md) |

---

## 3. Non-Functional Requirements

### 3.1 Performance and Scale
- API routes must remain operable under documented rate limits and processing constraints.
- Sponsor monitoring pipeline must complete within operational windows and produce auditable run records.
- COS processing must provide user feedback for synchronous and asynchronous phases.

### 3.2 Reliability and Operations
- Scheduled jobs must provide run metadata, status observability, and failure diagnostics.
- Alerting flows must include retry/error handling paths and operator visibility.
- Operational status routes must provide live health, run, and incident context.

### 3.3 Security and Compliance
- Authentication, authorization, and abuse controls must follow [SECURITY.md](SECURITY.md).
- Data handling, encryption, privacy controls, and retention follow [DATA_MODEL.md](DATA_MODEL.md) and [SECURITY.md](SECURITY.md#5-data-protection).
- API error behavior and sensitive data handling must follow [API_REFERENCE.md](API_REFERENCE.md#10-error-response-format).

---

## 4. Integration Requirements

| Integration | Requirement | Contract Source |
|---|---|---|
| gov.uk sponsor register | Must ingest current CSV source, archive snapshots, and reconcile state machine changes | [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md), [API_REFERENCE.md](API_REFERENCE.md#9-admin-endpoints) |
| Authentication/session | Must enforce authenticated access for protected user/admin routes | [API_REFERENCE.md](API_REFERENCE.md#2-authentication), [SECURITY.md](SECURITY.md#2-authentication) |
| Notification channels | Must support configured delivery preferences and retry-safe dispatch patterns | [API_REFERENCE.md](API_REFERENCE.md#6-notification-preferences), [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) |
| Billing provider | Must maintain entitlement-safe gating for subscription features | [API_REFERENCE.md](API_REFERENCE.md#8-billing--subscriptions), [SECURITY.md](SECURITY.md#7-payment-security) |

---

## 5. Data and API Dependencies

### 5.1 Data Dependencies
- Canonical schema authority is [DATA_MODEL.md](DATA_MODEL.md), synchronized with `shared/schema.ts`.
- Sponsor monitoring depends on canonical sponsor, archive, and run-history entities.
- COS workflows depend on verification result persistence and linked user/account entities.

### 5.2 API Dependencies
- Route behaviors and payload contracts are defined in [API_REFERENCE.md](API_REFERENCE.md).
- Auth, error envelope, and rate-limit behavior are normative API dependencies.
- Admin API contracts are mandatory for runtime operations and support workflows.

---

## 6. Acceptance Criteria and PRD Traceability

| AC ID | Acceptance Criterion | PRD Trace |
|---|---|---|
| AC-01 | Every in-scope feature requirement maps to at least one documented API or service boundary. | PRD section 4 |
| AC-02 | Non-functional requirements reference explicit controls for reliability, security, and compliance. | PRD section 5, SECURITY |
| AC-03 | Data dependencies align with current schema and entity model documentation. | PRD section 4, DATA_MODEL |
| AC-04 | Operational/admin requirements map to concrete monitoring/control interfaces. | PRD + API admin sections |
| AC-05 | Document links to core source docs remain valid and updated in the same PR as source changes. | Documentation governance rule |

---

## 7. Related Core Documents

- [PRD.md](PRD.md)
- [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md)
- [DATA_MODEL.md](DATA_MODEL.md)
- [API_REFERENCE.md](API_REFERENCE.md)
- [SECURITY.md](SECURITY.md)
- [ENTERPRISE_EXECUTION_PLAN.md](ENTERPRISE_EXECUTION_PLAN.md)
- [EXECUTION_PHASES_0_8.md](EXECUTION_PHASES_0_8.md)

---

## 8. Governance

| Field | Value |
|---|---|
| Owner | Engineering Lead / Architecture Owner |
| Review Cadence | Monthly and at each architecture-significant release |
| Update Rule | If any linked source doc changes technical behavior or contracts, update this TRD in the same PR |

