# COS Verification System

## Overview
This project is an AI-powered Certificate of Sponsorship (COS) verification system designed to detect fake or edited COS documents. It provides a user portal for document verification and an admin portal for managing trusted patterns. The system utilizes machine learning, including rule-based matching, vector similarity, and ML model inference, to ensure accurate authenticity assessments. Its primary goal is to offer a reliable tool to combat fraud in critical immigration documents. The project envisions becoming a leading solution for immigration document verification, ensuring compliance and security for individuals and organizations alike.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The system features a dual-portal design: an Admin Portal for managing genuine COS documents and a User Portal for submitting documents for AI verification. Verification results are classified as Genuine, Suspicious, or Fake, each accompanied by a confidence score.

**Frontend:**
- **Framework**: React with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui
- **UI/UX Decisions**: Professional color scheme, adaptive color-changing result badges with gradient backgrounds and animations, mobile optimization with responsive design, and SEO-optimized pages with unique metadata and structured data.
- **3D Graphics**: Three.js with @react-three/fiber for an animated landing page.

**Backend:**
- **Runtime**: Node.js with Express
- **Database**: PostgreSQL with Drizzle ORM
- **PDF Processing**: Custom PDFAnalyzer for metadata extraction.
- **Verification Engine**: Rule-based forensic analysis, including producer matching, date consistency checks, XMP history analysis, and suspicious software detection.

**Key Features:**
- **User Portal**: File upload, real-time verification results with confidence scores, and detailed forensic analysis.
- **Admin Portal**: Management of trusted COS documents, system statistics dashboard, and role-based access control.
- **Authentication**: Database-backed user authentication with role-based access and session management, supporting Google OAuth and Email OTP verification. Admin login is OTP-only.
- **Dynamic AI Knowledge Engine**: Trainable AI system allowing admins to add custom forensic rules and pattern-specific instructions, which are explicitly cited in AI analysis.
- **Human-in-the-Loop (HITL) Feedback**: Admins can override AI results, providing reasoning that trains the AI and prevents future errors.
- **Multi-AI Fallback System**: Automatic failover between AI providers (OpenAI → Claude → DeepSeek) ensures continuous document analysis.
- **Sponsor Licence Monitor**: Tracks changes in the UK Home Office Register of Licensed Sponsors using a canonical reconciliation engine. Database tables: `sponsor_canonical` (identity tracking), `sponsor_list` (snapshots), `company_watches`, `sponsor_changes`, `notification_preferences`, `notification_log`. Watch limits: free=1, starter=2, pro=5, unlimited=-1, enterprise=-1. Canonical fingerprints (`normalized_name|normalized_city|route_cleaned`) provide stable identity across name changes. 3-phase reconciliation: fingerprint matching, fuzzy rename detection (85% similarity), confirmed removal after 2+ consecutive misses. NAME_CHANGE events logged but not user-alertable. Admin migration endpoint: `POST /api/admin/migrate-canonical`.
- **Multi-Channel Notifications**: Supports email (Resend), SMS (Brevo), and WhatsApp (Twilio) with encrypted phone numbers (AES-256-GCM, `enc:` prefix) and phone verification via OTP.
- **Product Separation**: CoS Check and Notification Engine are separate products with separate pricing pages. `/pricing` shows Notification Engine only (primary product). `/cos-pricing` shows CoS Check plans only. CoS Check has 4 plans (Starter, Pro, Unlimited, Master). Notification Engine has 2 plans (Starter £24.99/mo with 2 companies, Pro £49.99/mo with 5 companies and 5 CoS checks/month). Bundle benefits: Unlimited Monthly (£99.99/mo) includes 10-company notification watchlist; Master Package (£99.99 one-time) includes 5-company notifications for 3 months. Backend uses packageTypes: notification_starter, notification_pro (distinct from CoS starter, pro).
- **Tiered Alert System**: Centralized in `server/utils/tierConfig.ts`. SubscriptionStatus values: 'free', 'starter', 'pro', 'unlimited', 'enterprise' (1:1 mapping to tiers, no legacy aliasing). Pricing: Starter=£24.99/mo (£239.99/yr), Pro=£49.99/mo (£479.99/yr), Unlimited=£99.99/mo. FREE=next morning 8am UTC, STARTER=same-day 6pm UTC, PRO/UNLIMITED/ENTERPRISE=immediate. Channel gating: Starter gets email+WhatsApp, Pro gets email+WhatsApp+SMS, Unlimited gets all channels. Hourly cron processes delayed notification queue.
- **Verification Receipt System**: Each verification generates a unique Receipt ID, Document Hash, and Integrity Hash for audit trails, ensuring tamper-proof verification while documents are immediately deleted after processing.
- **Security Hardening**: Includes measures like OTP-only admin login, file upload limits (10MB max, PDF only), same-origin CORS, secure session cookies, generic error responses, and robust security headers.
- **Data Protection Policy**: Adheres to UK GDPR by processing only document metadata, permanently deleting original documents post-verification, and offering users data erasure rights.
- **Daily Digest System**: AI-generated headlines from sponsor register changes using DeepSeek API. Database tables: `daily_digest` (headline variants, counts, HMAC-signed), `ai_generation_logs` (audit trail). Cron generates after detecting changes. Deterministic fallback when API unavailable. Frontend `LandingDigest.tsx` component with animated counters.
- **SEO & AI Discovery Infrastructure**: Dynamic server-side `/sitemap.xml` (19 URLs), `/robots.txt` (AI bot directives for GPTBot, PerplexityBot, ClaudeBot, etc.), `/llms.txt` and `/llms-full.txt` (LLM discovery files). Bot meta injection middleware serves per-route meta tags to crawlers. FAQ schema (JSON-LD) on home, sponsor-monitor, pricing pages. Product/Offer schema on pricing pages. BreadcrumbList schema via SEOHead component. SpeakableSpecification and Organization schema in index.html. Enhanced footer with topical internal link clusters. Safety/trust-focused metadata across all pages (YMYL compliance). Trust signals: "Not affiliated with UK Home Office" disclaimer, no-storage badge near upload. Content pages: `/check-fake-cos` (5 warning signs guide), `/what-to-do-fake-cos` (scam recovery guide), `/about` (mission page).

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
- **Resend**: Email delivery.
- **Brevo**: Transactional SMS.
- **Twilio**: WhatsApp messaging.