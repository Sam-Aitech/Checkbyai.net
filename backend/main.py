import asyncio
import os
from contextlib import asynccontextmanager
from typing import List, Optional

import duckdb
import uvicorn
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .database import DatabaseManager
from .pdf_analyzer import PDFAnalyzer
from .models import VerificationResult, StatsResponse, TrustedPattern


# Database and analyzer instances
db_manager = None
pdf_analyzer = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    global db_manager, pdf_analyzer
    
    # Initialize database
    db_manager = DatabaseManager()
    await db_manager.initialize()
    
    # Initialize PDF analyzer
    pdf_analyzer = PDFAnalyzer()
    await pdf_analyzer.initialize()
    
    yield
    
    # Shutdown
    if db_manager:
        await db_manager.close()


app = FastAPI(
    title="COS Verification System",
    description="Certificate of Sponsorship verification using AI-powered PDF analysis",
    version="2.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "message": "COS Verification System is running"}


@app.get("/api/stats", response_model=StatsResponse)
async def get_stats():
    """Get system statistics"""
    try:
        stats = await db_manager.get_statistics()
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch statistics: {str(e)}")


@app.get("/api/trusted-patterns", response_model=List[TrustedPattern])
async def get_trusted_patterns():
    """Get all trusted patterns"""
    try:
        patterns = await db_manager.get_trusted_patterns()
        return patterns
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch trusted patterns: {str(e)}")


@app.post("/api/admin/upload-pattern")
async def upload_trusted_pattern(file: UploadFile = File(...)):
    """Upload a trusted COS pattern (admin only)"""
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")
    
    try:
        # Save uploaded file temporarily
        file_path = f"/tmp/{file.filename}"
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Extract metadata and patterns
        metadata = await pdf_analyzer.extract_metadata(file_path)
        patterns = await pdf_analyzer.extract_patterns(file_path)
        
        # Store in database
        pattern_id = await db_manager.create_trusted_pattern(
            filename=file.filename,
            metadata=metadata,
            patterns=patterns
        )
        
        # Cleanup
        os.remove(file_path)
        
        return {
            "id": pattern_id,
            "filename": file.filename,
            "status": "active",
            "message": "Trusted pattern uploaded successfully"
        }
        
    except Exception as e:
        # Cleanup on error
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Failed to process uploaded pattern: {str(e)}")


@app.post("/api/verify", response_model=VerificationResult)
async def verify_document(file: UploadFile = File(...)):
    """Verify a COS document"""
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")
    
    try:
        # Save uploaded file temporarily
        file_path = f"/tmp/{file.filename}"
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Extract metadata and analyze
        metadata = await pdf_analyzer.extract_metadata(file_path)
        trusted_patterns = await db_manager.get_trusted_patterns()
        
        # Perform verification
        analysis = await pdf_analyzer.analyze_against_patterns(metadata, trusted_patterns)
        
        # Store verification result
        result_id = await db_manager.create_verification_result(
            filename=file.filename,
            result=analysis["result"],
            confidence=analysis["confidence"],
            metadata=metadata,
            analysis_details=analysis["details"]
        )
        
        # Cleanup
        os.remove(file_path)
        
        return {
            "id": result_id,
            "result": analysis["result"],
            "confidence": analysis["confidence"],
            "details": analysis["details"]
        }
        
    except Exception as e:
        # Cleanup on error
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Failed to verify document: {str(e)}")


@app.get("/api/admin/recent-activity")
async def get_recent_activity():
    """Get recent verification activity (admin only)"""
    try:
        activity = await db_manager.get_recent_activity(limit=20)
        return activity
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch recent activity: {str(e)}")


@app.delete("/api/admin/trusted-patterns/{pattern_id}")
async def delete_trusted_pattern(pattern_id: int):
    """Delete a trusted pattern (admin only)"""
    try:
        await db_manager.delete_trusted_pattern(pattern_id)
        return {"success": True, "message": "Trusted pattern deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete pattern: {str(e)}")


if __name__ == "__main__":
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )