# API Reference
# checkbyai.net
**Version:** 1.1 | **Base URL:** `https://checkbyai.net` | **Last Updated:** 2026-03-20

---

## Authentication

All authenticated endpoints require an active session cookie established via the auth endpoints below. The session cookie is HttpOnly, Secure, SameSite=Lax with a 7-day TTL.

Admin endpoints additionally require `role = 'admin'` on the user record.

---

## Rate Limits

| Limiter | Applies To | Limit |
|---|---|---|
| `authLimiter` | `/api/auth/login` | 10 req / 15 min per IP |
| `otpLimiter` | All `/api/auth/*/send-otp` and `*/verify-otp` | 5 req / 15 min per IP |
| `verifyLimiter` | `POST /api/verify` | 10 req / 1 hour per IP |
| `feedbackLimiter` | `POST /api/feedback` | 3 req / 15 min per IP |

---

## 1. Health & SEO

### `GET /api/health`
Returns system status including sponsor monitor job state.

**Response 200:**
```json
{
  "status": "ok",
  "timestamp": "2026-03-16T00:35:22.000Z",
  "sponsorMonitor": {
    "lastRunDate": "2026-03-16",
    "lastRunSuccess": true,
    "lastRunRecordsProcessed": 82341,
    "indexReady": true
  }
}
```

---

## 2. Authentication

### `POST /api/auth/email/send-otp`
Sends a 6-digit OTP to the specified email. Requires Cloudflare Turnstile token when `TURNSTILE_SECRET_KEY` is configured.

**Rate limit:** `otpLimiter`

**Body:**
```json
{
  "email": "user@example.com",
  "turnstileToken": "0.abc..."
}
```

**Responses:**
- `200` — OTP sent
- `400` — Invalid email format
- `429` — Rate limit exceeded

---

### `POST /api/auth/email/verify-otp`
Verifies the OTP and establishes a session.

