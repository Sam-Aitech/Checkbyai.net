# Security Design Document
# checkbyai.net
**Version:** 1.1 | **Classification:** Internal | **Last Updated:** 2026-03-20

---

## 1. Threat Model

### Assets to Protect
| Asset | Sensitivity | Attack Surface |
|---|---|---|
| COS documents | Highest — UK immigration docs | Upload endpoint, temp file storage |
| Phone numbers | High — PII | Database, notification dispatch |
| Session tokens | High | Cookie theft, CSRF |
| Stripe webhook | High — financial | Unauthenticated HTTP endpoint |
| Admin portal | High — full data access | Authentication, OTP |
| User PII (email, name) | Medium | Database, API responses |
| Sponsor monitor results | Low | Read-only public data |

### Threat Actors
1. **Fraudsters** trying to bypass COS verification to get false "genuine" results
2. **Credential stuffers** attempting to brute-force or OTP-flood accounts
3. **Scrapers** abusing the free search to harvest sponsor data without paying
4. **Stripe webhook replayers** trying to grant themselves free credits
5. **Privilege escalators** trying to access admin panel

---

## 2. Authentication

### 2.1 Email OTP (Primary Method)
- 6-digit OTP generated with `crypto.randomInt(100000, 999999)`
- 10-minute expiry stored in `users.verificationExpiry`
- OTP cleared from DB immediately on successful verification
- Cloudflare Turnstile CAPTCHA on `/api/auth/email/send-otp` when `TURNSTILE_SECRET_KEY` is set
- Rate limited: 5 OTP requests per 15 minutes per IP (`otpLimiter`)

### 2.2 Google OAuth
- Passport.js `GoogleStrategy` with verified callback
- `state` parameter generated and validated to prevent CSRF
- Profile email extracted from `profile.emails[0].value` (verified by Google)
- User upserted on each login (no stale profile data)

### 2.3 Admin Login
- **Password authentication disabled for admin** — OTP only
- Admin email must match `ADMIN_EMAIL` environment variable exactly
- Admin OTP sent via Resend to the admin email
- `role = 'admin'` enforced at DB level, checked on every admin route via `isAdmin` middleware

### 2.4 Session Management
```
Cookie properties:
  httpOnly: true       ← inaccessible to JavaScript
  secure: true         ← HTTPS only (production)
  sameSite: 'lax'      ← CSRF protection for cross-origin navigations
  maxAge: 7 days

Store: PostgreSQL (connect-pg-simple)
  └─ Sessions survive server restart
  └─ Session ID is opaque (nanoid), value stored server-side
```

---

## 3. Authorization

### 3.1 Route Guards
```typescript
isAuthenticated  ← req.isAuthenticated() via Passport
isAdmin          ← isAuthenticated + users.role === 'admin' (DB check)
```

All sensitive data routes use `isAuthenticated`. All admin routes use `isAdmin`.

### 3.2 Resource Ownership
- Watch deletion: verified that `companyWatches.userId === req.user.id` before delete
- Verification history: filtered by `verificationResults.userId = req.user.id`
- Notification preferences: filtered by `notificationPreferences.userId = req.user.id`

### 3.3 Tier-Based Access Control
Feature access gated by `users.subscriptionStatus`:
```
free      → 1 watch, no notifications
starter   → 2 watches, email + WhatsApp, same-day
pro       → 5 watches, all channels, immediate, job alerts
unlimited → unlimited watches, all channels, API access
enterprise → unlimited + webhooks + CSV upload
```
Tier config is the single source of truth in `server/utils/tierConfig.ts`.

### 3.4 COS Check Beta Gate
`users.cosCheckApproved = false` redirects to gated screen. Admin explicitly approves each user via `PATCH /api/admin/users/:id/cos-approval`.

---

## 4. Input Validation & Injection Prevention

