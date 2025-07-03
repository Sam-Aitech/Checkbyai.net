from datetime import datetime
from typing import Dict, Any, Optional, List
from pydantic import BaseModel


class StatsResponse(BaseModel):
    trusted_patterns: int
    verifications_today: int
    suspicious_docs: int
    success_rate: str


class TrustedPattern(BaseModel):
    id: int
    filename: str
    metadata: Dict[str, Any]
    patterns: Dict[str, Any]
    uploaded_at: datetime
    status: str


class VerificationResult(BaseModel):
    id: int
    result: str  # 'genuine', 'suspicious', 'fake'
    confidence: float
    details: Dict[str, Any]


class VerificationDetails(BaseModel):
    metadata_verification: Dict[str, Any]
    pattern_matching: Dict[str, Any]
    vector_similarity: float
    ml_confidence: float


class PDFMetadata(BaseModel):
    producer: Optional[str] = None
    creator: Optional[str] = None
    title: Optional[str] = None
    subject: Optional[str] = None
    author: Optional[str] = None
    creation_date: Optional[str] = None
    modification_date: Optional[str] = None
    pages: Optional[int] = None
    file_size: Optional[int] = None
    additional_fields: Dict[str, Any] = {}


class AnalysisResult(BaseModel):
    result: str  # 'genuine', 'suspicious', 'fake'
    confidence: float
    details: VerificationDetails
    timestamp: datetime


class RecentActivity(BaseModel):
    id: int
    filename: str
    result: str
    confidence: float
    verified_at: datetime
    ip_address: Optional[str] = None