**Body:**
```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

**Responses:**
- `200` — `{ user: { id, email, role, subscriptionStatus, credits } }`
- `400` — Invalid OTP or expired
- `429` — Rate limit exceeded

---

### `GET /api/auth/google`
Redirects to Google OAuth consent screen.

### `GET /api/auth/google/callback`
Google OAuth callback. Redirects to `/sponsor-monitor` on success.

---

### `POST /api/auth/logout`
Destroys the current session.

**Response:** `200 { message: "Logged out" }`

---

### `GET /api/auth/user`
Returns the currently authenticated user.

**Auth required:** Yes

**Response 200:**
```json
{
  "id": "usr_abc123",
  "email": "user@example.com",
  "role": "user",
  "subscriptionStatus": "pro",
  "credits": 5,
  "cosCheckApproved": true,
  "createdAt": "2025-11-01T10:00:00.000Z"
}
```

**Response 401:** Not authenticated

---

## 3. COS Check

COS Check combines AI-powered document analysis with the **Metadata Inspector (MIS)** — a forensic scanner that detects PDF tampering by analyzing metadata, XMP fields, incremental updates, and editing tool fingerprints.

### `POST /api/verify`
Uploads and forensically analyses a COS PDF document.

**Auth:** Optional (anonymous users limited by IP)
**Rate limit:** `verifyLimiter` (10/hour per IP)
**Content-Type:** `multipart/form-data`

**Form fields:**
| Field | Type | Required | Description |
|---|---|---|---|
| `document` | file | Yes | PDF file, max 10MB |

**Response 200:**
```json
{
  "result": "genuine",
  "confidence": 91,
  "receiptId": "abc123def456",
  "analysisDetails": {
    "producer": "Microsoft Word",
    "suspicious": false,
    "dateConsistent": true,
    "xmpHistory": [],
    "fonts": ["Calibri", "Arial"]
  },
  "cosCheck": {
    "verdict": "GENUINE",
    "reason": null,
    "checks": [
      { "name": "Apache FOP Producer", "passed": true, "detail": "OK" },
      { "name": "XMP Fields Present", "passed": true, "detail": "All 8 fields found" },
      { "name": "XMP Field Order", "passed": true, "detail": "Correct order" },
      { "name": "Info/XMP Consistency", "passed": true, "detail": "Metadata matches" },
      { "name": "Incremental Updates", "passed": true, "detail": "No modifications" },
      { "name": "Editing Tool Fingerprint", "passed": true, "detail": "No suspicious tools" }
    ],
    "xmpTags": {
      "dc:date": "2025-11-01",
      "dc:format": "application/pdf",
      "dc:language": "en",
      "pdf:PDFVersion": "1.5",
      "pdf:Producer": "Apache FOP 2.8",
      "xmp:CreateDate": "2025-11-01T10:00:00Z",
      "xmp:CreatorTool": "Apache FOP 2.8",
      "xmp:MetadataDate": "2025-11-01T10:00:00Z"
    },
    "docStats": {
      "pages": 2,
      "characters": 2450,
      "words": 310,
      "fileSizeBytes": 125480
    },
    "forensic": {
      "incrementalUpdates": 0,
      "infoXmpConsistency": "MATCH",
      "toolFingerprint": "None detected",
      "suspiciousIndicators": []
    }
  },
  "creditsRemaining": 4
}
```

**`result` values:** `"genuine"` | `"suspicious"` | `"fake"`

**`cosCheck` field:**
Metadata Inspector result (when user has COS Check access). For non-admin users, only `verdict` and `reason` are returned. Admin users see full forensic details including all 6 checks, XMP tags, PDF properties, document stats, and suspicious indicators.

- `verdict`: `"GENUINE"` | `"EDITED"` — PDF authenticity status
- `reason`: Null if GENUINE; otherwise a brief reason (e.g., "missing dc:language, xmp:MetadataDate")
- `checks`: Array of 6 authenticity checks (Apache FOP producer, XMP fields present, XMP field order, info/XMP consistency, incremental updates, editing tool fingerprint)
- Admin-only fields: `xmpTags`, `pdfProperties`, `docStats`, `forensic`

**Response 400:**
```json
{ "message": "Only PDF files are accepted." }
```

**Response 402:**
```json
{ "message": "Insufficient credits. Please purchase more to continue." }
```

**Response 503:**
```json
{ "message": "AI service temporarily unavailable. Please try again shortly." }
```

---

### `GET /api/receipt/:receiptId`
Retrieves a verification receipt by ID. No authentication required.

**Response 200:**
```json
{
  "receiptId": "abc123def456",
  "result": "genuine",
  "confidence": 91,
  "filename": "cos-document.pdf",
  "documentHash": "sha256:e3b0c44298...",
  "integrityHash": "hmac:f7c3bc...",
  "createdAt": "2026-03-15T14:22:00.000Z"
}
```

**Response 404:** Receipt not found

---

### `GET /api/my-verifications`
Returns the authenticated user's verification history.

**Auth required:** Yes

**Response 200:**
```json
[
  {
    "id": 42,
    "result": "fake",
    "confidence": 12,
    "filename": "document.pdf",
    "receiptId": "xyz789",
    "createdAt": "2026-03-10T09:00:00.000Z"
  }
]
```

---

### `POST /api/feedback`
Submit user feedback on verification accuracy. Rate-limited to 3 requests per 15 minutes.

**Rate limit:** `feedbackLimiter` — 3 req / 15 min per IP

**Request body:**
```json
{
  "verificationId": 42,
  "rating": 4,
  "comment": "The analysis was very thorough and accurate.",
  "helpful": true,
  "accuracy": "accurate",
  "suggestedResult": "genuine"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `verificationId` | integer | No | FK → verification_results.id |
| `rating` | integer | Yes | 1–5 star rating |
| `comment` | text | No | Free-text feedback |
| `helpful` | boolean | No | Was the analysis helpful? |
| `accuracy` | text | No | 'accurate' \| 'inaccurate' \| 'unsure' |
| `suggestedResult` | text | No | User's suggested result |

When authenticated via session cookie, `userId` is set automatically from the session.

**Response 201:**
```json
{
  "id": 1,
  "verificationId": 42,
  "userId": "abc123",
  "rating": 4,
  "comment": "The analysis was very thorough and accurate.",
  "helpful": true,
  "createdAt": "2026-05-18T12:00:00.000Z"
}
```

---

## 4. Sponsor Monitor — Search

### `GET /api/sponsors/free-search?q={query}`
Free sponsor search. Unlimited for all users (30 req/min per IP). Returns only ACTIVE and NEWLY_GRANTED sponsors.

**Query params:**
| Param | Required | Description |
|---|---|---|
| `q` | Yes | Search query (min 3 characters) |

**Response 200:**
```json
{
  "results": [
    {
      "fingerprint": "acme|london|worker",
      "organisationName": "Acme Ltd",
      "townCity": "London",
      "typeRating": "A-Rating",
      "route": "Worker",
      "status": "ACTIVE",
      "matchScore": 94,
      "historicalNames": []
    }
  ],
  "searchesRemaining": 0
}
```

**Response 429:** Rate limit exceeded

**Response 503:** Search index not yet available (building post-startup)

---

### `GET /api/sponsors/historical-search?q={query}`
Searches REMOVED_REVOKED sponsors using pg_trgm trigram similarity. Called client-side only when `free-search` returns 0 results — lets users find revoked companies and see conversion CTAs. Rate limited (same limiter as free-search, 30 req/min per IP).

**Query params:**
| Param | Required | Description |
|---|---|---|
| `q` | Yes | Search query (min 3 characters) |

**Response 200:**
```json
{
  "results": [
    {
      "id": 1234,
      "fingerprint": "beesocialize|london|worker",
      "organisationName": "Beesocialize Ltd",
      "townCity": "London",
      "typeRating": null,
      "route": "Worker",
      "status": "REMOVED_REVOKED",
      "matchScore": 91,
      "grantedAt": "2021-05-12",
      "removedAt": "2024-11-03",
      "isNew": false,
      "historicalNames": [],
      "source": "db"
    }
  ]
}
```

---

### `GET /api/sponsors/search?q={query}`
Authenticated sponsor search. Unlimited for paid users.

**Auth required:** Yes

**Response 200:** Same structure as free-search, without `searchesRemaining`.

---

### `GET /api/sponsors/search-index.json`
Returns the full client-side instant-search index as a compact JSON array. Used by the browser for zero-latency search. Gzip-compressed (~1.5 MB). Cached 12hr in Redis + CDN. Contains only ACTIVE and NEWLY_GRANTED sponsors.

**Auth required:** No

**Response 200:** `[{ "id": 1, "n": "Acme Ltd", "c": "London", "r": "Worker", "t": "A-Rating", "s": "ACTIVE" }, ...]`

---

### `GET /api/sponsors/nightly-stats`
Live stats for the homepage bar. Returns active sponsor count, last run date, and change counts from the most recent daily digest. Also returns `revokedLast12Months` — count of REMOVED_REVOKED sponsors whose licence was revoked in the past 12 months. Cached 1hr.

**Auth required:** No

**Response 200:**
```json
{
  "totalActive": 124321,
  "lastRunDate": "2026-04-01",
  "addedCount": 12,
  "removedCount": 3,
  "changesCount": 8,
  "revokedLast12Months": 1847
}
```

---

### `GET /api/sponsors/recently-revoked`
Returns the 7 most recently revoked sponsors for the homepage widget. Cached 1hr.

**Auth required:** No

**Response 200:**
```json
[
  { "id": 9001, "currentName": "Acme Ltd", "townCity": "Leeds", "route": "Worker", "removedAt": "2026-03-29" }
]
```

---

### `GET /api/sponsors/detail/:id`
Returns full sponsor detail including enrichment data, recent changes preview (3 most recent), and total changes count. REMOVED_REVOKED sponsors are returned — no status filter. Cached 1hr in Redis.

**Auth required:** No

**Response 200:**
```json
{
  "id": 1234,
  "fingerprint": "acme|london|worker",
  "currentName": "Acme Ltd",
  "townCity": "London",
  "status": "ACTIVE",
  "grantedAt": "2020-06-15",
  "removedAt": null,
  "recentChanges": [...],
  "totalChanges": 5,
  "enrichment": { "companyNumber": "12345678", "companyStatus": "Active", ... }
}
```

---

### `GET /api/sponsors/:fingerprint/history`
Returns the full change history for a sponsor.

**Auth required:** Yes

**Response 200:**
```json
{
  "fingerprint": "acme|london|worker",
  "organisationName": "Acme Ltd",
  "changes": [
    {
      "id": 101,
      "changeType": "DOWNGRADED",
      "previousValue": "A-Rating",
      "newValue": "B-Rating",
      "snapshotDate": "2026-01-15"
    }
  ]
}
```

---

## 5. Company Watches

### `GET /api/watches`
Returns the authenticated user's watchlist.

**Auth required:** Yes

**Response 200:**
```json
[
  {
    "id": 7,
    "organisationName": "Acme Ltd",
    "fingerprint": "acme|london|worker",
    "isActive": true,
    "createdAt": "2025-12-01T00:00:00.000Z",
    "canonical": {
      "status": "ACTIVE",
      "typeRating": "A-Rating",
      "route": "Worker",
      "townCity": "London"
    }
  }
]
```

---

### `POST /api/watches`
Adds a company to the user's watchlist.

**Auth required:** Yes

**Body (Zod-validated):**
```json
{
  "organisationName": "Acme Ltd",
  "fingerprint": "acme|london|worker"
}
```

**Response 201:**
```json
{ "id": 8, "organisationName": "Acme Ltd", "fingerprint": "acme|london|worker" }
```

**Response 400:** Validation error or duplicate watch

**Response 403:**
```json
{ "message": "Watch limit reached. Upgrade your plan to watch more companies." }
```

---

### `DELETE /api/watches/:id`
Removes a watch. The watch is soft-deleted (`isActive = false`).

**Auth required:** Yes

**Response 200:** `{ "message": "Watch removed" }`

**Response 403:** Watch does not belong to the current user

---

### `PATCH /api/watches/:id/reactivate`
Re-enables a previously removed watch (sets `isActive = true`). Used when the user re-watches a company they had previously stopped monitoring.

**Auth required:** Yes

**Response 200:** `{ "message": "Watch reactivated." }`

**Response 403/404:** Watch not found or belongs to another user

---

### `POST /api/sponsor-watch`
Creates a **reactivation watch** (`pending_activation`) for a revoked company. The user will receive an email when that company's licence is restored. Requires a paid subscription (Starter or above).

**Auth required:** Yes (paid plan)

**Body:**
```json
{
  "companyName": "Beesocialize Ltd",
  "companyNumber": "12345678"
}
```

**Response 201:** `{ "id": "uuid", "companyName": "Beesocialize Ltd", "status": "pending_activation", ... }`

**Response 403:** Free user — upgrade required (`requiresUpgrade: true`)

**Response 409:** Duplicate — watch already exists for this company

---

### `GET /api/sponsor-watch`
Returns the current user's reactivation watches. Accepts an optional `?status=` query param (e.g. `pending_activation`, `notified`).

**Auth required:** Yes

**Response 200:** `{ "data": [...], "total": 2 }`

---

### `DELETE /api/sponsor-watch/:id`
Cancels a reactivation watch.

**Auth required:** Yes

**Response 200:** `{ "message": "Watch cancelled" }`

**Response 403/404:** Watch not found or belongs to another user

---

## 6. Notification Preferences

### `GET /api/notification-preferences`
Returns the current user's notification settings.

**Auth required:** Yes

**Response 200:**
```json
{
  "emailEnabled": true,
  "email": null,
  "whatsappEnabled": false,
  "whatsappNumber": null,
  "whatsappVerified": false,
  "smsEnabled": false,
  "smsNumber": null,
  "smsVerified": false
}
```
Note: Phone numbers are returned decrypted only for the account owner.

---

### `PUT /api/notification-preferences`
Updates notification settings.

**Auth required:** Yes

**Body (Zod-validated, all fields optional):**
```json
{
  "emailEnabled": true,
  "whatsappEnabled": true,
  "smsEnabled": false
}
```

**Response 200:** Updated preferences object

---

### `POST /api/notification-preferences/verify-phone`
Sends OTP to a phone number to verify it.

**Auth required:** Yes

**Body:**
```json
{
  "phone": "+447700900000",
  "channel": "sms"
}
```

**`channel` values:** `"sms"` | `"whatsapp"`

**Response 200:** `{ "message": "OTP sent" }`

---

### `POST /api/notification-preferences/confirm-phone`
Confirms the OTP and marks the phone as verified.

**Auth required:** Yes

**Body:**
```json
{
  "code": "654321",
  "channel": "sms"
}
```

**Response 200:** `{ "message": "Phone verified" }`

**Response 400:** Invalid or expired OTP

---

### `GET /api/notifications/history`
Returns the notification delivery log for the current user.

**Auth required:** Yes

**Response 200:**
```json
[
  {
    "id": 55,
    "changeType": "REMOVED",
    "organisationName": "Acme Ltd",
    "channel": "email",
    "status": "sent",
    "sentAt": "2026-03-15T00:38:12.000Z"
  }
]
```

---

## 7. Job Alerts

### `GET /api/job-alert-preferences`
Returns job alert opt-in status for all watched companies.

**Auth required:** Yes (Pro+)

**Response 200:**
```json
[
  {
    "fingerprint": "acme|london|worker",
    "organisationName": "Acme Ltd",
    "enabled": true
  }
]
```

---

### `POST /api/job-alert-preferences`
Enables or disables job alerts for a specific company.

**Auth required:** Yes (Pro+)

**Body:**
```json
{
  "fingerprint": "acme|london|worker",
  "enabled": true
}
```

**Response 200:** `{ "message": "Job alert preference updated" }`

**Response 403:** Not on Pro plan

---

## 8. Billing & Subscriptions

### `GET /api/stripe/publishable-key`
Returns the Stripe publishable key for the frontend.

**Response 200:** `{ "key": "pk_live_..." }`

---

### `POST /api/create-subscription`
Creates a Stripe Checkout Session for a subscription plan.

**Auth required:** Yes

**Body:**
```json
{
  "planId": "notification_pro",
  "billingPeriod": "monthly"
}
```

**Response 200:**
```json
{ "url": "https://checkout.stripe.com/pay/cs_live_..." }
```

---

### `POST /api/checkout/credits`
Creates a Stripe Checkout Session for purchasing COS Check credits.

**Auth required:** Yes

**Body:**
```json
{ "pack": "5" }
```

**Response 200:** `{ "url": "https://checkout.stripe.com/..." }`

---

### `GET /api/checkout/verify/:sessionId`
Verifies a completed Stripe checkout and applies credits/subscription.

**Auth required:** Yes

**Response 200:**
```json
{
  "status": "fulfilled",
  "creditsAdded": 5,
  "newBalance": 9
}
```

**Response 409:** Already processed (idempotency)

---

### `GET /api/credits`
Returns the current user's credit balance.

**Auth required:** Yes

**Response 200:** `{ "credits": 4 }`

---

### `POST /api/stripe-webhook`
Stripe webhook endpoint. Verified via `stripe.webhooks.constructEvent()`.

**Headers required:** `Stripe-Signature`
**Content-Type:** `application/json` (raw body preserved)

**Handled events:**
- `checkout.session.completed` — fulfil credits/subscription
- `customer.subscription.updated` — sync subscription status
- `customer.subscription.deleted` — downgrade to free

**Response 200:** `{ "received": true }`
**Response 400:** Invalid signature

---

## 9. Admin Endpoints

All admin endpoints require `role = 'admin'` on the session user.

### `GET /api/stats`
Returns system-wide statistics.

**Response 200:**
```json
{
  "totalUsers": 1240,
  "totalVerifications": 8842,
  "sponsorCount": 82341,
  "changesLast30Days": 127,
  "notificationsSentLast7Days": 440
}
```

---

### `GET /api/admin/trusted-patterns`
Lists all admin-uploaded trusted COS patterns.

---

### `POST /api/admin/trusted-patterns`
Uploads a genuine COS document as a trusted pattern.

**Content-Type:** `multipart/form-data`

**Form fields:**
| Field | Type | Description |
|---|---|---|
| `document` | file | PDF of genuine COS document |
| `aiInstructions` | text | Pattern-specific AI instructions |

---

### `DELETE /api/admin/trusted-patterns/:id`
Removes a trusted pattern.

---

### `PATCH /api/admin/users/:id/cos-approval`
Approves or revokes COS Check beta access.

**Body:**
```json
{ "approved": true }
```

---

### `POST /api/admin/sponsor-monitor/run`
Manually triggers the sponsor monitor job.

**Response 200:**
```json
{
  "success": true,
  "recordsProcessed": 82341,
  "changes": { "REMOVED": 1, "DOWNGRADED": 2 },
  "notificationsSent": 14
}
```

---

### `POST /api/admin/migrate-canonical` ⛔ DEPRECATED

> **Returns 410 Gone.** This route is no longer functional. Sponsor canonical seeding now happens automatically on the first nightly job run via `buildFirstRunDiff()`. Use `POST /api/admin/sponsor-monitor/run` to trigger manually.

**Response 410:**
```json
{
  "message": "This endpoint is deprecated. The sponsor_list table is being retired. The monitor job now auto-seeds sponsor_canonical on first run via buildFirstRunDiff()."
}
```

---

### `POST /api/admin/sponsor-monitor/cleanup` ⛔ DEPRECATED

> **Returns 410 Gone.** The `sponsor_list` table is being retired (scheduled DROP 2026-04-20). No cleanup action is required.

**Response 410:**
```json
{
  "message": "This endpoint is deprecated. The sponsor_list table is being retired."
}
```

---

### `POST /api/admin/daily-digest/refresh`
Forces regeneration of the daily digest headline.

---

### `POST /api/admin/sponsor-monitor/initialize`
Streams the full UK sponsor CSV (~124k rows), batch-inserts into `sponsor_canonical`, then rebuilds the Fuse.js index. Fires and forgets — returns a `jobId` immediately. Includes pre-flight zombie-lock check to terminate idle advisory-lock holders before starting. Guard: rejects if an `initialize` job is already in flight and returns the existing `jobId` for polling.

**Response 200:** `{ "jobId": "uuid" }`

**Response 409:** `{ "message": "An initialize job is already running", "jobId": "uuid" }`

---

### `GET /api/admin/sponsor-monitor/init-progress/:jobId`
Polls progress of a running `initialize` job. Returns cumulative counters.

**Response 200:**
```json
{
  "jobId": "uuid",
  "status": "running",
  "progress": { "inserted": 45200, "updated": 0, "total": 124000, "percent": 37 }
}
```

---

### `POST /api/admin/sponsor-monitor/rebuild-index`
Rebuilds the in-memory Fuse.js search index from the current `sponsor_canonical` table without re-fetching the CSV. Safe to call after a data-only migration.

**Response 200:** `{ "message": "Index rebuilt", "count": 124000 }`

---

### `GET /api/admin/sponsor-monitor/status`
Returns the current state of the nightly monitor job, last run info, and advisory-lock status.

---

### `GET /api/admin/sponsor-monitor/job-history`
Returns the last N nightly job runs with timestamps, record counts, and change summaries.

---

### `POST /api/admin/sponsor-monitor/release-lock`
Manually releases the PostgreSQL advisory lock if a job crashed and left it held. Safe to call when no job is running.

**Response 200:** `{ "message": "Lock released", "released": true }`

---

### `GET /api/admin/sponsor-monitor/notification-stats`
Returns per-event-type notification send counts for the last 30 days.

---

### `GET /api/admin/sponsor-monitor/top-watched`
Returns the top 20 most-watched companies by watch count.

---

### `GET /api/admin/sponsor-monitor/binary-health`
Checks that the nightly CSV binary (`pdftotext`-equivalent UK sponsor download) is reachable and returns the expected Content-Type.

---

## 10. Error Response Format

All API errors follow this format:

```json
{
  "message": "Human-readable error description"
}
```

Stack traces are never included in API responses (production mode).

---

## 11. Webhook Payload Reference

### Stripe `checkout.session.completed`
```json
{
  "type": "checkout.session.completed",
  "data": {
    "object": {
      "id": "cs_live_...",
      "client_reference_id": "HMAC-signed-payload",
      "customer": "cus_...",
      "subscription": "sub_...",
      "metadata": {
        "userId": "usr_abc123",
        "packageType": "notification_pro",
        "credits": "5"
      }
    }
  }
}
```

The `client_reference_id` is HMAC-SHA256 signed (`CHECKOUT_HMAC_SECRET`) to prevent tampering. The server verifies the signature before fulfilling the checkout.
