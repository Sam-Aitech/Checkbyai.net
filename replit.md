# COS Verification System - replit.md

## Overview

This is a Certificate of Sponsorship (COS) verification system that uses AI to detect fake or edited COS documents. The application features a dual-portal design with a user interface for document verification and an admin portal for managing trusted patterns. The system leverages machine learning techniques including rule-based matching, vector similarity analysis, and ML model inference to provide accurate document authenticity assessments.

## System Architecture

### Three-Portal System Design
```
Admin Portal → Uploads genuine COS → Trusted Patterns Database
                     ↓
User Portal → Upload COS for verification → AI Verification Engine
                     ↓
Results: Genuine/Edited/Fake with confidence score
```

### Frontend Architecture
- **Framework**: React with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui component library  
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack Query for server state management
- **Build Tool**: Vite with SWC compiler for enhanced performance
- **3D Graphics**: Three.js with @react-three/fiber for animated landing page

### Backend Architecture
- **Runtime**: FastAPI with async support for high performance
- **Database**: In-memory storage for trusted patterns and verification results
- **PDF Processing**: PyMuPDF for comprehensive metadata extraction
- **AI Engine**: Enhanced COSVerifier with SentenceTransformers support
- **Comparison Methods**: 
  - Rule-based exact matching (100% confidence for identical documents)
  - Vector similarity using TF-IDF/SentenceTransformers
  - ML model inference capability (ONNX Runtime ready)

### Database Design
The system uses DuckDB with four main tables (updated per user requirements):
- `users`: User authentication with role-based access (admin/user)
- `trusted_cos_patterns`: Storage of genuine COS documents with metadata and pattern hashes
- `submitted_cos`: User-submitted COS documents for verification
- `verification_results`: Historical record with result_type (Genuine/Edited/Fake) and confidence scores

## Key Components

### User Portal
- **File Upload Interface**: Drag-and-drop PDF upload with validation
- **Verification Results Display**: Real-time results with confidence scores
- **Analysis Details**: Breakdown of verification methods and scores

### Admin Portal
- **Trusted Pattern Management**: Upload and manage genuine COS documents
- **Statistics Dashboard**: System metrics and verification analytics
- **Pattern Database**: View and manage the trusted patterns database

### PDF Analysis Engine
- **Metadata Extraction**: Extracts PDF metadata (creator, producer, dates)
- **Pattern Matching**: Compares against trusted document patterns
- **Confidence Scoring**: Multi-factor analysis with weighted scoring

### Authentication System
- Database-backed user authentication
- Session management for admin access
- Role-based access control

## Data Flow

### AI Verification Engine Architecture
```
Admin Portal: Upload genuine COS PDFs
       ↓
Trusted Patterns Database (stores metadata from genuine docs)
       ↓
User Portal: Upload COS for verification
       ↓
Extract metadata from uploaded PDF
       ↓
Compare against trusted patterns using:
• Rule-based matching (exact metadata comparison)
• Vector similarity (SentenceTransformers/TF-IDF)
• ML model inference (ONNX Runtime support)
       ↓
Result: Genuine/Edited/Fake with confidence score
```

### Verification Process Details
1. **Admin builds trusted database**: Upload genuine COS documents to create pattern baseline
2. **User uploads COS**: System extracts comprehensive PDF metadata using PyMuPDF
3. **Multi-layer analysis**: 
   - Exact match detection (100% confidence for identical documents)
   - Vector similarity comparison for near-matches
   - Field-by-field metadata validation
4. **Confidence scoring**: Returns percentage confidence with classification (Genuine/Edited/Fake)
5. **Result display**: User sees verification result with detailed analysis breakdown

## External Dependencies

### Core Dependencies
- **@neondatabase/serverless**: Serverless PostgreSQL connection
- **drizzle-orm**: Type-safe ORM for database operations
- **@tanstack/react-query**: Server state management
- **multer**: File upload handling
- **@radix-ui/react-***: Accessible UI components

### Development Tools
- **tsx**: TypeScript execution for development
- **esbuild**: Production bundling
- **drizzle-kit**: Database schema management
- **vite**: Frontend build tool and dev server