### 4.1 Zod Schema Validation
Applied on all mutation endpoints:
- `POST /api/watches` — validates fingerprint format, name length
- `PUT /api/notification-preferences` — validates boolean fields, phone format
- `PATCH /api/admin/users/:id/limit` — validates integer range
- `POST /api/admin/trust-producer` — validates producer string

### 4.2 SQL Injection
- All DB queries use Drizzle ORM with parameterised statements
- Raw SQL used only via tagged template literals (`sql\`...\``) which are always parameterised
- No string concatenation into SQL

### 4.3 Prototype Pollution
- `express.urlencoded({ extended: false })` — prevents nested object parsing that enables prototype pollution via `__proto__` keys

### 4.4 File Upload Security
- multer configured to accept PDF only (MIME type check: `application/pdf`)
- Max file size: 10MB
- Files written to OS temp directory, unlinked immediately after analysis
- multer upgraded to 2.1.0 to patch 2 HIGH-severity CVEs (DoS via malformed multipart)

### 4.5 XSS Prevention
- React's JSX auto-escapes all output
- `notificationDispatcher.ts` has explicit `escapeHtml()` for email HTML templates
- `Content-Security-Policy` header prevents inline script injection

---

## 5. Data Protection

### 5.1 COS Documents — Zero Storage
```
Upload → extract metadata → analyse → hash → store hash only → DELETE FILE
```
The original document is **permanently deleted** from the OS temp directory immediately after analysis. No document content is stored in the database or any file system. Only the SHA-256 hash is retained for deduplication.

### 5.2 Phone Number Encryption
All stored phone numbers are encrypted at application layer before DB write:
```
Algorithm: AES-256-GCM
Key:       PHONE_ENCRYPTION_KEY env var (256-bit)
IV:        Random 12 bytes per encryption
Format:    "enc:" + base64(iv + ciphertext + authTag)
```
Implementation: `server/utils/phoneCrypto.ts`

If `PHONE_ENCRYPTION_KEY` changes, all existing encrypted numbers become undecryptable — key rotation requires re-verification of all phone numbers.

### 5.3 Database Security
- Neon PostgreSQL with TLS enforced connection
- No Row Level Security (RLS) policies at DB level — **application-layer only**
- Outstanding item: add PostgreSQL RLS policies as defence-in-depth

### 5.4 IP Address Hashing
IP addresses for rate limiting are hashed before storage:
```
ipHash = SHA-256(IP + IP_HASH_SALT)
```
Raw IP addresses are never stored. The hash is one-way — cannot be reversed to recover the IP.

---

## 6. Transport Security

### 6.1 HTTPS & HSTS
```http
Strict-Transport-Security: max-age=31536000; includeSubDomains
```
Applied in production only. Forces browsers to use HTTPS for 1 year.

### 6.2 Security Headers
```http
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
X-Powered-By: [removed]
```

### 6.3 Content Security Policy
**Production:**
```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'unsafe-inline' https://js.stripe.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com data:;
  img-src 'self' data: https:;
  connect-src 'self' https://api.stripe.com;
  frame-src https://js.stripe.com https://hooks.stripe.com;
  worker-src 'self' blob:;
  object-src 'none';
  base-uri 'self';
  form-action 'self'
```

`unsafe-eval` is removed in production (present in dev for Vite HMR).

