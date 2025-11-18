# COS Verification System

## Overview
This Certificate of Sponsorship (COS) verification system utilizes AI to detect fake or edited COS documents. It features a dual-portal design: a user interface for document verification and an admin portal for managing trusted patterns. The system employs machine learning techniques, including rule-based matching, vector similarity analysis, and ML model inference, to provide accurate authenticity assessments. The business vision is to provide a reliable tool for quickly and accurately verifying critical immigration documents, addressing a significant need in the market for robust fraud detection.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The system operates with a three-portal design where an Admin Portal uploads genuine COS documents to a Trusted Patterns Database, and a User Portal allows users to upload COS documents for AI verification. Results are classified as Genuine, Edited, or Fake, with a confidence score.

**Frontend:**
- **Framework**: React with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui
- **Routing**: Wouter
- **State Management**: TanStack Query
- **Build Tool**: Vite with SWC
- **3D Graphics**: Three.js with @react-three/fiber for an animated landing page.
- **UI/UX Decisions**: Professional color scheme (#003366, #0066CC, #009933, #FF6600) for 3D visualization, adaptive color-changing result badges with gradient backgrounds and animations, mobile optimization with responsive design and enhanced touch interactions.

**Backend:**
- **Runtime**: FastAPI with async support.
- **Database**: DuckDB for in-memory storage of trusted patterns and verification results, with support for `users`, `trusted_cos_patterns`, `submitted_cos`, and `verification_results` tables.
- **PDF Processing**: PyMuPDF for comprehensive metadata extraction (including XMP metadata).
- **AI Engine**: COSVerifier with SentenceTransformers support.
- **Comparison Methods**: Rule-based exact matching, vector similarity using TF-IDF/SentenceTransformers, and ML model inference (ONNX Runtime ready).

**Key Features:**
- **User Portal**: File upload interface, real-time verification results display with confidence scores, and analysis breakdown.
- **Admin Portal**: Management of trusted COS documents, system statistics dashboard, and detailed document analysis view with XMP metadata display and admin decision tools.
- **Authentication**: Database-backed user authentication with role-based access control (admin/user) and session management. Supports Replit Auth and Google OAuth. Includes daily verification limits for free users and unlimited for pro/admin users.

**Data Flow:**
Genuine COS documents are uploaded via the Admin Portal to build the Trusted Patterns Database. User-submitted COS documents are processed by the AI Verification Engine, which extracts metadata, compares it against trusted patterns using exact matching, vector similarity, and ML inference, and outputs a classification with a confidence score.

## External Dependencies
- **@neondatabase/serverless**: Serverless PostgreSQL connection (though current implementation uses DuckDB in-memory).
- **drizzle-orm**: Type-safe ORM for database operations.
- **@tanstack/react-query**: Server state management.
- **multer**: File upload handling.
- **@radix-ui/react-***: Accessible UI components.
- **PyMuPDF**: For comprehensive PDF metadata extraction.
- **scikit-learn**: For TF-IDF vectorization and cosine similarity in the AI comparison engine.
- **SentenceTransformers**: For vector similarity analysis.
- **ONNX Runtime**: For ML model inference (planned integration).
- **Stripe**: For payment processing and subscription upgrades.
- **passport-google-oauth20**: For Google OAuth authentication.

## Recent Changes

### November 17, 2025 - Complete Domain Migration & SEO Cleanup
- **Domain Updates**: Migrated all URLs from `document-authenticator.replit.app` to `checkbyai.net`
  - Updated sitemap.xml with correct domain for all 11 pages
  - Updated robots.txt sitemap URL to `https://checkbyai.net/sitemap.xml`
  - Updated canonical URLs in index.html and all React components
  - Updated Open Graph and Twitter meta tags across all pages
  - Updated structured data (schema.org) URLs to production domain
- **Keyword Stuffing Eliminated**: Removed excessive "COS check by AI" repetition
  - Dashboard page: Rewrote from robotic to natural language
  - HeroSection H1: Changed to "Check if Your UK Certificate of Sponsorship is Genuine"
  - Removed unnatural keyword repetition while maintaining SEO value
- **Content Improvements**:
  - All meta descriptions now sound human and conversational
  - H1 tags clear and keyword-rich without stuffing
  - Each page has unique title and description
  - Updated button text from "Start COS Check by AI" to "Verify Your CoS Now"
- **Technical SEO Verification**:
  - ✅ robots.txt allows all crawlers (`User-agent: *` / `Allow: /`)
  - ✅ No `noindex` meta tags on any pages
  - ✅ Server-rendered H1 content for crawlers
  - ✅ Clean sitemap with 11 indexed pages
  - ✅ All canonical URLs use production domain
- **Search Engine Setup**:
  - Created comprehensive SEO_SETUP_GUIDE.md with step-by-step instructions
  - Google Search Console verification file uploaded (`google68dfa0093d925662.html`)
  - Bing Webmaster Tools setup guide
  - URL verification checklist
  - Post-deployment monitoring instructions

### November 16, 2025 - Comprehensive SEO Overhaul & Content Strategy
- **Foundation Fixed**: Updated sitemap.xml with 4 new guides + 3 trust pages, verified robots.txt, confirmed no noindex tags
- **Keyword Stuffing Eliminated**: Completely rewrote /cos-check-ai page from spammy "COS check by AI" repetition to natural, human-focused language
  - New H1: "Check if Your UK Certificate of Sponsorship is Genuine"
  - Educational sections: What is CoS, Risks, How AI works, When to check
  - Comprehensive FAQ with 5 practical questions + FAQPage schema
  - Gov.uk resource links for authority
- **Content Depth Added**: Created 4 comprehensive guides (1,500-2,500 words each):
  1. How to Check if a UK Certificate of Sponsorship is Genuine - Manual + AI verification methods, checklists, gov.uk references
  2. Common CoS Scams and Red Flags - Real fraud statistics (87%, 94%, £2.7M lost), specific patterns, quotable data
  3. Employer's Guide: Avoiding Fake Certificates of Sponsorship - Compliance focus for sponsors
  4. What to Do if You Think Your CoS is Fake - Step-by-step action plan optimized for AI quoting
- **AI Search Optimization**: All guides feature question-based headings, bullet-point answers, real-world data for AI models to quote
- **Homepage Branding**: Updated index.html to distinguish from generic AI text detection tools (ZeroGPT/GPTZero)
  - Title: "AI Certificate of Sponsorship Checker | Verify UK CoS Documents"
  - Eliminated excessive keyword repetition, focused on UK visa/immigration positioning
  - Updated schema to natural language with realistic feature descriptions
- **Clean URLs Implemented**: Added Express middleware to serve extensionless URLs (/cos-check-ai not /cos-check-ai.html)
- **Trust Pages Created**: About, Privacy Policy, Data Security pages for EEAT (Experience, Expertise, Authoritativeness, Trust)
- **Internal Linking**: Topic cluster built with cross-links between guides, main checker, and educational content
- **Schema Markup**: FAQPage schema on cos-check-ai.html, HowTo schema on guides, improved WebApplication schema
- **SEO Metrics**: Content optimized for both traditional Google search and AI search engines (ChatGPT, Perplexity, Gemini)

### November 16, 2025 - Package Updates & Type System Standardization
- **Dependencies**: Updated 80+ npm packages to latest versions
  - react-spring 9.x → @react-spring/web 10.x (breaking change migration)
  - web-vitals 4.x → 5.1.x (onFID → onINP, new Metric typing)
  - All @radix-ui packages, @types packages, build tools updated
- **Type System**: Standardized VerificationResult types across all components
  - Unified all verification result types to lowercase values ('genuine', 'suspicious', 'fake')
  - Updated FileUpload.tsx, FileUploadSimple.tsx, VerificationResults.tsx, Dashboard.tsx, COSDashboard.tsx, UserPortal.tsx
  - Added AnalysisDocument interface to shared/api-types.ts for admin portal
  - Display capitalization handled uniformly via .charAt(0).toUpperCase()
- **Breaking Changes Fixed**:
  - AnimatedBackground.tsx, HeroSection.tsx: Migrated to @react-spring/web imports
  - PerformanceOptimizer.tsx: Updated to web-vitals v5 API (onCLS, onLCP, onFCP, onTTFB, onINP)
  - SubscriptionModal.tsx: Fixed mutation type with proper JSON parsing
- **Quality**: Zero TypeScript errors from package updates; application running successfully with hot reload

### July 31, 2025 - Complete Technical SEO Optimization
- **Meta Tags**: Fixed meta description length (217→135 chars), added comprehensive keywords targeting "COS check by AI"
- **Structure**: Added proper H1 tags throughout site, implemented internal linking strategy for better crawling
- **Social**: Complete Open Graph meta tags with custom SVG image for social sharing optimization
- **Performance**: WWW/non-WWW redirects, cache headers (1 year for static assets), security headers implementation
- **Security**: Directory listing protection, XSS protection, content-type options, frame options
- **Navigation**: Created NavigationLinks component for structured internal site navigation
- **Ranking**: Enhanced title tags and content with "Check by AI" keywords for search optimization

### July 30, 2025 - AI-Focused Search Term Optimization
- Updated meta titles, descriptions, keywords to target "COS check by AI", "check by AI", "COS check"
- Enhanced HeroSection content with AI-focused terminology and structured data optimization
- Created dedicated /cos-check-ai.html page with FAQ schema and rich AI content
- Updated sitemap.xml and robots.txt for improved search engine crawling
- Enhanced dashboard SEO meta tags with AI verification terminology