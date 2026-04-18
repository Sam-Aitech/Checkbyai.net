# Enterprise Execution Plan
# checkbyai.net
**Owner:** CTO / Tech Lead
**Status:** Approved
**Last Updated:** 2026-04-18

---

## 1. Executive Decision

The next phase is **enterprise operational hardening**, not platform sprawl.

This means:
- no microservice split yet
- no large infrastructure migration without a measured trigger
- no enterprise customer commitments without control-plane, observability, and governance coverage

The product is already functional. The immediate gap is not feature existence; it is enterprise operating confidence.

---

## Program Progress (Phase 0-8)

Current execution status:

1. Phase 0: Completed and frozen
2. Phase 1-8: Planned, not started

Source of truth for phase status and GitHub build backlog:

- [EXECUTION_PHASES_0_8.md](EXECUTION_PHASES_0_8.md)

Priority-to-phase mapping:

| Priority | Covered By Phases |
|---|---|
| P0 Enterprise Control Plane | Phase 1 and Phase 5 |
| P1 Observability and Reliability | Phase 1, Phase 2, Phase 5, Phase 7 |
| P2 Compliance and Data Governance | Phase 5 and Phase 6 |
| P3 Scale-Out Triggers | Phase 4, Phase 7, Phase 8 |

Execution rule:

1. If this document and phase document diverge, update both in the same PR.
2. Delivery tracking uses `EXECUTION_PHASES_0_8.md`; strategy and rationale stay here.

---

## 2. CTO Position

### What stays true now
- The monolith remains the correct default architecture for the current team size and product shape
- PostgreSQL remains the source of truth
- Daily sponsor processing remains acceptable in-process until monitoring proves otherwise
- GitHub Actions remains the release gate for build, test, and security automation

### What changes now
- Engineering work must be prioritised by enterprise risk reduction, not by visible feature count
- Every new enterprise-facing capability must have an owner, telemetry, rollback path, and documentation
- Admin capability must evolve from binary `admin` access to controlled roles with auditable actions

---

## 3. Priority Order

## P0. Enterprise Control Plane

Objective: make the product governable.

Deliverables:
- Expand authz from `user/admin` to explicit roles such as `owner`, `admin`, `analyst`, `support`, `billing`, `viewer`
- Add immutable audit events for admin and support actions
- Define tenant-sensitive resource ownership rules and enforce them consistently
- Add environment separation policy for `dev`, `staging`, and `prod`
- Require change approval path for schema, auth, billing, and notification code

Exit criteria:
- Every privileged route maps to an explicit role matrix
- Admin actions are queryable and attributable
- Staging is the required promotion gate before production

## P1. Observability And Reliability

Objective: make the product operable under incident conditions.

Deliverables:
- Add structured telemetry standards: request IDs, job IDs, actor IDs, correlation IDs
- Instrument sponsor monitor phases with success/failure counters and latency timings
- Define service level objectives for auth, sponsor monitoring, and webhook processing
- Add alerting for failed cron runs, webhook failures, auth error spikes, and degraded dependencies
- Document and test backup, restore, and rollback procedures with real drills

Exit criteria:
- Core workflows have dashboards and actionable alerts
- Recovery procedures are time-bounded and rehearsed
- Production incidents can be traced end-to-end from request to job to notification

## P2. Compliance And Data Governance

Objective: make the platform defensible for regulated and enterprise buyers.

Deliverables:
- Define retention rules for logs, verification metadata, support tickets, and notification history
- Document DSR handling for export, correction, and deletion requests
- Add access review cadence for privileged accounts
- Map current controls to GDPR and SOC 2 style evidence categories
- Define data classification and approved storage locations for sensitive artifacts

Exit criteria:
- Retention and deletion policies are documented and enforceable
- Privileged access is reviewable
- Compliance evidence can be assembled without reverse engineering the system

## P3. Scale-Out Triggers

Objective: defer complexity until justified.

Do not execute these by default. Only execute if metrics or contracts demand it.

Candidate work:
- Move sponsor processing and enrichment to dedicated workers
- Introduce queue-backed async execution for heavy jobs
- Separate API and job runtimes
- Add dedicated integration surface for enterprise customers
- Evaluate stronger tenant isolation and SSO/SAML

Trigger thresholds:
- Sponsor or enrichment workloads affect API latency or release safety
- Single deployment unit materially increases outage risk
- Enterprise commitments require stronger isolation or federation

---

## 4. Ninety-Day Delivery Sequence

## Days 0-30
- Define privileged role matrix and route inventory
- Add audit event schema and logging contract
- Stand up staging promotion policy
- Add sponsor monitor and webhook alerting baselines
- Freeze non-essential architectural churn

## Days 31-60
- Implement RBAC enforcement on privileged routes
- Add admin/support audit views
- Publish retention policy and DSR process
- Add backup/restore drill and document measured recovery time
- Instrument core business workflows with correlation IDs

## Days 61-90
- Review enterprise blockers by customer requirement, not by intuition
- Introduce SSO/SAML design only if a real deal requires it
- Decide on worker separation using observed production metrics
- Finalise compliance evidence binder and operating handbook

---

## 5. Non-Negotiables

- No direct production-only features without staging validation
- No privileged action without auditability
- No new critical integration without alerting and rollback instructions
- No data retention ambiguity for sensitive or regulated records
- No architectural decomposition justified only by aesthetics

---

## 6. Current Gaps To Close

- Authorization is still too coarse for enterprise operations
- Observability is documented but not yet run as a measured control system
- Disaster recovery targets are not yet explicit
- Compliance posture is credible in design but weak in evidence packaging
- Deployment strategy is improving, but release promotion is still too flat

---

## 7. Success Definition

This phase succeeds when CheckByAI can support an enterprise buyer with confidence that:
- privileged access is controlled and reviewable
- incidents are detectable and recoverable within defined bounds
- data handling is documented and defensible
- releases are promoted through a managed path
- future scale decisions are driven by evidence, not guesswork