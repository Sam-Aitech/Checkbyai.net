# checkbyai.net — Documentation Index
**Last Updated:** 2026-03-16

---

## Documents

| Document | Audience | Purpose |
|---|---|---|
| [PRD.md](PRD.md) | Product / Engineering | What the product does, user personas, feature requirements, success metrics |
| [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) | Engineering | Full architecture, component deep-dives, data flows, external service integrations |
| [DATA_MODEL.md](DATA_MODEL.md) | Engineering / DB | All database tables, column definitions, relationships, encryption schema |
| [API_REFERENCE.md](API_REFERENCE.md) | Engineering / Frontend / Integration | All API endpoints, request/response shapes, auth requirements |
| [SECURITY.md](SECURITY.md) | Engineering / Compliance | Threat model, authentication design, data protection, outstanding issues |
| [RUNBOOK.md](RUNBOOK.md) | Engineering / Ops | Deployment, first-time setup, incident playbooks, monitoring checklist |
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
| **Key job** | `sponsorMonitorJob.ts` at 00:30 UTC | Inline per-request in `pdfAnalyzer.ts` |

### Key Files
| File | Role |
|---|---|
| `server/routes.ts` | All API routes (4000+ lines) |
| `server/utils/sponsorMonitorJob.ts` | Daily cron reconciliation engine |
| `server/utils/notificationDispatcher.ts` | Multi-channel notification delivery |
| `server/utils/sponsorSearch.ts` | In-memory Fuse.js search index |
| `server/utils/sponsorListFetcher.ts` | gov.uk CSV download + parsing |
| `server/services/pdfAnalyzer.ts` | PDF forensic analysis engine |
| `server/services/aiService.ts` | AI provider abstraction + fallback chain |
| `server/utils/tierConfig.ts` | Subscription tier feature gates |
| `server/db.ts` | Neon PostgreSQL pool + Drizzle ORM |
| `shared/schema.ts` | Full database schema (source of truth) |

### First-Time Deployment
See [RUNBOOK.md §1.2](RUNBOOK.md) for the complete first-time deployment checklist. The critical step most often missed: **run `POST /api/admin/migrate-canonical` after first deploy** — without this, the `sponsor_canonical` table is empty and all searches return blank.

### Incident Response
See [RUNBOOK.md §5](RUNBOOK.md) for playbooks covering:
- Blank search results
- Daily cron failed
- Notifications not sent
- Stripe webhook not processing
- AI analysis failing
- Database connection failures
