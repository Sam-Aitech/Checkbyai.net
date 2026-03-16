# Product Requirements Document (PRD)
# checkbyai.net
**Version:** 1.0 | **Status:** Live | **Last Updated:** 2026-03-16

---

## 1. Product Overview

checkbyai.net is a UK immigration compliance SaaS platform with two distinct products sold separately and as bundles:

| Product | Purpose |
|---|---|
| **Sponsor Licence Monitor** | Watches the UK Home Office Register of Licensed Sponsors for changes (removals, downgrades, upgrades) and alerts users in real-time |
| **COS Check** | Forensically analyses a Certificate of Sponsorship PDF for signs of tampering, fabrication, or editing |

The platform targets individuals on UK work visas, immigration advisers, HR compliance teams, and legal professionals who need reliable, automated monitoring of sponsorship status.

---

## 2. Problem Statement

### 2.1 Sponsor Licence Monitor
The Home Office publishes the Register of Licensed Sponsors as a CSV file on gov.uk. It is updated without notice and there is no official API or alerting mechanism. Visa holders and advisers must manually check the register — a CSV with 80,000+ rows — to detect if a sponsor has been removed or downgraded. A removal means the employer can no longer legally sponsor workers. Affected employees may lose their right to remain in the UK. Missing this change by even a few days can be catastrophic.

### 2.2 COS Check
Fraudulent Certificates of Sponsorship are a known vector for immigration fraud. A fake COS can be used to obtain a Skilled Worker visa. Detecting document tampering requires forensic PDF metadata analysis (XMP history, producer chain, edit software markers) that non-specialists cannot perform manually.

---

## 3. User Personas

### P1 — The Sponsored Worker
- On a Skilled Worker or other work visa
- Watches 1–2 companies (current employer + previous)
- Primary concern: will I lose my right to work?
- Willing to pay for peace of mind

### P2 — The Immigration Adviser / Consultant
- Manages 10–100+ client cases
- Watches multiple companies simultaneously
- Needs immediate alerts, not same-day
- Needs API access and webhooks for CRM integration
- Likely to take an Unlimited or Enterprise plan

### P3 — The HR Compliance Manager
- Responsible for ensuring the company's own sponsor licence is in order
- Watches competitors' licences to understand market moves
- Needs weekly digest reports
- Pro or Unlimited plan

### P4 — The Individual Verifying a COS
- Received a COS document and wants to verify it is genuine
- May be a job applicant, a prospective employee, or a suspicious third party
- One-time or low-frequency usage
- COS Check credit-based model

---

## 4. Feature Requirements

### 4.1 Sponsor Licence Monitor

#### FR-SM-01: Company Watch
- A user can add a company to their watchlist by name
- Fuzzy matching (Fuse.js, threshold 0.3) surfaces the correct canonical record
- Watch limits enforced by subscription tier (free=1, starter=2, pro=5, unlimited/enterprise=unlimited)

#### FR-SM-02: Change Detection
- The system downloads the gov.uk sponsor register CSV daily at 00:30 UTC
- Changes detected: ADDED, REMOVED, DOWNGRADED, UPGRADED, ROUTE_CHANGE, NAME_CHANGE, NEW_LICENCE
- A company is confirmed REMOVED only after 2 consecutive daily misses (prevents false positives from gov.uk data hiccups)

#### FR-SM-03: Notifications
- Channels: email (all paid tiers), WhatsApp (starter+), SMS (pro+)
- Alert timing: Free = next morning 8am UTC, Starter = same-day 6pm UTC, Pro/Unlimited/Enterprise = immediate
- Rate limit: max 10 notifications per user per 24 hours
- Phone numbers stored AES-256-GCM encrypted with `enc:` prefix; verified via OTP before use
- NAME_CHANGE events are logged but not user-notified (too noisy, low risk)

#### FR-SM-04: Sponsor History
- Users can view the full change history for any watched company
- History includes all change types, timestamps, and previous/new values

#### FR-SM-05: Free Search
- Anonymous users may search the sponsor register once per day per IP
- Authenticated users on any paid plan get unlimited search

#### FR-SM-06: Job Alerts (Pro+)
- Pro and above users receive weekly digests of job openings at their watched companies
- Jobs are scraped from multiple boards via a Python FastAPI backend
- Deduplication via content hash; stored in `job_listings` table

#### FR-SM-07: Companies House Enrichment (Pro+)
- Pro+ notification emails include an "Intelligence" block with Companies House data
- Data cached for 7 days per fingerprint in `sponsor_enrichment` table
- Scrape rate-limited to 1 request per 2 seconds

### 4.2 COS Check

