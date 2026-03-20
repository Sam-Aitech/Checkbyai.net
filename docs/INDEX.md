# checkbyai.net — Documentation Index
**Last Updated:** 2026-03-20

---

## Documents

| Document | Audience | Purpose |
|---|---|---|
| [PRD.md](PRD.md) | Product / Engineering | What the product does, user personas, feature requirements, success metrics |
| [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) | Engineering | Full architecture, component deep-dives, data flows, external service integrations |
| [DATA_MODEL.md](DATA_MODEL.md) | Engineering / DB | All database tables, column definitions, relationships, encryption schema |
| [API_REFERENCE.md](API_REFERENCE.md) | Engineering / Frontend / Integration | All API endpoints, request/response shapes, auth requirements |
| [SECURITY.md](SECURITY.md) | Engineering / Compliance | Threat model, authentication design, data protection, outstanding issues |
| [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md) | Engineering | Why architectural choices were made (ADRs) |

---

## Quick Reference

### Two Products
| | Sponsor Licence Monitor | COS Check |
|---|---|---|
| **What** | Watches gov.uk sponsor register; alerts on changes | Forensically analyses a COS PDF for tampering |
| **Who** | Visa holders, HR teams, immigration advisers | Anyone verifying a COS document |
| **Pricing** | Starter £24.99/mo · Pro £49.99/mo · Unlimited £99.99/mo | Credit-based; Expert Review packages |
| **Core table** | `sponsor_canonical` | `verification_results` |
| **Key job** | `sponsorMonitorJob.ts` at 00:30 UTC Mon-Fri | Inline per-request in `pdfAnalyzer.ts` |

### Sponsor Monitor Pipeline (v2 — as of 2026-03-20)
```
Phase 1: discoverCsvUrl() → ensureTodaysArchive()   [qsv validate + 100k hard floor]
Phase 2: runCsvDiff(yesterday_fp.csv, today_fp.csv)  [csvdiff Go binary]
Phase 3: applyStateMachine(diff)                     [4-state: NEWLY_GRANTED/ACTIVE/GRACE_PERIOD/REMOVED_REVOKED]
Phase 4: notifyAffectedUsers() per change            [7 alertable change types]
Phase 5: generateHeadline() + monitor_job_runs audit
```

### Key Files
| File | Role |
|---|---|
| `server/routes.ts` | All API routes |
| `server/utils/sponsorMonitorJob.ts` | Daily cron — orchestrates 5-phase pipeline |
| `server/utils/sponsorStateMachine.ts` | 4-state reconciliation engine (replaces reconcile()) |
| `server/utils/csvArchiver.ts` | Phase 1 — CSV download, qsv validation, archive registry |
| `server/utils/binaryRunner.ts` | Phase 2 — csvdiff binary wrapper |
| `server/utils/csvFingerprintBuilder.ts` | Fingerprinted CSV builder + fingerprint set loader |
| `server/utils/notificationDispatcher.ts` | Multi-channel notification delivery |
| `server/utils/sponsorSearch.ts` | In-memory Fuse.js search index |
| `server/utils/sponsorListFetcher.ts` | gov.uk CSV URL discovery + DTO types (SponsorChange, ChangeType) |
| `server/services/pdfAnalyzer.ts` | PDF forensic analysis engine |
| `server/services/aiService.ts` | AI provider abstraction + fallback chain |
| `server/utils/tierConfig.ts` | Subscription tier feature gates |
| `server/db.ts` | Neon PostgreSQL pool + Drizzle ORM |
| `shared/schema.ts` | Full database schema (source of truth) |

### Binary Dependencies
| Binary | Source | Used in |
|---|---|---|
| `qsv` (Rust) | dathere/qsv | csvArchiver.ts — validate + count |
| `csvdiff` (Go) | aswinkarthik/csvdiff | binaryRunner.ts — fingerprinted CSV diff |

### First-Time Deployment
On first deploy the `sponsor_canonical` table will be empty. The first nightly run (or manual trigger via `POST /api/admin/sponsor-monitor/run`) will automatically detect no yesterday archive and use `buildFirstRunDiff()` to seed `sponsor_canonical` with all current register records as `NEWLY_GRANTED`.

> **Note:** The old `POST /api/admin/migrate-canonical` and `POST /api/admin/sponsor-monitor/cleanup` routes now return **410 Gone** — they are no longer needed.

### Incident Response
Playbooks for common incidents:

| Incident | First check |
|---|---|
| Blank search results | `GET /api/admin/sponsor-monitor/status` — check `snapshotRecordCount` |
| Daily cron failed | `GET /api/admin/sponsor-monitor/job-history` — check `errorMessage` |
| Record count abort | Admin alert email received — check gov.uk CSV manually |
| Notifications not sent | `GET /api/admin/sponsor-monitor/notification-stats` — check failed counts |
| csvdiff binary missing | Job will fail at Phase 2 — install csvdiff binary |
| qsv binary missing | Phase 1 degrades gracefully — install qsv for full validation |

### Deprecated / Removed
| Item | Status | Replacement |
|---|---|---|
| `sponsor_list` DB table | Deprecated 2026-03-20, DROP after 2026-04-20 | `csv_archive` + `sponsor_canonical` |
| `reconcile()` function | Deleted | `applyStateMachine()` in sponsorStateMachine.ts |
| `downloadAndStreamSponsorList()` | @deprecated | `ensureTodaysArchive()` in csvArchiver.ts |
| Backup 4h cron | Removed | DB idempotency check in runJobCore() |
| Startup 15s catch-up | Removed | DB idempotency check in runJobCore() |
| `POST /api/admin/migrate-canonical` | 410 Gone | First-run auto-seeding via buildFirstRunDiff() |
| `POST /api/admin/sponsor-monitor/cleanup` | 410 Gone | No longer needed |
