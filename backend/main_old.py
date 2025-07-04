from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import fitz  # PyMuPDF
import json
import os
from typing import List, Dict, Any
import hashlib
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

app = FastAPI(title="COS Checker API")

# In-memory database for demo purposes
trusted_patterns = []
submitted_documents = {}
verification_results = {}

class TrustedPattern:
    def __init__(self, id: int, filename: str, metadata: dict):
        self.id = id
        self.filename = filename
        self.metadata = metadata
        self.pattern_hash = self.generate_pattern_hash(metadata)
        
    def generate_pattern_hash(self, metadata: dict) -> str:
        # Generate a hash of key metadata fields for quick comparison
        key_fields = ['dc:date', 'dc:language', 'pdf:Producer', 'xmp:CreateDate', 
                     'xmp:CreatorTool', 'xmp:MetadataDate']
        
        hash_string = ""
        for field in key_fields:
            if field in metadata:
                hash_string += f"{field}:{metadata[field]}|"
                
        return hashlib.sha256(hash_string.encode()).hexdigest()

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


@app.post("/api/auth/login")
async def login(credentials: dict):
    """Login endpoint for authentication"""
    username = credentials.get("username")
    password = credentials.get("password")
    
    # Simple authentication logic - in production use proper password hashing
    if username and password:
        # Determine user role
        role = "admin" if username.lower() == "admin" else "user"
        
        return {
            "token": f"auth_token_{username}",
            "user": {
                "username": username,
                "role": role
            }
        }
    else:
        raise HTTPException(status_code=401, detail="Invalid credentials")


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
        metadata = await ai_engine.extract_metadata(file_path)
        patterns = await ai_engine.extract_patterns(file_path)
        
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
        metadata = await ai_engine.extract_metadata(file_path)
        trusted_patterns = await db_manager.get_trusted_patterns()
        
        # Perform verification
        analysis = await ai_engine.analyze_against_patterns(metadata, trusted_patterns)
        
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