#### FR-COS-01: Document Upload
- Accepts PDF files only, max 10MB
- File is permanently deleted immediately after analysis
- Document hash (SHA-256) recorded for audit trail — document content is never stored

#### FR-COS-02: Forensic Analysis
- Extracts: PDF producer, creator, creation/modification dates, fonts, XMP edit history, encryption status, digital signatures
- Detects suspicious software: Photoshop, GIMP, Canva, Inkscape, LibreOffice Draw, PDFsam, SmallPDF
- Validates against known genuine producers: Microsoft Word, Adobe Acrobat, UK Government tools
- Checks date consistency (modification date before creation date is a red flag)
- Compares against admin-uploaded trusted patterns

#### FR-COS-03: AI Scoring
- Document metadata sent to AI provider (OpenAI → Claude → DeepSeek fallback chain)
- Confidence score 0–100 returned
- Global AI rules from `global_ai_rules` table applied to all verifications
- Pattern-specific AI instructions applied when pattern match found

#### FR-COS-04: Result Classification
- Genuine: confidence > 85%
- Suspicious: confidence 40–85%
- Fake: confidence < 40% or critical forensic failure (e.g., Photoshop detected in XMP history)

#### FR-COS-05: Receipt & Audit Trail
- Each verification produces a unique Receipt ID, Document Hash, and Integrity Hash
- Receipt accessible via `/api/receipt/:receiptId`
- Tamper-proof: integrity hash covers result + metadata

#### FR-COS-06: Human-in-the-Loop (HITL)
- Admins can override any AI result via the admin panel
- Admin feedback (adminStatus, adminFeedback, adminReviewedBy) stored in `verification_results`
- Feedback injected into future AI prompts for the same document patterns

#### FR-COS-07: Expert Review (Master Package)
- Users can submit for expert human review (24-hour SLA)
- Two package types: normal (£19.99) and full (£49.99)
- Managed via `paid_submissions` and `expert_requests` tables
- Expert verdict stored in `expertVerdict` field

#### FR-COS-08: Beta Gate
- COS Check is in closed beta
- `cosCheckApproved` boolean on `users` table controls access
- Admin approves/revokes via `PATCH /api/admin/users/:id/cos-approval`
- Approval sends confirmation email via Resend

### 4.3 Authentication & Accounts

#### FR-AUTH-01: Email OTP
- User enters email → receives 6-digit OTP (10-minute expiry) via Resend
- CAPTCHA (Cloudflare Turnstile) on OTP send endpoint
- Rate limited: 5 OTP requests per 15 minutes per IP

#### FR-AUTH-02: Google OAuth
- Sign in with Google via Passport.js Google OAuth 2.0 strategy
- New accounts automatically created on first OAuth sign-in

#### FR-AUTH-03: Admin Access
- Admin login via OTP only — password authentication disabled for admin
- Admin email must match `ADMIN_EMAIL` environment variable
- Admin role stored in `users.role` = 'admin'

### 4.4 Subscription & Billing

#### FR-BILL-01: Stripe Integration
- Subscriptions and one-time purchases via Stripe Checkout
- Checkout session signed with HMAC to prevent tampering
- Webhook handler processes: `checkout.session.completed`, `customer.subscription.updated/deleted`
- Idempotency: `processed_checkouts` table prevents duplicate credit grants on webhook replay

#### FR-BILL-02: Credit System
- COS Check verifications consume credits
- Credits purchasable in packs
- `users.credits` field tracks balance

---

## 5. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Sponsor register checked | Daily at 00:30 UTC |
| Notification delivery (Pro+) | Within 5 minutes of cron completion |
| COS Check turnaround | Under 30 seconds |
| CSV download retry | 3 attempts, staged 5min/15min delays |
| API availability | 99.5% uptime (health endpoint monitored) |
| PDF storage | Zero — deleted immediately post-analysis |
| Phone data encryption | AES-256-GCM at rest |
| Session security | HttpOnly, Secure, SameSite=Lax, 7-day TTL |

---

## 6. Out of Scope

- Real-time register polling (gov.uk does not support it; daily is the correct cadence)
- Direct Home Office API integration (no public API exists)
- Legal immigration advice (system is a technical tool only; OISC referral shown in UI)
- Storage of COS document images or full text (privacy requirement)

---

## 7. Success Metrics

| Metric | Measurement |
|---|---|
| Monitor job success rate | `monitor_job_runs.status = 'success'` daily count |
| Notification delivery rate | `notification_log.status = 'sent'` / total dispatched |
| COS Check accuracy | Admin HITL override rate (lower = better) |
| Search index availability | `isIndexReady()` = true at all times post-startup |
| Stripe checkout conversion | `processed_checkouts` count vs. checkout sessions created |