### 6.4 CORS
```typescript
// Same-origin only — no cross-origin API access
allowedOrigin = `${req.protocol}://${req.headers.host}`
```

---

## 7. Payment Security

### 7.1 Stripe Webhook Verification
All Stripe webhook events are verified using HMAC signature before processing:
```typescript
stripe.webhooks.constructEvent(req.rawBody, sig, STRIPE_WEBHOOK_SECRET)
```
`rawBody` is captured by the `express.json` verify callback before body parsing. Failure to verify signature results in immediate `400` rejection.

### 7.2 Checkout HMAC Signing
The Stripe Checkout `client_reference_id` contains a signed payload:
```
payload = JSON.stringify({ userId, packageType, credits, ts })
signature = HMAC-SHA256(payload, CHECKOUT_HMAC_SECRET)
client_reference_id = base64(payload + "." + signature)
```
The server verifies this signature on checkout completion before fulfilling credits/subscriptions. This prevents a tampered checkout from granting arbitrary credits.

### 7.3 Idempotency
The `processed_checkouts` table has a unique constraint on `stripeSessionId`. Any attempt to process the same checkout twice hits a unique violation, which is caught and returns `409 Already Processed`. This protects against Stripe webhook retries double-granting credits.

---

## 8. Rate Limiting & Abuse Prevention

| Endpoint | Limit | Rationale |
|---|---|---|
| `POST /api/auth/login` | 10 req/15min per IP | Brute force protection |
| `POST /api/auth/*/send-otp` | 5 req/15min per IP | OTP flooding / SMS cost abuse |
| `POST /api/auth/*/verify-otp` | 5 req/15min per IP | OTP brute force |
| `POST /api/verify` | 10 req/1hr per IP | AI inference cost protection |
| `GET /api/sponsors/free-search` | 1 req/day per IP | Sponsor data scraping prevention |
| Notification dispatch | 10 notifications/user/24h | Notification spam prevention |

Anonymous `POST /api/verify` is additionally limited by the `ip_verifications` table (counted per IP per day, reset at midnight).

---

## 9. Environment Variable Security

**Required in production (server exits if missing):**
```
DATABASE_URL           — Neon PostgreSQL connection string
SESSION_SECRET         — Session encryption key (≥32 bytes random)
PHONE_ENCRYPTION_KEY   — AES-256 key for phone number encryption
IP_HASH_SALT           — Salt for IP hashing
CHECKOUT_HMAC_SECRET   — HMAC key for Stripe checkout signing
DIGEST_SIGNING_KEY     — HMAC key for daily digest integrity
```

**Optional (features degrade gracefully if absent):**
```
ADMIN_EMAIL            — Admin OTP login email
RESEND_API_KEY         — Email notifications (disabled if absent)
BREVO_API_KEY          — SMS notifications (disabled if absent)
TWILIO_ACCOUNT_SID     — WhatsApp notifications (disabled if absent)
GOOGLE_CLIENT_ID       — Google OAuth (disabled if absent)
TURNSTILE_SECRET_KEY   — CAPTCHA (skipped in dev without this)
OPENAI_API_KEY         — AI analysis (falls back to Claude/DeepSeek)
```

---

## 10. Legal & Privacy Compliance

### UK GDPR
- COS documents deleted immediately after analysis (Article 5(1)(c) — data minimisation)
- Privacy policy includes Automated Decision-Making section (Article 22 rights)
- Users can request data erasure
- Processing only document metadata, not content

### Consumer Protection
- Terms of Service compliant with Consumer Contracts Regulations 2013
- Cancellation rights disclosed
- 99.8% accuracy claims replaced with "High Forensic Detection" + technical caveats
- "Technical Analysis Only" disclaimer on all results (OISC adviser link provided)

### Disclaimer
- "Not affiliated with the UK Home Office" notice displayed
- COS Check results are for informational purposes only
- Master Package includes OISC adviser referral link

---

## 11. Outstanding Security Items

| Priority | Item | Status |
|---|---|---|
| HIGH | PostgreSQL Row Level Security (RLS) policies | Not implemented — application-layer only |
| HIGH | Advisory lock via DB-row mutex instead of session-level lock | Not implemented |
| MEDIUM | `unsafe-inline` in CSP script-src | Present — required for shadcn/ui inline styles |
| MEDIUM | Content-Security-Policy nonce for inline scripts | Not implemented |
| LOW | Rotate `PHONE_ENCRYPTION_KEY` migration path | Not documented |
| LOW | Audit log for admin actions | Partial — HITL feedback logged; other admin actions not |
