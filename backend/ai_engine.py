"""
AI Engine for COS Verification System
Handles PDF analysis and verification using PyMuPDF and machine learning
"""

import os
import tempfile
from typing import Dict, List, Any, Optional
import numpy as np
from datetime import datetime
import fitz  # PyMuPDF
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import json


class AIEngine:
    """
    AI-powered PDF analysis engine for Certificate of Sponsorship verification
    """
    
    def __init__(self):
        self.vectorizer = TfidfVectorizer(
            max_features=1000,
            stop_words='english',
            ngram_range=(1, 2)
        )
        
    async def initialize(self):
        """Initialize the AI engine"""
        print("AI Engine initialized successfully")
        
    async def extract_metadata(self, file_path: str) -> Dict[str, Any]:
        """Extract comprehensive metadata from PDF using PyMuPDF"""
        try:
            doc = fitz.open(file_path)
            metadata = doc.metadata
            
            # Basic metadata
            extracted_metadata = {
                'producer': metadata.get('producer', ''),
                'creator': metadata.get('creator', ''),
                'title': metadata.get('title', ''),
                'subject': metadata.get('subject', ''),
                'author': metadata.get('author', ''),
                'creation_date': metadata.get('creationDate', ''),
                'modification_date': metadata.get('modDate', ''),
                'pages': doc.page_count,
                'file_size': os.path.getsize(file_path)
            }
            
            # Additional analysis
            text_content = ""
            for page_num in range(doc.page_count):
                page = doc[page_num]
                text_content += page.get_text()
            
            extracted_metadata.update({
                'text_length': len(text_content),
                'word_count': len(text_content.split()),
                'fonts_used': self._extract_fonts(doc),
                'images_count': self._count_images(doc),
                'has_tables': self._detect_tables(text_content),
                'language_indicators': self._detect_language_patterns(text_content)
            })
            
            doc.close()
            return extracted_metadata
            
        except Exception as e:
            print(f"Error extracting metadata: {e}")
            return {}
    
    async def extract_patterns(self, file_path: str) -> Dict[str, Any]:
        """Extract document patterns for trusted pattern storage"""
        try:
            doc = fitz.open(file_path)
            
            # Extract text from all pages
            full_text = ""
            for page_num in range(doc.page_count):
                page = doc[page_num]
                full_text += page.get_text()
            
            patterns = {
                'document_structure': self._analyze_text_structure(full_text),
                'metadata_patterns': doc.metadata,
                'page_count': doc.page_count,
                'fonts': self._extract_fonts(doc),
                'creation_info': {
                    'producer': doc.metadata.get('producer', ''),
                    'creator': doc.metadata.get('creator', ''),
                    'creation_date': doc.metadata.get('creationDate', '')
                }
            }
            
            doc.close()
            return patterns
            
        except Exception as e:
            print(f"Error extracting patterns: {e}")
            return {}
    
    async def analyze_against_patterns(
        self, 
        metadata: Dict[str, Any], 
        trusted_patterns: List[Any]
    ) -> Dict[str, Any]:
        """Analyze document against trusted patterns using multiple methods"""
        
        if not trusted_patterns:
            return {
                'result': 'suspicious',
                'confidence': 30.0,
                'details': {
                    'metadata_verification': {},
                    'pattern_matching': {},
                    'vector_similarity': 0.0,
                    'ml_confidence': 30.0
                }
            }
        
        # Metadata verification
        metadata_score = await self._verify_metadata(metadata, trusted_patterns)
        
        # Pattern matching
        pattern_score = await self._match_patterns(metadata, trusted_patterns)
        
        # Vector similarity
        vector_score = await self._calculate_vector_similarity(metadata, trusted_patterns)
        
        # Calculate final confidence
        confidence = (metadata_score * 0.4 + pattern_score * 0.4 + vector_score * 0.2)
        
        # Determine result based on confidence
        if confidence >= 80:
            result = 'genuine'
        elif confidence >= 50:
            result = 'suspicious'
        else:
            result = 'fake'
        
        return {
            'result': result,
            'confidence': confidence,
            'details': {
                'metadata_verification': {
                    'creation_date': {'status': 'verified' if metadata_score > 70 else 'suspicious', 'score': metadata_score},
                    'producer': {'status': 'verified' if pattern_score > 70 else 'suspicious', 'score': pattern_score},
                    'creator': {'status': 'verified' if vector_score > 70 else 'suspicious', 'score': vector_score}
                },
                'pattern_matching': {
                    'document_structure': pattern_score,
                    'formatting_patterns': metadata_score,
                    'vector_similarity': vector_score
                },
                'vector_similarity': vector_score,
                'ml_confidence': confidence
            }
        }
    
    def _extract_fonts(self, doc) -> List[str]:
        """Extract fonts used in the document"""
        fonts = set()
        for page_num in range(doc.page_count):
            page = doc[page_num]
            blocks = page.get_text("dict")["blocks"]
            for block in blocks:
                if "lines" in block:
                    for line in block["lines"]:
                        for span in line["spans"]:
                            fonts.add(span.get("font", ""))
        return list(fonts)
    
    def _count_images(self, doc) -> int:
        """Count images in the document"""
        image_count = 0
        for page_num in range(doc.page_count):
            page = doc[page_num]
            image_count += len(page.get_images())
        return image_count
    
    def _detect_tables(self, text: str) -> bool:
        """Simple table detection based on text patterns"""
        lines = text.split('\n')
        table_indicators = 0
        for line in lines:
            if '\t' in line or line.count(' ') > 10:
                table_indicators += 1
        return table_indicators > 5
    
    def _detect_language_patterns(self, text: str) -> Dict[str, Any]:
        """Detect language patterns in the text"""
        common_words = {
            'english': ['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use'],
            'certificate_terms': ['certificate', 'sponsorship', 'visa', 'immigration', 'skilled', 'worker', 'tier', 'points']
        }
        
        text_lower = text.lower()
        patterns = {}
        
        for lang, words in common_words.items():
            count = sum(1 for word in words if word in text_lower)
            patterns[f'{lang}_score'] = count / len(words) * 100
            
        return patterns
    
    def _analyze_text_structure(self, text: str) -> Dict[str, Any]:
        """Analyze text structure patterns"""
        lines = text.split('\n')
        return {
            'total_lines': len(lines),
            'non_empty_lines': len([line for line in lines if line.strip()]),
            'avg_line_length': np.mean([len(line) for line in lines]),
            'has_headings': any(line.isupper() and len(line) < 50 for line in lines),
            'paragraph_count': len([line for line in lines if len(line.strip()) > 100])
        }
    
    async def _verify_metadata(self, metadata: Dict[str, Any], trusted_patterns: List[Any]) -> float:
        """Verify metadata against trusted patterns"""
        scores = []
        
        for pattern in trusted_patterns:
            pattern_data = pattern.get('patterns', {}) if hasattr(pattern, 'patterns') else pattern
            metadata_patterns = pattern_data.get('metadata_patterns', {})
            
            # Compare producers
            if metadata.get('producer') and metadata_patterns.get('producer'):
                similarity = self._string_similarity(
                    metadata['producer'], 
                    metadata_patterns['producer']
                )
                scores.append(similarity * 100)
            
            # Compare creators
            if metadata.get('creator') and metadata_patterns.get('creator'):
                similarity = self._string_similarity(
                    metadata['creator'], 
                    metadata_patterns['creator']
                )
                scores.append(similarity * 100)
        
        return np.mean(scores) if scores else 30.0
    
    async def _match_patterns(self, metadata: Dict[str, Any], trusted_patterns: List[Any]) -> float:
        """Match document patterns"""
        scores = []
        
        for pattern in trusted_patterns:
            pattern_data = pattern.get('patterns', {}) if hasattr(pattern, 'patterns') else pattern
            
            # Compare document structure
            structure_score = self._compare_structure(metadata, pattern_data)
            scores.append(structure_score)
            
            # Compare fonts
            if 'fonts_used' in metadata and 'fonts' in pattern_data:
                font_score = self._compare_fonts(
                    metadata['fonts_used'], 
                    pattern_data['fonts']
                )
                scores.append(font_score * 100)
        
        return np.mean(scores) if scores else 40.0
    
    async def _calculate_vector_similarity(self, metadata: Dict[str, Any], trusted_patterns: List[Any]) -> float:
        """Calculate vector similarity using TF-IDF"""
        try:
            # Prepare text for vectorization
            current_text = " ".join([
                str(metadata.get('title', '')),
                str(metadata.get('subject', '')),
                str(metadata.get('producer', '')),
                str(metadata.get('creator', ''))
            ])
            
            pattern_texts = []
            for pattern in trusted_patterns:
                pattern_data = pattern.get('patterns', {}) if hasattr(pattern, 'patterns') else pattern
                metadata_patterns = pattern_data.get('metadata_patterns', {})
                pattern_text = " ".join([
                    str(metadata_patterns.get('title', '')),
                    str(metadata_patterns.get('subject', '')),
                    str(metadata_patterns.get('producer', '')),
                    str(metadata_patterns.get('creator', ''))
                ])
                pattern_texts.append(pattern_text)
            
            if not pattern_texts or not current_text.strip():
                return 35.0
            
            # Calculate TF-IDF similarity
            all_texts = [current_text] + pattern_texts
            tfidf_matrix = self.vectorizer.fit_transform(all_texts)
            similarities = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:])
            
            return float(np.max(similarities) * 100)
            
        except Exception as e:
            print(f"Error calculating vector similarity: {e}")
            return 35.0
    
    def _string_similarity(self, str1: str, str2: str) -> float:
        """Calculate string similarity using simple edit distance"""
        if not str1 or not str2:
            return 0.0
            
        # Normalize strings
        str1 = str1.lower().strip()
        str2 = str2.lower().strip()
        
        if str1 == str2:
            return 1.0
            
        # Simple Levenshtein distance approximation
        max_len = max(len(str1), len(str2))
        if max_len == 0:
            return 1.0
            
        distance = abs(len(str1) - len(str2))
        for i in range(min(len(str1), len(str2))):
            if str1[i] != str2[i]:
                distance += 1
                
        return max(0.0, 1.0 - (distance / max_len))
    
    def _compare_structure(self, metadata: Dict[str, Any], pattern_data: Dict[str, Any]) -> float:
        """Compare document structure"""
        score = 0.0
        comparisons = 0
        
        # Compare page count
        if 'pages' in metadata and 'page_count' in pattern_data:
            if metadata['pages'] == pattern_data['page_count']:
                score += 100
            else:
                score += max(0, 100 - abs(metadata['pages'] - pattern_data['page_count']) * 10)
            comparisons += 1
        
        # Compare image count
        if 'images_count' in metadata:
            expected_images = pattern_data.get('images_count', 0)
            if metadata['images_count'] == expected_images:
                score += 100
            else:
                score += max(0, 100 - abs(metadata['images_count'] - expected_images) * 20)
            comparisons += 1
            
        return score / comparisons if comparisons > 0 else 50.0
    
    def _compare_fonts(self, fonts1: List[str], fonts2: List[str]) -> float:
        """Compare font usage between documents"""
        if not fonts1 or not fonts2:
            return 0.5
            
        set1 = set(fonts1)
        set2 = set(fonts2)
        
        intersection = len(set1.intersection(set2))
        union = len(set1.union(set2))
        
        return intersection / union if union > 0 else 0.5