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