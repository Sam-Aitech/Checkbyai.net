# Data Model Document
# checkbyai.net
**Version:** 2.0 | **Last Updated:** 2026-03-20

---

## 1. Entity Relationship Overview

```
users ──────────────────────────────────────────┐
  │                                              │
  ├─── verification_results (1:N)               │
  ├─── ip_verifications (by IP)                 │
  ├─── company_watches (1:N)                    │
  ├─── notification_preferences (1:1)           │
  ├─── notification_log (1:N)                   │
  ├─── paid_submissions (1:N)                   │
  ├─── expert_requests (1:N)                    │
  └─── job_alert_preferences (1:N)              │
                                                │
sponsor_canonical ──────────────────────────────┤
  │ (fingerprint = stable identity)             │
  ├─── sponsor_changes (1:N)                    │
  ├─── company_watches (via fingerprint)        │
  ├─── sponsor_enrichment (1:1)                 │
  └─── job_listings (1:N)                       │
                                                │
csv_archive ─────────────────────────────────── │
  └─── one row per day (Phase 1 output)         │
                                                │
diff_results ──────────────────────────────────  │
  └─── one row per nightly run (Phase 2 audit)  │
                                                │
notification_log ────────────────────────────── │
  └─── sponsor_changes (via changeId FK)        │

sponsor_list [DEPRECATED 2026-03-20]
  └─── No new writes. Schedule DROP after 2026-04-20.
```

---

## 2. Table Definitions

### 2.1 `users`
Primary user identity table. Supports multiple authentication providers.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | text | PK | UUID or 'admin_primary' for the admin user |
| `username` | text | — | Display name |
| `email` | text | unique | Primary email address |
| `phone` | text | — | AES-256-GCM encrypted phone (`enc:` prefix) |
| `hashedPassword` | text | — | bcrypt hash (legacy, not used for new accounts) |
| `googleId` | text | unique | Google OAuth subject identifier |
| `authProvider` | text | — | 'google' \| 'email' \| 'admin' |
| `role` | text | default 'user' | 'user' \| 'admin' |
| `subscriptionStatus` | text | default 'free' | 'free' \| 'starter' \| 'pro' \| 'unlimited' \| 'enterprise' |
| `credits` | integer | default 0 | COS Check credit balance |
| `verificationLimit` | integer | default 3 | Legacy verification limit |
| `isVerified` | boolean | default false | Email/phone verified flag |
| `cosCheckApproved` | boolean | default false | Beta gate for COS Check |
| `stripeCustomerId` | text | — | Stripe Customer ID |
| `stripeSubscriptionId` | text | — | Stripe active Subscription ID |
| `verificationCode` | text | — | Current OTP (6 digits, cleared after use) |
| `verificationExpiry` | timestamp | — | OTP expiry (10 minutes from send) |
| `createdAt` | timestamp | default now() | Account creation time |
| `updatedAt` | timestamp | default now() | Last modification time |

**Indexes:** `stripeCustomerId`, `role`

---

### 2.2 `sessions`
Express session store. Managed by `connect-pg-simple`.

| Column | Type | Description |
|---|---|---|
| `sid` | text PK | Session ID |
| `sess` | jsonb | Serialized session data |
| `expire` | timestamp | Session expiry (7 days from creation) |

---

### 2.3 `ip_verifications`
Rate-limiting table for anonymous users. Tracks verification attempts by hashed IP.

| Column | Type | Description |
|---|---|---|
| `id` | serial PK | — |
| `ipHash` | text | SHA-256 + salt hash of client IP |
| `count` | integer | Number of verifications from this IP today |
| `date` | text | ISO date string (YYYY-MM-DD) |

---

### 2.4 `verification_results`
COS Check analysis results. Documents are never stored; only metadata and results.

| Column | Type | Description |
|---|---|---|
| `id` | serial PK | — |
| `userId` | text | FK → users.id (nullable for anonymous) |
| `filename` | text | Original filename (no content stored) |
| `result` | text | 'genuine' \| 'suspicious' \| 'fake' |
| `confidence` | integer | 0–100 AI confidence score |
| `metadata` | jsonb | Extracted PDF metadata (producer, dates, fonts, XMP) |
| `analysisDetails` | jsonb | Forensic analysis breakdown |
| `documentHash` | text | SHA-256 of the original file bytes |
| `receiptId` | text | unique | 12-char nanoid for public receipt lookup |
| `integrityHash` | text | HMAC-SHA256 of result + metadata + receiptId |
| `adminStatus` | text | 'pending' \| 'approved' \| 'overridden' (HITL) |
| `adminFeedback` | text | Admin override reasoning |
| `adminReviewedBy` | text | Admin user ID who reviewed |
| `adminReviewedAt` | timestamp | Time of admin review |
| `createdAt` | timestamp | Verification timestamp |

