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

@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "message": "COS Verification System is running"}

@app.post("/api/auth/login")
async def login(credentials: dict):
    """Login endpoint for authentication"""
    username = credentials.get("username")
    password = credentials.get("password")
    
    # Simple authentication logic
    if username and password:
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

@app.get("/api/stats")
async def get_stats():
    """Get system statistics"""
    return {
        "trustedPatterns": len(trusted_patterns),
        "verificationsToday": len(verification_results),
        "suspiciousDocs": sum(1 for r in verification_results.values() if r.get("type") == "Edited"),
        "successRate": "95.2"
    }

@app.get("/api/trusted-patterns")
async def get_trusted_patterns():
    """Get all trusted patterns"""
    return [
        {
            "id": pattern.id,
            "filename": pattern.filename,
            "metadata": pattern.metadata,
            "uploaded_at": "2025-01-04T00:00:00Z",
            "status": "active"
        }
        for pattern in trusted_patterns
    ]

@app.post("/api/admin/upload-pattern")
async def upload_trusted(file: UploadFile = File(...)):
    """Endpoint for admin to upload trusted COS patterns"""
    try:
        # Read PDF content
        pdf_data = await file.read()
        
        # Save uploaded file temporarily
        temp_path = f"temp_{file.filename}"
        with open(temp_path, "wb") as f:
            f.write(pdf_data)
            
        # Extract metadata
        metadata = extract_pdf_metadata(temp_path)
        
        # Remove temporary file
        os.remove(temp_path)
        
        # Create trusted pattern
        pattern_id = len(trusted_patterns) + 1
        pattern = TrustedPattern(pattern_id, file.filename, metadata)
        trusted_patterns.append(pattern)
        
        return {"message": "Trusted pattern added successfully", "pattern_id": pattern_id}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

def extract_pdf_metadata(pdf_path: str) -> dict:
    """Extract XMP metadata from PDF using PyMuPDF"""
    try:
        doc = fitz.open(pdf_path)
        metadata = doc.metadata
        
        # Close document
        doc.close()
        
        return metadata
        
    except Exception as e:
        raise ValueError(f"Error extracting metadata: {str(e)}")

@app.post("/api/verify")
async def verify_cos(file: UploadFile = File(...)):
    """Verify a COS document against trusted patterns"""
    try:
        # For demo purposes, return a mock result if no trusted patterns exist
        if not trusted_patterns:
            # Return a demo result for testing
            return {
                "result": "fake",
                "confidence": 0.15,
                "mismatchedFields": ["pdf:Producer", "xmp:CreatorTool"],
                "details": {
                    "analysis": "No trusted patterns available for comparison"
                }
            }
        
        # Read PDF content
        pdf_data = await file.read()
        
        # Save uploaded file temporarily
        temp_path = f"temp_{file.filename}"
        with open(temp_path, "wb") as f:
            f.write(pdf_data)
            
        # Extract metadata
        metadata = extract_pdf_metadata(temp_path)
        
        # Remove temporary file
        os.remove(temp_path)
        
        # Compare with trusted patterns
        result = compare_with_trusted(metadata)
        
        # Store submission
        submission_id = len(submitted_documents) + 1
        submitted_documents[submission_id] = {
            "filename": file.filename,
            "metadata": metadata
        }
        
        # Store result
        result_id = len(verification_results) + 1
        verification_results[result_id] = {
            "cos_id": submission_id,
            **result
        }
        
        # Transform result to match frontend expectations
        return {
            "result": result["type"].lower(),
            "confidence": result["confidence"],
            "mismatchedFields": result.get("mismatched_fields", [])
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Verification error: {str(e)}")

def compare_with_trusted(extracted_metadata: dict) -> dict:
    """Compare extracted metadata with trusted patterns"""
    best_match_score = 0
    best_match_index = -1
    mismatched_fields = []
    
    key_fields = ['dc:date', 'dc:language', 'pdf:Producer', 'xmp:CreateDate', 
                 'xmp:CreatorTool', 'xmp:MetadataDate']
    
    # Generate hash for extracted metadata
    extracted_hash = ""
    for field in key_fields:
        if field in extracted_metadata:
            extracted_hash += f"{field}:{extracted_metadata[field]}|"
    
    extracted_hash = hashlib.sha256(extracted_hash.encode()).hexdigest()
    
    # Check for exact hash match
    for i, pattern in enumerate(trusted_patterns):
        if pattern.pattern_hash == extracted_hash:
            return {
                "type": "Genuine",
                "confidence": 0.98,
                "mismatched_fields": []
            }
    
    # If no exact match, do field-by-field comparison
    for pattern in trusted_patterns:
        match_count = 0
        total_fields = len(key_fields)
        
        for field in key_fields:
            if field in extracted_metadata and field in pattern.metadata:
                if extracted_metadata[field] == pattern.metadata[field]:
                    match_count += 1
                else:
                    mismatched_fields.append(field)
        
        score = match_count / total_fields
        if score > best_match_score:
            best_match_score = score
            best_match_index = pattern.id
            
    # Determine result based on match score
    if best_match_score >= 0.8:
        result_type = "Genuine"
    elif best_match_score >= 0.5:
        result_type = "Edited"
    else:
        result_type = "Fake"
    
    confidence = best_match_score
    
    return {
        "type": result_type,
        "confidence": confidence,
        "mismatched_fields": mismatched_fields
    }

# Add middleware for CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)