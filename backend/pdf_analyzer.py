import asyncio
import os
import re
from datetime import datetime
from typing import Dict, List, Any, Optional
import json
import math

import fitz  # PyMuPDF
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from .models import PDFMetadata, AnalysisResult, VerificationDetails


class PDFAnalyzer:
    def __init__(self):
        self.vectorizer = TfidfVectorizer(max_features=1000, stop_words='english')
        self.is_initialized = False

    async def initialize(self):
        """Initialize the PDF analyzer"""
        self.is_initialized = True

    async def extract_metadata(self, file_path: str) -> Dict[str, Any]:
        """Extract comprehensive metadata from PDF using PyMuPDF"""
        try:
            doc = fitz.open(file_path)
            metadata = doc.metadata
            
            # Basic metadata
            extracted_metadata = {
                "producer": metadata.get("producer", ""),
                "creator": metadata.get("creator", ""),
                "title": metadata.get("title", ""),
                "subject": metadata.get("subject", ""),
                "author": metadata.get("author", ""),
                "creation_date": metadata.get("creationDate", ""),
                "modification_date": metadata.get("modDate", ""),
                "pages": doc.page_count,
                "file_size": os.path.getsize(file_path),
                "format": metadata.get("format", ""),
                "encryption": metadata.get("encryption", ""),
                "keywords": metadata.get("keywords", "")
            }

            # Extract text content for pattern analysis
            text_content = ""
            for page_num in range(min(5, doc.page_count)):  # Analyze first 5 pages
                page = doc[page_num]
                text_content += page.get_text()

            extracted_metadata["text_content"] = text_content[:2000]  # First 2000 chars
            extracted_metadata["word_count"] = len(text_content.split())

            # Extract fonts and formatting information
            fonts_used = set()
            for page_num in range(min(3, doc.page_count)):
                page = doc[page_num]
                font_list = page.get_fonts()
                for font in font_list:
                    fonts_used.add(font[3])  # Font name

            extracted_metadata["fonts"] = list(fonts_used)
            
            # Document structure analysis
            extracted_metadata["has_images"] = self._count_images(doc)
            extracted_metadata["has_tables"] = self._detect_tables(text_content)
            extracted_metadata["language_patterns"] = self._detect_language_patterns(text_content)

            doc.close()
            return extracted_metadata

        except Exception as e:
            raise Exception(f"Failed to extract PDF metadata: {str(e)}")

    async def extract_patterns(self, file_path: str) -> Dict[str, Any]:
        """Extract document patterns for trusted pattern storage"""
        metadata = await self.extract_metadata(file_path)
        
        patterns = {
            "document_structure": {
                "page_count": metadata.get("pages", 0),
                "has_images": metadata.get("has_images", 0),
                "has_tables": metadata.get("has_tables", False),
                "word_count": metadata.get("word_count", 0)
            },
            "metadata_patterns": {
                "producer_pattern": self._normalize_producer(metadata.get("producer", "")),
                "creator_pattern": self._normalize_creator(metadata.get("creator", "")),
                "date_format": self._extract_date_format(metadata.get("creation_date", ""))
            },
            "content_patterns": {
                "fonts": metadata.get("fonts", []),
                "language_patterns": metadata.get("language_patterns", {}),
                "text_structure": self._analyze_text_structure(metadata.get("text_content", ""))
            }
        }

        return patterns

    async def analyze_against_patterns(
        self, 
        metadata: Dict[str, Any], 
        trusted_patterns: List[Any]
    ) -> Dict[str, Any]:
        """Analyze document against trusted patterns using multiple methods"""
        
        if not trusted_patterns:
            return {
                "result": "suspicious",
                "confidence": 30.0,
                "details": {
                    "metadata_verification": {
                        "creation_date": {"status": "unverified", "score": 0},
                        "producer": {"status": "unverified", "score": 0},
                        "creator": {"status": "unverified", "score": 0}
                    },
                    "pattern_matching": {
                        "document_structure": 0,
                        "formatting_patterns": 0,
                        "vector_similarity": 0
                    },
                    "ml_confidence": 30.0
                }
            }

        # Score components
        metadata_score = await self._verify_metadata(metadata, trusted_patterns)
        pattern_score = await self._match_patterns(metadata, trusted_patterns)
        vector_score = await self._calculate_vector_similarity(metadata, trusted_patterns)

        # Weighted final score
        final_confidence = (
            metadata_score * 0.4 + 
            pattern_score * 0.35 + 
            vector_score * 0.25
        )

        # Determine result based on confidence
        if final_confidence >= 85:
            result = "genuine"
        elif final_confidence >= 60:
            result = "suspicious"
        else:
            result = "fake"

        return {
            "result": result,
            "confidence": final_confidence,
            "details": {
                "metadata_verification": {
                    "creation_date": {"status": "valid", "score": metadata_score},
                    "producer": {"status": "recognized", "score": metadata_score},
                    "creator": {"status": "authentic", "score": metadata_score}
                },
                "pattern_matching": {
                    "document_structure": pattern_score,
                    "formatting_patterns": pattern_score,
                    "vector_similarity": vector_score
                },
                "ml_confidence": final_confidence
            }
        }

    def _count_images(self, doc) -> int:
        """Count images in the document"""
        image_count = 0
        for page_num in range(min(3, doc.page_count)):
            page = doc[page_num]
            image_list = page.get_images()
            image_count += len(image_list)
        return image_count

    def _detect_tables(self, text: str) -> bool:
        """Simple table detection based on text patterns"""
        # Look for patterns that suggest tabular data
        lines = text.split('\n')
        tab_count = sum(1 for line in lines if '\t' in line or '  ' in line)
        return tab_count > len(lines) * 0.1

    def _detect_language_patterns(self, text: str) -> Dict[str, Any]:
        """Detect language patterns in the text"""
        patterns = {
            "has_dates": bool(re.search(r'\d{1,2}[/-]\d{1,2}[/-]\d{2,4}', text)),
            "has_numbers": bool(re.search(r'\d+', text)),
            "has_currency": bool(re.search(r'[$£€¥]|\d+\.\d{2}', text)),
            "avg_word_length": np.mean([len(word) for word in text.split()]) if text.split() else 0
        }
        return patterns

    def _normalize_producer(self, producer: str) -> str:
        """Normalize producer string for pattern matching"""
        if not producer:
            return ""
        # Remove version numbers and normalize
        normalized = re.sub(r'\d+\.\d+', '', producer.lower())
        return re.sub(r'[^\w\s]', ' ', normalized).strip()

    def _normalize_creator(self, creator: str) -> str:
        """Normalize creator string for pattern matching"""
        if not creator:
            return ""
        normalized = re.sub(r'\d+\.\d+', '', creator.lower())
        return re.sub(r'[^\w\s]', ' ', normalized).strip()

    def _extract_date_format(self, date_str: str) -> str:
        """Extract date format pattern"""
        if not date_str:
            return "unknown"
        
        # Common PDF date formats
        if re.match(r'D:\d{14}', date_str):
            return "pdf_standard"
        elif re.match(r'\d{4}-\d{2}-\d{2}', date_str):
            return "iso_date"
        elif re.match(r'\d{2}/\d{2}/\d{4}', date_str):
            return "us_date"
        else:
            return "custom"

    def _analyze_text_structure(self, text: str) -> Dict[str, Any]:
        """Analyze text structure patterns"""
        if not text:
            return {}
        
        lines = text.split('\n')
        words = text.split()
        
        return {
            "line_count": len(lines),
            "avg_line_length": np.mean([len(line) for line in lines]) if lines else 0,
            "word_count": len(words),
            "avg_word_length": np.mean([len(word) for word in words]) if words else 0,
            "capital_ratio": sum(1 for c in text if c.isupper()) / len(text) if text else 0
        }

    async def _verify_metadata(self, metadata: Dict[str, Any], trusted_patterns: List[Any]) -> float:
        """Verify metadata against trusted patterns"""
        scores = []
        
        for pattern in trusted_patterns:
            pattern_metadata = pattern.metadata if hasattr(pattern, 'metadata') else pattern.get('metadata', {})
            
            # Producer similarity
            if metadata.get("producer") and pattern_metadata.get("producer"):
                producer_sim = self._string_similarity(
                    self._normalize_producer(metadata["producer"]),
                    self._normalize_producer(pattern_metadata["producer"])
                )
                scores.append(producer_sim * 100)
            
            # Creator similarity
            if metadata.get("creator") and pattern_metadata.get("creator"):
                creator_sim = self._string_similarity(
                    self._normalize_creator(metadata["creator"]),
                    self._normalize_creator(pattern_metadata["creator"])
                )
                scores.append(creator_sim * 100)
            
            # Date format consistency
            if metadata.get("creation_date") and pattern_metadata.get("creation_date"):
                date_score = 90 if self._extract_date_format(metadata["creation_date"]) == \
                                  self._extract_date_format(pattern_metadata["creation_date"]) else 40
                scores.append(date_score)

        return np.mean(scores) if scores else 40.0

    async def _match_patterns(self, metadata: Dict[str, Any], trusted_patterns: List[Any]) -> float:
        """Match document patterns"""
        scores = []
        
        for pattern in trusted_patterns:
            pattern_data = pattern.patterns if hasattr(pattern, 'patterns') else pattern.get('patterns', {})
            
            # Document structure matching
            structure_score = self._compare_structure(metadata, pattern_data)
            scores.append(structure_score)
            
            # Font matching
            font_score = self._compare_fonts(metadata.get("fonts", []), 
                                           pattern_data.get("content_patterns", {}).get("fonts", []))
            scores.append(font_score)

        return np.mean(scores) if scores else 50.0

    async def _calculate_vector_similarity(self, metadata: Dict[str, Any], trusted_patterns: List[Any]) -> float:
        """Calculate vector similarity using TF-IDF"""
        current_text = metadata.get("text_content", "")
        if not current_text:
            return 40.0
        
        pattern_texts = []
        for pattern in trusted_patterns:
            pattern_metadata = pattern.metadata if hasattr(pattern, 'metadata') else pattern.get('metadata', {})
            pattern_text = pattern_metadata.get("text_content", "")
            if pattern_text:
                pattern_texts.append(pattern_text)
        
        if not pattern_texts:
            return 40.0
        
        try:
            # Combine current text with pattern texts
            all_texts = [current_text] + pattern_texts
            tfidf_matrix = self.vectorizer.fit_transform(all_texts)
            
            # Calculate similarity between current text and patterns
            current_vector = tfidf_matrix[0:1]
            pattern_vectors = tfidf_matrix[1:]
            
            similarities = cosine_similarity(current_vector, pattern_vectors)[0]
            max_similarity = np.max(similarities) if len(similarities) > 0 else 0
            
            return max_similarity * 100
            
        except Exception:
            return 40.0

    def _string_similarity(self, str1: str, str2: str) -> float:
        """Calculate string similarity using simple edit distance"""
        if not str1 or not str2:
            return 0.0
        
        str1, str2 = str1.lower(), str2.lower()
        
        if str1 == str2:
            return 1.0
        
        # Simple similarity based on common words
        words1 = set(str1.split())
        words2 = set(str2.split())
        
        if not words1 or not words2:
            return 0.0
        
        intersection = words1.intersection(words2)
        union = words1.union(words2)
        
        return len(intersection) / len(union) if union else 0.0

    def _compare_structure(self, metadata: Dict[str, Any], pattern_data: Dict[str, Any]) -> float:
        """Compare document structure"""
        structure_pattern = pattern_data.get("document_structure", {})
        
        scores = []
        
        # Page count similarity
        if "pages" in metadata and "page_count" in structure_pattern:
            page_diff = abs(metadata["pages"] - structure_pattern["page_count"])
            page_score = max(0, 100 - (page_diff * 10))
            scores.append(page_score)
        
        # Image presence
        if "has_images" in metadata and "has_images" in structure_pattern:
            img_score = 90 if bool(metadata["has_images"]) == bool(structure_pattern["has_images"]) else 30
            scores.append(img_score)
        
        # Word count similarity
        if "word_count" in metadata and "word_count" in structure_pattern:
            word_ratio = min(metadata["word_count"], structure_pattern["word_count"]) / \
                        max(metadata["word_count"], structure_pattern["word_count"], 1)
            word_score = word_ratio * 100
            scores.append(word_score)
        
        return np.mean(scores) if scores else 60.0

    def _compare_fonts(self, fonts1: List[str], fonts2: List[str]) -> float:
        """Compare font usage between documents"""
        if not fonts1 or not fonts2:
            return 50.0
        
        set1 = set(fonts1)
        set2 = set(fonts2)
        
        intersection = set1.intersection(set2)
        union = set1.union(set2)
        
        if not union:
            return 50.0
        
        return (len(intersection) / len(union)) * 100