---

### 2.5 `trusted_patterns`
Admin-uploaded genuine COS documents used as reference templates.

| Column | Type | Description |
|---|---|---|
| `id` | serial PK | — |
| `filename` | text | Reference document filename |
| `metadata` | jsonb | Metadata from the genuine document |
| `patterns` | jsonb | Extracted structural patterns |
| `aiInstructions` | text | Pattern-specific AI instructions injected into prompts |
| `createdAt` | timestamp | Upload time |

---

### 2.6 `global_ai_rules`
System-wide AI rules applied to all COS verifications.

| Column | Type | Description |
|---|---|---|
| `id` | serial PK | — |
| `category` | text | Rule category (e.g., 'metadata', 'software', 'dates') |
| `ruleText` | text | Rule description injected into AI prompt |
| `priority` | integer | Sort order (lower = higher priority) |
| `isActive` | boolean | Whether rule is active |
| `createdAt` | timestamp | — |

---

### 2.7 `feedback`
User feedback on verification accuracy.

| Column | Type | Description |
|---|---|---|
| `id` | serial PK | — |
| `verificationId` | integer | FK → verification_results.id |
| `userId` | text | FK → users.id |
| `rating` | integer | 1–5 star rating |
| `comment` | text | Free-text feedback |
| `helpful` | boolean | Was the result helpful? |
| `accuracy` | boolean | Was the result accurate? |
| `suggestedResult` | text | User's suggested correct result |
| `createdAt` | timestamp | — |

---

### 2.8 `sponsor_canonical`
**Single source of truth** for all UK sponsors. One row per unique company identity (stable across renames).

| Column | Type | Description |
|---|---|---|
| `id` | serial PK | — |
| `fingerprint` | text | unique | `normalize(name)\|normalize(city)\|lowercase(route)` |
| `currentName` | text | Most recent name from gov.uk register |
| `townCity` | text | Town/city |
| `typeRating` | text | 'A-Rating' \| 'B-Rating' \| 'Provisional' |
| `route` | text | 'Worker' \| 'Temporary Worker' |
| `status` | text | `'ACTIVE'` \| `'NEWLY_GRANTED'` \| `'GRACE_PERIOD'` \| `'REMOVED_REVOKED'` |
| `firstSeen` | text | ISO date when first appeared on register |
| `lastSeen` | text | ISO date of last confirmation on register |
| `grantedAt` | text | ISO date of most recent licence grant |
| `removedAt` | timestamp | When status transitioned to REMOVED_REVOKED |
| `consecutiveMisses` | integer | Days absent from CSV in a row |
| `historicalNames` | text[] | Previous names (for search and audit trail) |

**Indexes:** `fingerprint` (unique), `status`

