# COS Verification System

## Overview
This project is an AI-powered Certificate of Sponsorship (COS) verification system designed to detect fake or edited COS documents. It features a user portal for document verification and an admin portal for managing trusted patterns. The system uses machine learning, including rule-based matching, vector similarity, and ML model inference, to provide accurate authenticity assessments. The primary goal is to offer a reliable tool for verifying critical immigration documents and combating fraud.

## User Preferences
Preferred communication style: Simple, everyday language.

## Admin Access
- Admin portal accessible at `/admin`
- Admin login via email OTP only, no password authentication
- OTP sent via Resend to the configured `ADMIN_EMAIL`
- Only the email matching `ADMIN_EMAIL` can receive admin OTP codes
- `ADMIN_PASSWORD` env var is no longer used or required
- Default admin: ptel437@gmail.com

## System Architecture
The system employs a dual-portal design. An Admin Portal facilitates the upload of genuine COS documents to a Trusted Patterns Database, while a User Portal allows users to upload COS documents for AI verification. Verification results are classified as Genuine, Suspicious, or Fake, accompanied by a confidence score.

**Frontend:**
- **Framework**: React with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui
- **Routing**: Wouter
- **State Management**: TanStack Query
- **Build Tool**: Vite with SWC
- **3D Graphics**: Three.js with @react-three/fiber for an animated landing page.
- **UI/UX Decisions**: Professional color scheme, adaptive color-changing result badges with gradient backgrounds and animations, mobile optimization with responsive design.
- **PageLayout Component**: Shared layout wrapper (`client/src/components/PageLayout.tsx`) providing sticky top navigation (logo, 6 nav links with active state, UserProfile, mobile hamburger menu) and Footer across all 12 pages. Home page uses `hideFooter` prop since HeroSection has its own footer.
- **SEO**: Every page has unique SEOHead with title, description, canonical URL, OG tags. Rich structured data: WebApplication (Home), FAQPage (COSGuide), Product/Offer (Pricing), TechArticle (Technology), BreadcrumbList on key pages.

**Backend:**
- **Runtime**: Node.js with Express
- **Database**: PostgreSQL with Drizzle ORM
- **PDF Processing**: Custom PDFAnalyzer with GroupDocs-level metadata extraction
- **Verification Engine**: Rule-based with forensic analysis
- **Comparison Methods**: Producer matching, date consistency checks, XMP history analysis, suspicious software detection

**Key Features:**
- **User Portal**: File upload, real-time verification results with confidence scores, forensic analysis breakdown, and detailed check results.
- **Admin Portal**: Management of trusted COS documents with metadata display, system statistics dashboard, and admin-only routes protected by role check.
- **Authentication**: Database-backed user authentication with role-based access control (admin/user) and session management. Supports Google OAuth and Email OTP verification via Resend. Admin login is OTP-only (no password).
- **Dynamic AI Knowledge Engine**: Trainable AI system that allows admins to add custom forensic rules and pattern-specific instructions. Global rules apply to all verifications; pattern-specific instructions apply when producer matches. AI explicitly cites admin rules in analysis output (e.g., "Per Admin Rule #3...").
- **Human-in-the-Loop (HITL) Feedback**: Admins can override AI results by approving or marking documents as fake. When marking as fake, admins must provide reasoning. This feedback is injected into future AI analyses as "human expert corrections" to train the AI and prevent repeated mistakes. Visual "Admin Overridden" badges appear when admins disagree with AI.
- **Multi-AI Fallback System**: Automatic failover between AI providers (OpenAI → Claude → DeepSeek) for reliable document analysis even if one provider is down.

## Verification Engine

**Rule-Based Checks:**
1. **Editing Software Detection**: Immediately flags documents created with Photoshop, Illustrator, GIMP, Inkscape, Canva, etc.
2. **Producer Matching**: Compares document producer against trusted sample producers
3. **Date Consistency**: Checks if modification date is before creation date (impossible) or significantly later
4. **XMP History Analysis**: Scans modification history for suspicious editing tools
5. **Known Producer Check**: Validates producer against known genuine software (Microsoft Word, Adobe Acrobat, LibreOffice, gov.uk, Home Office)

**Forensic Metadata Extraction:**
- PDF Producer (e.g., "iText", "Adobe Acrobat", "Microsoft Word")
- Creation vs Modification Date with second-level precision
- XMP Metadata including modification history
- Font data with embedded font list
- Digital signature detection
- Encryption status

**Verification Result Structure:**
```json
{
  "status": "genuine" | "suspicious" | "fake",
  "confidence": 0-100,
  "reason": "string",
  "checks": [
    { "name": "string", "passed": boolean, "severity": "critical|warning|info", "message": "string" }
  ]
}
```

## External Dependencies
- **@neondatabase/serverless**: Serverless PostgreSQL connection.
- **drizzle-orm**: Type-safe ORM.
- **@tanstack/react-query**: Server state management.
- **multer**: File upload handling.
- **@radix-ui/react-***: Accessible UI components.
- **fast-xml-parser**: XMP metadata parsing.
- **Stripe**: Payment processing and subscription upgrades.
- **passport-google-oauth20**: Google OAuth authentication.
- **bcrypt**: Password hashing.

## API Routes