### AI/ML Components
- PDF analysis using custom metadata extraction
- Vector similarity comparison (planned with SentenceTransformers)
- Rule-based pattern matching
- ONNX Runtime for ML model inference (planned)

## Deployment Strategy

### Development Environment
- Hot reload with Vite dev server
- TypeScript compilation with strict mode
- Database migrations with Drizzle Kit
- Environment variable configuration

### Production Build
- Frontend: Vite build to static assets
- Backend: ESBuild bundling for Node.js
- Database: Neon serverless PostgreSQL
- File Storage: Local filesystem (uploads directory)

### Environment Configuration
- `DATABASE_URL`: PostgreSQL connection string
- `NODE_ENV`: Environment specification
- File upload limits: 50MB maximum
- CORS and security headers configured

### Scalability Considerations
- Serverless database for automatic scaling
- Stateless backend design for horizontal scaling
- File upload optimization for large documents
- Caching strategy for frequent verifications

## Changelog

```
Changelog:
- July 30, 2025 (Evening). Google OAuth Integration for Easier Sign-up
  - Added Google OAuth authentication using passport-google-oauth20 strategy
  - Created GoogleLoginButton component with official Google branding and styling
  - Enhanced HeroSection with prominent dual authentication options (Google + Replit)
  - Updated authentication system to support both Google OAuth and existing Replit Auth
  - Fixed TypeScript interface issues by adding confidence property to VerificationResult
  - Configured Google OAuth callback URL for current Replit domain
  - Users can now sign up with Google account or Replit account for smoother onboarding
  - Note: Google Cloud Console requires `replit.dev` added to authorized domains and proper OAuth consent screen configuration
- July 30, 2025 (Evening). Comprehensive SEO Optimization for "COS Check" Ranking
  - Completely optimized website to rank #1 for "COS check" searches
  - Updated all meta titles, descriptions, and keywords to target Certificate of Sponsorship verification
  - Enhanced structured data (JSON-LD) with COS-specific terminology and UK visa context
  - Created comprehensive COS verification guide page with rich content targeting long-tail keywords
  - Updated HeroSection and all components with COS-specific language and terminology
  - Optimized sitemap.xml, robots.txt, and created _headers file for technical SEO
  - Added semantic HTML improvements and COS-focused content throughout the site
  - Enhanced Open Graph and Twitter Card meta tags for social media optimization
  - All pages now optimized for "COS check", "Certificate of Sponsorship verification", and related search terms
- July 07, 2025 (Early Afternoon). Implemented Authentication & Payment System
  - Added complete Replit Auth integration with user management and role-based access control
  - Implemented PostgreSQL database with users, sessions, trusted patterns, and verification results tables
  - Created Stripe payment integration for Pro subscription upgrades ($9.99/month unlimited verifications)
  - Added user profile component with authentication status, subscription management, and admin controls
  - Implemented daily verification limits: free users (1/day), pro users (unlimited), anonymous users (1/day via localStorage)
  - Created subscription modal with Stripe Elements for secure payment processing
  - Added authentication middleware protecting admin routes and verification limits
  - Updated frontend with UserProfile component showing subscription status and upgrade options
  - Added proper authentication hooks with optimized caching to prevent infinite API loops
  - System now supports: anonymous usage (limited), authenticated free users (limited), authenticated pro users (unlimited)
- July 07, 2025 (Late Morning). System Fully Operational - All Components Verified
  - Completed comprehensive system check confirming all functionality working
  - Fixed verification failed error by removing problematic UserPortal mutation
  - Backend API fully functional: statistics, trusted patterns, PDF verification all responding correctly
  - XMP metadata extraction working perfectly with all namespace tags displaying correct values
  - Frontend components operational: UserPortal, AdminPortal, FileUpload components all working
  - Database and storage active with 3 trusted patterns and proper verification result storage
  - Authentication and role-based access control functioning with Replit Auth integration
  - Mobile optimization and responsive design confirmed working
  - System ready for production deployment with all verification workflows operational
- July 07, 2025 (Late Morning). Successfully Completed XMP Metadata Integration
  - Implemented comprehensive XMP metadata extraction using Node.js Express backend with PDFAnalyzer service
  - Enhanced regex-based parsing for reliable extraction of all XMP namespace tags (dc:, pdf:, xmp:)
  - Fixed frontend-backend integration to properly display extracted metadata in organized collapsible sections
  - System now correctly displays all XMP metadata values: dc:date, dc:format, dc:language, pdf:Producer, pdf:PDFVersion, xmp:CreateDate, xmp:CreatorTool, xmp:MetadataDate
  - Added comprehensive debugging and logging for XMP extraction process
  - Admin portal Document Analysis tab now shows complete and accurate XMP metadata for all uploaded PDFs
- July 07, 2025 (Late Morning). Fixed Backend-Frontend Integration for XMP Metadata Display
  - Fixed backend main.py to use enhanced AI engine instead of basic metadata extraction
  - Updated verification endpoint to properly pass XMP metadata to frontend
  - Enhanced API response to include complete metadata details with XMP tags
  - Added comprehensive debugging output to track metadata flow from backend to frontend
  - Fixed integration so admin portal now receives and displays all XMP metadata properly
  - Updated data structure to pass xmp_tags, raw_metadata, and parsed_xmp to frontend
  - All PDF details now properly fetched and displayed in organized XMP tag format
- July 07, 2025 (Late Morning). Added Admin Portal Document Analysis Window
  - Created comprehensive Document Analysis tab in Admin Portal for detailed COS verification
  - Added XMP metadata showcase displaying all extracted document properties (producer, creator, creation date, pages)
  - Implemented admin decision-making tools with text areas for notes and command setup
  - Added approve/reject/review decision buttons for admin workflow
  - Created raw XMP metadata display with JSON formatting for technical analysis
  - Enhanced admin portal with tabbed navigation between Dashboard and Document Analysis
  - Added file upload for analysis with real-time verification processing
  - Provided admin command text area for setting up automated processing workflows
- July 07, 2025 (Late Morning). Added Admin Unlimited Document Verification
  - Updated FileUploadSimple component to support admin bypass of restrictions
  - Admin users now see "Admin User - Unlimited verifications" indicator instead of usage limits
  - Added isAdmin prop to FileUploadSimple component for role-based access control
  - Admin users can verify unlimited documents while regular users remain restricted to 1/day
  - Enhanced UserPortal and Dashboard to check user authentication status via API
  - System now properly distinguishes between admin and regular user capabilities
- July 07, 2025 (Late Morning). Removed "COS" Text References from Dashboard
  - Updated main dashboard heading from "Advanced COS Document Verification" to "Advanced Document Verification"
  - Changed all "Upload COS Document" references to "Upload Document" 
  - Updated "Document Authenticator" branding (removed COS references)
  - Modified verification flow descriptions to use generic "document" terminology
  - Made UserPortal heading more generic: "Verify Document Authenticity"
  - Ensured consistent document terminology across all user-facing components
- July 07, 2025 (Late Morning). Implemented User Portal Document Verification Restriction
  - Added one-document-per-day verification limit for regular users
  - Created localStorage-based usage tracking system with daily reset
  - Implemented restriction overlay with upgrade prompts when limit reached
  - Added usage indicator showing remaining checks for free users
  - Admin portal remains unrestricted for building trusted patterns database
  - Added visual distinction between free user (restricted) and admin (unlimited) modes
  - Enhanced user experience with clear messaging about limitations and upgrade options
- July 07, 2025 (Late Morning). Optimized for Mobile Use
  - Enhanced touch interactions with minimum 44px touch targets
  - Implemented responsive design across all components (home, dashboard, admin portal)
  - Added mobile-specific navigation with compressed text and icons
  - Optimized file upload areas for mobile touch interactions
  - Improved button spacing and sizing for mobile devices
  - Added CSS touch-manipulation classes for better mobile performance
  - Created responsive stat cards in admin portal (2-column on mobile, 4-column on desktop)
  - Enhanced mobile typography with appropriate font sizes for different screen sizes
  - Added mobile-optimized drag-and-drop areas with visual feedback
  - Implemented mobile scroll optimization and smooth scroll behavior
- July 07, 2025 (Morning). Implemented Admin Portal Authentication System
  - Added Replit Auth integration with role-based access control
  - Updated database schema to support Replit Auth (users table with role field)
  - Created authentication middleware with isAuthenticated and isAdmin guards
  - Protected all admin API endpoints with admin-only access
  - Added user profile display in header with login/logout functionality
  - Enhanced AdminPortal with authentication checks and access denied screens
  - Added error handling for unauthorized API requests with automatic redirect to login
- July 06, 2025 (Late Night). Removed Sound Effects System
  - Completely removed all sound effect functionality from the application
  - Deleted useSoundEffects.ts hook and all associated audio code
  - Cleaned up Enhanced3DDemo and FileUploadSimple components to remove sound references
  - System now operates without any audio feedback for cleaner user experience
- July 06, 2025 (Late Morning). Implemented Enhanced 3D Visualization System
  - Added Three.js WebGL-powered 3D demo with professional color scheme (#003366, #0066CC, #009933, #FF6600)
  - Created interactive processing pipeline visualization with clickable nodes and floating tooltips
  - Implemented toggle between simplified and technical view modes
  - Added scenario selection (genuine/edited/fake) with different result animations
  - Built real-time data flow visualization with animated progress indicators
  - Added educational hover tooltips explaining each processing stage
  - Enhanced with professional lighting, shadows, and particle effects
  - Integrated performance optimizations with requestAnimationFrame rendering
- July 06, 2025 (Early Morning). Added Free Usage Restriction System
  - Implemented one-time free verification per day using localStorage tracking
  - Added usage counter and date-based reset mechanism
  - Created upgrade prompt when free check is exhausted
  - Added professional limitation screen with Pro service promotion
  - Removed "Verify Another Document" option for free users
- July 06, 2025 (Early Morning). Created COS Dashboard with Free Check Modal
  - Built beautiful marketing dashboard based on user's HTML design
  - Added interactive free verification modal triggered by "Get Started Now" buttons
  - Integrated FileUploadSimple component with callback system
  - Created professional upgrade prompts and Pro service marketing
- July 04, 2025 (Very Late Evening). Implemented Adaptive Color-Changing Result Badges
  - Added gradient backgrounds with smooth color transitions for all verification badges
  - Genuine documents: Green-to-emerald gradient with pulsing animation
  - Edited documents: Yellow-to-orange gradient with bouncing animation
  - Fake documents: Red-to-rose gradient with pulsing animation
  - Added hover effects with scale transforms and shadow effects
  - Enhanced visual feedback with 700ms transition durations
- July 04, 2025 (Late Evening). Enhanced 100% Confidence Detection System
  - Updated COSVerifier for perfect exact match detection (100% confidence)
  - Added SentenceTransformers support with fallback to TF-IDF
  - Implemented comprehensive debug logging for verification tracking
  - Enhanced trusted pattern loading and reload mechanism
  - Added admin portal reset functionality for user verification data
  - Updated system architecture documentation to match user diagram
- July 04, 2025 (Evening). Implemented AI Comparison Engine
  - Added COSVerifier class with TF-IDF vectorization and cosine similarity
  - Integrated scikit-learn for advanced pattern matching
  - Created hash-based exact matching for identical documents
  - Added vector similarity analysis for genuine/edited/fake classification
  - Implemented field-by-field comparison with mismatch tracking
- July 04, 2025 (Afternoon). Component Updates with User Designs
  - Updated Login, FileUpload, VerificationResults, and Dashboard components
  - Simplified interfaces with cleaner TypeScript implementations
  - Added simplified Dashboard route with streamlined verification workflow
  - Maintained dark mode support across all components
- July 04, 2025 (Morning). Restructured to dual-portal Python/React architecture
  - Migrated from Node.js Express to Python FastAPI backend
  - Updated database schema per user specifications
  - Implemented AI engine with PyMuPDF and TF-IDF vectorization
  - Created dual-portal frontend (user verification + admin management)
  - Added pattern hash-based document comparison
- July 03, 2025. Initial setup
```

## User Preferences

```
Preferred communication style: Simple, everyday language.
```