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