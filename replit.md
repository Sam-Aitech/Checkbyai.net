# COS Verification System

## Overview
This project is an AI-powered Certificate of Sponsorship (COS) verification system designed to detect fake or edited COS documents. It features a user portal for document verification and an admin portal for managing trusted patterns. The system uses machine learning, including rule-based matching, vector similarity, and ML model inference, to provide accurate authenticity assessments. The primary goal is to offer a reliable tool for verifying critical immigration documents and combating fraud.

## User Preferences
Preferred communication style: Simple, everyday language.

## Admin Access
- Admin portal accessible at `/admin`
- Admin login via email OTP only (no password)
- OTP sent via Resend to the configured `ADMIN_EMAIL`
- Only the email matching `ADMIN_EMAIL` can receive admin OTP codes
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

**Backend:**
- **Runtime**: Node.js with Express
- **Database**: PostgreSQL with Drizzle ORM
- **PDF Processing**: Custom PDFAnalyzer with GroupDocs-level metadata extraction
- **Verification Engine**: Rule-based with forensic analysis
- **Comparison Methods**: Producer matching, date consistency checks, XMP history analysis, suspicious software detection

**Key Features:**
- **User Portal**: File upload, real-time verification results with confidence scores, forensic analysis breakdown, and detailed check results.
- **Admin Portal**: Management of trusted COS documents with metadata display, system statistics dashboard, and admin-only routes protected by role check.
- **Authentication**: Database-backed user authentication with role-based access control (admin/user) and session management. Supports Google OAuth and Email OTP verification via Brevo, including daily verification limits.
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

## Environment Variables
- `ADMIN_EMAIL` - Admin email address for forced admin access
- `ADMIN_PASSWORD` - Admin password for forced admin access
- `BREVO_API_KEY` - Brevo API key for sending verification emails
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `DATABASE_URL` - PostgreSQL connection string

**Verification Routes:**
- `POST /api/verify` - Upload and verify a COS document