**Admin Routes (require admin role):**
- `GET /api/admin/trusted-patterns` - List all trusted patterns with metadata
- `POST /api/admin/trusted-patterns` - Upload new trusted sample with optional AI instructions
- `DELETE /api/admin/trusted-patterns/:id` - Remove trusted pattern
- `PATCH /api/admin/trusted-patterns/:id/instructions` - Update AI instructions for a pattern
- `GET /api/admin/recent-activity` - Get recent verification activity
- `GET /api/admin/paid-submissions` - List all paid expert review submissions
- `GET /api/admin/verification-logs` - Paginated logs with filters (status, search, date range)
- `POST /api/admin/analyze-reasoning/:id` - AI forensic analysis with SSE streaming (injects knowledge context)
- `GET /api/admin/system-health` - System health stats (memory, uptime, connections)
- `POST /api/admin/trust-producer` - Add producer to trusted patterns from log entry
- `GET /api/admin/users` - Paginated user list with search
- `POST /api/admin/users/:id/restrict` - Restrict/unrestrict user access
- `GET /api/admin/export-report/:id` - Export forensic evidence JSON report
- `GET /api/admin/global-rules` - List all global AI rules
- `POST /api/admin/global-rules` - Create new global AI rule
- `DELETE /api/admin/global-rules/:id` - Delete global AI rule
- `PATCH /api/admin/global-rules/:id/toggle` - Enable/disable a global AI rule
- `POST /api/admin/teach-ai` - Create rule from verification log forgery markers
- `PATCH /api/logs/:id/feedback` - HITL: Update admin status (approved/fake) with reasoning
- `GET /api/knowledge-base` - Get aggregated admin feedback for AI knowledge injection

**Authentication Routes:**
- `POST /api/auth/admin-login` - Admin login with env var credential check
- `POST /api/auth/email/send-otp` - Send OTP code to email via Brevo
- `POST /api/auth/email/verify-otp` - Verify OTP code and create session
- `POST /api/auth/logout` - Logout current session
- `GET /api/auth/user` - Get current authenticated user

**Checkout Routes:**
- `POST /api/checkout/sign` - Generate HMAC-signed client_reference_id for Stripe Payment Link redirect (authenticated)

## Stripe Payment Links
Checkout uses Stripe Payment Links (not server-side Checkout Sessions). Each plan has a hardcoded payment link URL. The flow:
1. User clicks "Buy" on Pricing page
2. Frontend calls `POST /api/checkout/sign` to get an HMAC-signed `client_reference_id` (format: `userId::packageType::hmacSignature`)
3. User is redirected to the Stripe Payment Link with `client_reference_id` and `prefilled_email` query params
4. On `checkout.session.completed` webhook, server verifies the HMAC signature before crediting the user
5. Payment links: Starter (`3cIeVec9k1pz2uQdIveZ203`), Pro (`fZufZi4GSfgp1qMfQDeZ201`), Unlimited (`dRm3cw7T41pz8Te5bZeZ202`), Master (`28E28s4GS6JTfhC6g3eZ200`)

## Environment Variables
- `ADMIN_EMAIL` - Admin email address for OTP-based admin access
- `BREVO_API_KEY` - Brevo API key for sending verification emails
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `DATABASE_URL` - PostgreSQL connection string
- `CHECKOUT_HMAC_SECRET` - (optional) Dedicated HMAC key for signing checkout client_reference_id; falls back to SESSION_SECRET or STRIPE_SECRET_KEY

**Verification Routes:**
- `POST /api/verify` - Upload and verify a COS document (returns receiptId, documentHash, checks[])
- `GET /api/receipt/:receiptId` - Get cryptographic verification receipt
- `GET /api/my-verifications` - User's verification history (authenticated)

## New Pages (Feb 2026)
- `/technology` - Detailed verification methodology page (pattern-protected)
- `/api-docs` - B2B API documentation for immigration consultancies and HR platforms
- `/history` - User verification history with audit trail
- `/ai-guide` - AI Guide with pre-check red flags warning section

## Verification Receipt System
Each verification now generates:
- **Receipt ID**: Unique identifier (e.g., CBA-XXXX-XXXX) for audit trail reference
- **Document Hash**: SHA-256 hash of the uploaded document for tamper-proof verification
- **Integrity Hash**: Cryptographic proof combining receipt ID, document hash, result, confidence, and timestamp
Documents are still deleted immediately after processing - only the hash and receipt are retained

## Security Hardening (Feb 2026)
- Admin credentials: env var only (ADMIN_EMAIL required, OTP-only login, no password)
- File uploads: 10MB max, PDF only (multer fileFilter + limits)
- CORS: same-origin only (no wildcard)
- Session cookies: secure flag enabled in production
- Error responses: all client-facing errors use generic messages (internal details logged server-side only)
- Body parsing: 10MB limit (reduced from 50MB)
- Idempotency: checkout session deduplication uses bounded Map with 24hr TTL and max 1000 entries
- Security headers: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy
- Upload cleanup: files deleted immediately in finally block after verification

## Data Protection Policy (UK GDPR, Data Protection Act 2018)
- We process document metadata only, never full document content
- Original documents are permanently deleted immediately after verification
- Free users: verification results are not retained after session ends, 24 hour cooldown between free checks
- Paid account holders (with basic account): only verification results are saved, never original documents
- Users have the right to request erasure of their data at any time
- Lawful basis: Article 6(1)(f) UK GDPR (legitimate interests for fraud prevention)
- Compliance notices displayed in: Footer, FileUpload dropzone, VerificationResults page, Technology page

## Content Style Rules
- No em dashes, long dashes, or horizontal separators between words in titles and headings
- Use plain spacing or punctuation like colons or commas instead
