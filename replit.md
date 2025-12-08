# COS Verification System

## Overview
This project is an AI-powered Certificate of Sponsorship (COS) verification system designed to detect fake or edited COS documents. It features a user portal for document verification and an admin portal for managing trusted patterns. The system uses machine learning, including rule-based matching, vector similarity, and ML model inference, to provide accurate authenticity assessments. The primary goal is to offer a reliable tool for verifying critical immigration documents and combating fraud.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The system employs a dual-portal design. An Admin Portal facilitates the upload of genuine COS documents to a Trusted Patterns Database, while a User Portal allows users to upload COS documents for AI verification. Verification results are classified as Genuine, Edited, or Fake, accompanied by a confidence score.

**Frontend:**
- **Framework**: React with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui
- **Routing**: Wouter
- **State Management**: TanStack Query
- **Build Tool**: Vite with SWC
- **3D Graphics**: Three.js with @react-three/fiber for an animated landing page.
- **UI/UX Decisions**: Professional color scheme, adaptive color-changing result badges with gradient backgrounds and animations, mobile optimization with responsive design.

**Backend:**
- **Runtime**: FastAPI with async support.
- **Database**: DuckDB for in-memory storage of trusted patterns and verification results, supporting `users`, `trusted_cos_patterns`, `submitted_cos`, and `verification_results` tables.
- **PDF Processing**: PyMuPDF for comprehensive metadata extraction (including XMP metadata).
- **AI Engine**: COSVerifier, utilizing SentenceTransformers for vector similarity.
- **Comparison Methods**: Rule-based exact matching, vector similarity (TF-IDF/SentenceTransformers), and ML model inference (ONNX Runtime ready).

**Key Features:**
- **User Portal**: File upload, real-time verification results with confidence scores, and analysis breakdown.
- **Admin Portal**: Management of trusted COS documents, system statistics dashboard, and detailed document analysis with XMP metadata display and admin decision tools.
- **Authentication**: Database-backed user authentication with role-based access control (admin/user) and session management. Supports Google OAuth and Email OTP verification via Resend, including daily verification limits.

## External Dependencies
- **@neondatabase/serverless**: Serverless PostgreSQL connection.
- **drizzle-orm**: Type-safe ORM.
- **@tanstack/react-query**: Server state management.
- **multer**: File upload handling.
- **@radix-ui/react-***: Accessible UI components.
- **PyMuPDF**: PDF metadata extraction.
- **scikit-learn**: TF-IDF vectorization and cosine similarity.
- **SentenceTransformers**: Vector similarity analysis.
- **ONNX Runtime**: ML model inference.
- **Stripe**: Payment processing and subscription upgrades.
- **passport-google-oauth20**: Google OAuth authentication.