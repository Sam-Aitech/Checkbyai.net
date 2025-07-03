# COS Verification System - replit.md

## Overview

This is a Certificate of Sponsorship (COS) verification system that uses AI to detect fake or edited COS documents. The application features a dual-portal design with a user interface for document verification and an admin portal for managing trusted patterns. The system leverages machine learning techniques including rule-based matching, vector similarity analysis, and ML model inference to provide accurate document authenticity assessments.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui component library
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack Query for server state management
- **Build Tool**: Vite with SWC compiler for enhanced performance

### Backend Architecture
- **Runtime**: FastAPI with async support for high performance
- **Database**: DuckDB for in-process storage
- **PDF Processing**: PyMuPDF for comprehensive metadata extraction
- **AI Engine**: ONNX Runtime for ML model inference
- **Vectorization**: TF-IDF with scikit-learn (all-MiniLM-L6-v2 model planned)

### Database Design
The system uses PostgreSQL with three main tables:
- `users`: User authentication and management
- `trusted_patterns`: Storage of verified COS documents and their metadata
- `verification_results`: Historical record of verification attempts and results

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

1. **User Verification Flow**:
   - User uploads PDF through drag-and-drop interface
   - File is validated (PDF format, size limits)
   - PDF metadata is extracted using custom analyzer
   - Document patterns are compared against trusted database
   - ML algorithms provide confidence scoring
   - Results are displayed with detailed analysis

2. **Admin Pattern Management Flow**:
   - Admin uploads genuine COS documents
   - Metadata and patterns are extracted and stored
   - Documents are added to trusted patterns database
   - System updates verification algorithms with new patterns

3. **Database Operations**:
   - All verification attempts are logged with results
   - Trusted patterns are stored with extracted metadata
   - Statistics are aggregated for dashboard display

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
- July 03, 2025. Initial setup
```

## User Preferences

```
Preferred communication style: Simple, everyday language.
```