**Status transitions:**
- `ACTIVE` → `GRACE_PERIOD` (absent day 1, consecutiveMisses=1)
- `GRACE_PERIOD` → `REMOVED_REVOKED` (absent day 2, consecutiveMisses≥2)
- `REMOVED_REVOKED` → `NEWLY_GRANTED` (reappears on register: RE_ACTIVATED)
- Any → `ACTIVE` (confirmed present in today's fingerprint set)
- New fingerprint → `NEWLY_GRANTED` (NEW_LICENCE)

**Design rationale:** The fingerprint provides stable identity across name changes. When a company renames, the `fingerprint` column is updated on the existing row and the old name is appended to `historicalNames`. This preserves watch continuity.

---

### 2.9 `csv_archive` *(Phase 1 output — replaces sponsor_list as the download registry)*
Registry of downloaded and validated Gov.uk CSV files. One row per day.

| Column | Type | Description |
|---|---|---|
| `id` | serial PK | — |
| `snapshotDate` | date | unique | ISO date (YYYY-MM-DD) |
| `filePath` | text | Absolute path to raw CSV on disk (`data/archives/`) |
| `recordCount` | integer | Validated row count (from qsv or streaming fallback) |
| `checksumSha256` | text | SHA-256 of the downloaded file |
| `sourceUrl` | text | Gov.uk CSV URL that was downloaded |
| `isValid` | boolean | default true | False if record count was below minimum threshold |
| `downloadedAt` | timestamp | Download completion time |

**Indexes:** `snapshotDate` (unique)

**Note:** The corresponding fingerprinted CSV lives at `data/archives/YYYY-MM-DD_sponsors_fp.csv` and is the direct input to `csvdiff`.

---

### 2.10 `diff_results` *(Phase 2 audit — csvdiff output summary)*
Audit log of each nightly diff run. One row per calendar day.

| Column | Type | Description |
|---|---|---|
| `id` | serial PK | — |
| `runDate` | date | unique | ISO date (YYYY-MM-DD) |
| `addedCount` | integer | Additions detected by csvdiff |
| `removedCount` | integer | Deletions detected by csvdiff |
| `attributeChangeCount` | integer | Modifications (rating/route/name changes) |
| `diffDurationMs` | integer | Time taken by csvdiff binary |
| `diffJsonPath` | text | Optional path to raw diff JSON file for audit/replay |

---

### 2.11 `company_watches`
User watchlist — which users are watching which companies.

| Column | Type | Description |
|---|---|---|
| `id` | serial PK | — |
| `userId` | text | FK → users.id |
| `organisationName` | text | Display name (from search result) |
| `organisationNameNormalized` | text | Normalized name for change matching |
| `fingerprint` | text | FK → sponsor_canonical.fingerprint |
| `isActive` | boolean | Whether the watch is active |
| `createdAt` | timestamp | — |

**Note:** Notifications are matched by `organisationNameNormalized`, not by fingerprint. This is intentional — if the company renames, the new fingerprint is different but the normalized name may still partially match.

---

### 2.12 `sponsor_changes`
Immutable log of all detected changes on the sponsor register.

| Column | Type | Description |
|---|---|---|
| `id` | serial PK | — |
| `organisationName` | text | Company name at time of change |
| `fingerprint` | text | FK → sponsor_canonical.fingerprint |
| `changeType` | text | `'NEW_LICENCE'` \| `'RE_ACTIVATED'` \| `'REMOVED_REVOKED'` \| `'GRACE_PERIOD'` \| `'UPGRADED'` \| `'DOWNGRADED'` \| `'ROUTE_CHANGE'` \| `'NAME_CHANGE'` |
| `previousValue` | text | Previous rating/route/name |
| `newValue` | text | New rating/route/name |
| `snapshotDate` | text | ISO date when change was detected |
| `detectedAt` | timestamp | — |

**Alertable change types** (dispatched to users via notificationDispatcher):
`NEW_LICENCE`, `RE_ACTIVATED`, `REMOVED_REVOKED`, `GRACE_PERIOD`, `UPGRADED`, `DOWNGRADED`, `ROUTE_CHANGE`

**Non-alertable:** `NAME_CHANGE` — logged but not sent to users.

**Note:** `id` is populated by `batchedInsertChanges()` using `.returning()` and written back to the in-memory `SponsorChange` objects so `notifyAffectedUsers()` can use it as the `notificationLog.changeId` FK.

---

### 2.13 `notification_preferences`
Per-user notification channel settings. One row per user.

| Column | Type | Description |
|---|---|---|
| `id` | serial PK | — |
| `userId` | text | unique FK → users.id |
| `emailEnabled` | boolean | default true | Whether to receive email alerts |
| `email` | text | Override email (uses users.email if null) |
| `whatsappEnabled` | boolean | default false | — |
| `whatsappNumber` | text | AES-256-GCM encrypted WhatsApp number |
| `whatsappVerified` | boolean | Whether number has been OTP-verified |
| `smsEnabled` | boolean | default false | — |
| `smsNumber` | text | AES-256-GCM encrypted SMS number |
| `smsVerified` | boolean | Whether number has been OTP-verified |

---

### 2.14 `notification_log`
Immutable audit log of every notification dispatched or queued.

| Column | Type | Description |
|---|---|---|
| `id` | serial PK | — |
| `userId` | text | FK → users.id |
| `changeId` | integer | NOT NULL FK → sponsor_changes.id |
| `channel` | text | 'email' \| 'sms' \| 'whatsapp' |
| `status` | text | 'queued' \| 'sent' \| 'failed' \| 'skipped' |
| `sentAt` | timestamp | Actual delivery time (null if queued/failed) |
| `deliverAfter` | timestamp | Scheduled delivery time (for Starter/Free tier delays) |
| `providerMessageId` | text | Resend/Brevo/Twilio message ID for tracking |
| `errorDetails` | text | Error message if status='failed' |
| `createdAt` | timestamp | — |

**Usage pattern:** `notification_log` is queried by `processDelayedNotifications()` hourly for rows where `status='queued' AND deliverAfter <= NOW()`.

---

### 2.15 `sponsor_enrichment`
Companies House data cache. Sourced from Python backend scraper.

| Column | Type | Description |
|---|---|---|
| `id` | serial PK | — |
| `fingerprint` | text | unique FK → sponsor_canonical.fingerprint |
| `companyNumber` | text | Companies House registration number |
| `natureOfBusiness` | text | SIC code description |
| `registeredAddress` | text | Official registered address |
| `websiteUrl` | text | Company website (if found) |
| `scrapeStatus` | text | 'pending' \| 'success' \| 'not_found' \| 'error' |
| `scrapedAt` | timestamp | Cache timestamp |
| `updatedAt` | timestamp | — |

**TTL:** 7 days. Rows older than 7 days are re-fetched on next enrichment request.

---

### 2.16 `job_listings`
Deduplicated job postings scraped for watched companies.

| Column | Type | Description |
|---|---|---|
| `id` | serial PK | — |
| `fingerprint` | text | FK → sponsor_canonical.fingerprint |
| `title` | text | Job title |
| `location` | text | Job location |
| `salary` | text | Salary range (as scraped, unstructured) |
| `sourceBoard` | text | 'linkedin' \| 'indeed' \| 'cvlibrary' \| 'google' |
| `sourceUrl` | text | Original job posting URL |
| `contentHash` | text | SHA-256 of title+location+salary for deduplication |
| `firstSeen` | timestamp | — |
| `lastSeen` | timestamp | Updated on re-scrape if still active |
| `isActive` | boolean | — |

---

### 2.17 `job_alert_preferences`
Per-user job alert opt-in. Pro+ only.

| Column | Type | Description |
|---|---|---|
| `id` | serial PK | — |
| `userId` | text | FK → users.id |
| `fingerprint` | text | FK → sponsor_canonical.fingerprint |
| `enabled` | boolean | — |

---

### 2.18 `paid_submissions`
Expert review submissions for Master Package buyers.

| Column | Type | Description |
|---|---|---|
| `id` | serial PK | — |
| `userId` | text | FK → users.id |
| `email` | text | Contact email |
| `packageType` | text | 'normal' (£19.99) \| 'full' (£49.99) |
| `paymentStatus` | text | 'pending' \| 'paid' \| 'refunded' |
| `stripeSessionId` | text | unique | For idempotency |
| `cosDocumentPath` | text | Secure S3/storage path for submitted document |
| `reviewStatus` | text | 'pending' \| 'in_review' \| 'completed' |
| `assignedTo` | text | Admin user ID handling the review |
| `expertVerdict` | text | Expert's final determination |
| `reportPath` | text | Path to generated report document |
| *questionnaire fields* | text | Various intake questionnaire responses |
| `createdAt` | timestamp | — |

**Indexes:** `stripeSessionId`, `reviewStatus`, `email`

---

### 2.19 `processed_checkouts`
Stripe webhook idempotency table. Prevents duplicate credit grants on webhook replay.

| Column | Type | Description |
|---|---|---|
| `id` | serial PK | — |
| `stripeSessionId` | text | unique | Stripe Checkout Session ID |
| `processedAt` | timestamp | When checkout was fulfilled |

**Cleanup:** Rows older than 48 hours are deleted on server startup.

---

### 2.20 `daily_digest`
AI-generated daily headlines from sponsor register changes. One row per day.

| Column | Type | Description |
|---|---|---|
| `id` | serial PK | — |
| `snapshotDate` | text | unique | ISO date |
| `addedCount` | integer | Sponsors added that day |
| `updatedCount` | integer | Sponsors updated (rating/route/name) |
| `removedCount` | integer | Sponsors removed |
| `headlineGenerated` | text | Primary AI-generated headline |
| `headlineVariants` | jsonb | Array of 3 headline variants |
| `selectedVariantIndex` | integer | Which variant to display (0–2) |
| `displayedOnLanding` | boolean | Only one row has this true at any time |
| `aiModel` | text | Which AI model generated this digest |
| `generatedAt` | timestamp | — |

---

### 2.21 `monitor_job_runs`
Persistent audit log of sponsor monitor job executions. One row per calendar day.

| Column | Type | Description |
|---|---|---|
| `id` | serial PK | — |
| `runDate` | text | unique | ISO date (YYYY-MM-DD) |
| `source` | text | `'cron'` \| `'request'` \| `'manual'` |
| `status` | text | 'success' \| 'failed' |
| `recordsProcessed` | integer | Sponsors in that day's CSV |
| `changesDetected` | integer | Total changes found |
| `changeSummary` | jsonb | `{ REMOVED_REVOKED: 2, DOWNGRADED: 1, ... }` |
| `notificationsSent` | integer | — |
| `notificationsSkipped` | integer | — |
| `notificationsFailed` | integer | — |
| `durationMs` | integer | Job duration in milliseconds |
| `errorMessage` | text | Error details if status='failed' |
| `completedAt` | timestamp | — |

**Idempotency:** The job checks `status='success' AND runDate=today` before running. If found and `source='cron'`, the job skips. Manual triggers bypass this check.

---

### 2.22 `sponsor_list` *(DEPRECATED — no new writes as of 2026-03-20)*

> **Deprecated.** The `sponsor_list` table stored per-row snapshots of the Gov.uk CSV. It has been superseded by:
> - `csv_archive` — stores the raw CSV file path and metadata (Phase 1)
> - `sponsorCanonical` — the per-company state (maintained by the state machine)
>
> **Schedule: DROP TABLE sponsor_list after 2026-04-20** (30-day holdback for any remaining reads).
> Functions in `sponsorListFetcher.ts` marked `@deprecated`: `storeSnapshot`, `getLatestSnapshotDate`, `deleteOldSnapshots`, `downloadAndStreamSponsorList`, `downloadAndParseSponsorList`.

---

## 3. Phone Number Encryption Schema

All phone numbers (SMS and WhatsApp) are stored encrypted:
- **Algorithm:** AES-256-GCM
- **Key:** `PHONE_ENCRYPTION_KEY` environment variable
- **Format:** `enc:<base64(iv + ciphertext + authTag)>`
- **Detection:** Values starting with `enc:` are decrypted before use; plain values are passed through (migration compatibility)
- **Implementation:** `server/utils/phoneCrypto.ts`

---

## 4. Fingerprint Design

The fingerprint is the core identity mechanism for sponsors, and the primary key for `csvdiff` comparisons:

```typescript
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "")            // remove punctuation
    .replace(COMPANY_SUFFIXES, "")      // remove Ltd, PLC, LLP, etc.
    .replace(/\s+/g, " ")
    .trim();
}

fingerprint = `${normalizeName(name)}|${normalizeName(city)}|${route.toLowerCase().trim()}`
```

**Examples:**
| Input Name | City | Route | Fingerprint |
|---|---|---|---|
| `Acme Ltd` | `London` | `Worker` | `acme\|london\|worker` |
| `Acme Limited` | `London` | `Worker` | `acme\|london\|worker` |
| `Acme Holdings PLC` | `Manchester` | `Worker` | `acme holdings\|manchester\|worker` |

Note: `Acme Ltd` and `Acme Limited` produce the same fingerprint. `Acme Holdings PLC` does not — "holdings" is not in the suffix strip list.

The fingerprinted CSV (`*_sponsors_fp.csv`) prepends the `fingerprint` column to every row, enabling `csvdiff` to detect additions, deletions, and modifications purely by fingerprint key.

---

## 5. Data Retention & Privacy

| Data | Retention | Legal Basis |
|---|---|---|
| Uploaded COS documents | Deleted immediately after analysis | Minimal necessary (UK GDPR Article 5(1)(c)) |
| Verification results (metadata only) | Indefinite (user may request deletion) | Contract performance |
| CSV archive files (disk) | Rolling — retain yesterday + today minimum | Operational need (csvdiff requires T-1) |
| sponsor_list DB rows | DEPRECATED — freeze, DROP after 2026-04-20 | Retired |
| Session data | 7 days | Authentication |
| Notification logs | Indefinite (audit trail) | Legitimate interest |
| Phone numbers | Until user deletes notification preferences | Consent |
| Processed checkouts | 48 hours | Idempotency / fraud prevention |
