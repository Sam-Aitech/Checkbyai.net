import numpy as np
import json
import re
import hashlib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
try:
    from sentence_transformers import SentenceTransformer
    SENTENCE_TRANSFORMERS_AVAILABLE = True
except ImportError:
    SENTENCE_TRANSFORMERS_AVAILABLE = False

class COSVerifier:
    def __init__(self):
        # Initialize SentenceTransformer model if available
        if SENTENCE_TRANSFORMERS_AVAILABLE:
            try:
                self.model = SentenceTransformer('all-MiniLM-L6-v2')
                self.use_sentence_transformer = True
                print("SentenceTransformer model loaded successfully")
            except Exception as e:
                print(f"Failed to load SentenceTransformer: {e}")
                self.use_sentence_transformer = False
        else:
            self.use_sentence_transformer = False
            
        # Fallback to TF-IDF vectorizer
        if not self.use_sentence_transformer:
            self.vectorizer = TfidfVectorizer(max_features=1000, stop_words='english')
        
        # Key metadata fields for comparison
        self.key_fields = [
            'dc:date', 
            'dc:language', 
            'pdf:Producer', 
            'xmp:CreateDate', 
            'xmp:CreatorTool', 
            'xmp:MetadataDate'
        ]
        
        # Enhanced thresholds for exact match detection
        self.thresholds = {
            'exact_match': 1.0,   # Perfect match for hash-based exact match
            'genuine': 0.95,      # High threshold for genuine documents
            'edited': 0.75,       # Medium threshold for edited documents
            'fake': 0.50          # Lower threshold for fake documents
        }
        
        # Store trusted patterns
        self.trusted_patterns = []
        self.genuine_embeddings = []
        
    def load_trusted_patterns(self, patterns: list):
        """Load trusted patterns and create embeddings"""
        self.trusted_patterns = []
        self.genuine_embeddings = []
        
        # Convert all patterns to strings
        pattern_strings = []
        for pattern in patterns:
            pattern_str = self._pattern_to_string(pattern['metadata'])
            pattern_strings.append(pattern_str)
            self.trusted_patterns.append(pattern)
        
        # Create embeddings
        if pattern_strings:
            if self.use_sentence_transformer:
                # Use SentenceTransformer for high-quality embeddings
                self.genuine_embeddings = self.model.encode(pattern_strings)
                print(f"Generated embeddings for {len(pattern_strings)} trusted patterns using SentenceTransformer")
            else:
                # Fallback to TF-IDF
                self.genuine_embeddings = self.vectorizer.fit_transform(pattern_strings)
                print(f"Generated TF-IDF embeddings for {len(pattern_strings)} trusted patterns")
            
        return len(self.trusted_patterns)
    
    def _pattern_to_string(self, metadata: dict) -> str:
        """Convert metadata dictionary to string for embedding"""
        result = ""
        for field in self.key_fields:
            if field in metadata:
                result += f"{field}: {metadata[field]}\n"
        return result
    
    def _clean_value(self, value: str) -> str:
        """Clean metadata values for comparison"""
        # Convert to lowercase
        value = str(value).lower()
        
        # Remove extra whitespace
        value = re.sub(r'\s+', ' ', value).strip()
        
        return value
    
    def _compare_exact_match(self, extracted_metadata: dict) -> tuple:
        """Check for exact match using hash comparison and field-by-field comparison"""
        # Generate hash string from key fields
        hash_string = ""
        for field in self.key_fields:
            if field in extracted_metadata:
                hash_string += f"{field}:{self._clean_value(extracted_metadata[field])}|"
                
        # Generate SHA-256 hash
        pattern_hash = hashlib.sha256(hash_string.encode()).hexdigest()
        
        # Check against all trusted patterns
        for pattern in self.trusted_patterns:
            # First try hash comparison if available
            if pattern.get('pattern_hash') == pattern_hash:
                return True, pattern
            
            # Fallback to field-by-field exact comparison
            if self._is_perfect_field_match(extracted_metadata, pattern):
                return True, pattern
        
        return False, None
    
    def _is_perfect_field_match(self, extracted_metadata: dict, pattern: dict) -> bool:
        """Check if all key fields match exactly"""
        pattern_metadata = pattern.get('metadata', {})
        
        for field in self.key_fields:
            if field not in extracted_metadata or field not in pattern_metadata:
                return False
                
            extracted_val = self._clean_value(extracted_metadata[field])
            pattern_val = self._clean_value(pattern_metadata[field])
            
            if extracted_val != pattern_val:
                return False
                
        return True
    
    def _compare_vector_similarity(self, extracted_metadata: dict) -> tuple:
        """Compare using SentenceTransformer or TF-IDF vectors and cosine similarity"""
        if not self.trusted_patterns:
            return 0, None
            
        # Convert extracted metadata to string
        extracted_str = self._pattern_to_string(extracted_metadata)
        
        if self.use_sentence_transformer:
            # Use SentenceTransformer for high-quality embeddings
            extracted_embedding = self.model.encode([extracted_str])
            
            # Calculate cosine similarities with all trusted patterns
            similarities = cosine_similarity(extracted_embedding, self.genuine_embeddings)[0]
        else:
            # Fallback to TF-IDF
            extracted_vector = self.vectorizer.transform([extracted_str])
            similarities = cosine_similarity(extracted_vector, self.genuine_embeddings)[0]
        
        # Find best match
        if len(similarities) > 0:
            best_match_idx = np.argmax(similarities)
            best_similarity = similarities[best_match_idx]
            best_pattern = self.trusted_patterns[best_match_idx]
            
            print(f"Vector similarity: {best_similarity:.4f}")
            print(f"Best matching pattern: {best_pattern.get('filename', 'Unknown')}")
            
            # For SentenceTransformer, use higher threshold and less field penalty
            if self.use_sentence_transformer:
                # Apply lighter field-based penalty for SentenceTransformer
                field_similarity = self._calculate_field_similarity(extracted_metadata, best_pattern['metadata'])
                combined_similarity = (best_similarity * 0.8) + (field_similarity * 0.2)
            else:
                # Apply heavier field-based penalty for TF-IDF
                field_similarity = self._calculate_field_similarity(extracted_metadata, best_pattern['metadata'])
                combined_similarity = (best_similarity * 0.3) + (field_similarity * 0.7)
            
            print(f"Combined similarity: {combined_similarity:.4f}")
            return combined_similarity, best_pattern
        
        return 0, None
    
    def _calculate_field_similarity(self, metadata1: dict, metadata2: dict) -> float:
        """Calculate field-based similarity for better fake detection"""
        matched_fields = 0
        total_fields = len(self.key_fields)
        
        for field in self.key_fields:
            if field in metadata1 and field in metadata2:
                val1 = self._clean_value(metadata1[field])
                val2 = self._clean_value(metadata2[field])
                
                if val1 == val2:
                    matched_fields += 1
                elif self._string_similarity(val1, val2) > 0.8:
                    # Partial match for similar values
                    matched_fields += 0.5
        
        return matched_fields / total_fields
    
    def _string_similarity(self, str1: str, str2: str) -> float:
        """Calculate string similarity using simple edit distance"""
        if str1 == str2:
            return 1.0
        
        # Simple Levenshtein distance approximation
        len1, len2 = len(str1), len(str2)
        if len1 == 0 or len2 == 0:
            return 0.0
        
        # Count common characters
        common = sum(1 for a, b in zip(str1, str2) if a == b)
        max_len = max(len1, len2)
        
        return common / max_len
    
    def _field_by_field_comparison(self, extracted_metadata: dict, pattern: dict) -> tuple:
        """Do detailed field-by-field comparison"""
        matched_fields = []
        mismatched_fields = []
        
        for field in self.key_fields:
            if field in extracted_metadata and field in pattern['metadata']:
                extracted_val = self._clean_value(extracted_metadata[field])
                pattern_val = self._clean_value(pattern['metadata'][field])
                
                if extracted_val == pattern_val:
                    matched_fields.append(field)
                else:
                    mismatched_fields.append(field)
            else:
                mismatched_fields.append(field)
                
        match_ratio = len(matched_fields) / len(self.key_fields)
        return match_ratio, matched_fields, mismatched_fields
    
    def verify_cos(self, extracted_metadata: dict) -> dict:
        """Main verification function"""
        if not self.trusted_patterns:
            raise ValueError("No trusted patterns loaded")
        
        # First check for exact match
        exact_match, matched_pattern = self._compare_exact_match(extracted_metadata)
        
        if exact_match:
            return {
                "type": "Genuine",
                "confidence": 1.0,  # 100% confidence for exact matches
                "matched_pattern_id": matched_pattern['id'],
                "matched_fields": self.key_fields,
                "mismatched_fields": [],
                "method": "exact_match"
            }
        
        # If no exact match, use vector similarity
        similarity_score, best_pattern = self._compare_vector_similarity(extracted_metadata)
        
        if similarity_score >= self.thresholds['genuine']:
            # Do field-by-field comparison for details
            match_ratio, matched_fields, mismatched_fields = self._field_by_field_comparison(
                extracted_metadata, best_pattern
            )
            
            return {
                "type": "Genuine",
                "confidence": float(similarity_score),
                "matched_pattern_id": best_pattern['id'],
                "matched_fields": matched_fields,
                "mismatched_fields": mismatched_fields,
                "method": "vector_similarity"
            }
        elif similarity_score >= self.thresholds['edited']:
            # Do field-by-field comparison for details
            match_ratio, matched_fields, mismatched_fields = self._field_by_field_comparison(
                extracted_metadata, best_pattern
            )
            
            return {
                "type": "Edited",
                "confidence": float(similarity_score),
                "matched_pattern_id": best_pattern['id'],
                "matched_fields": matched_fields,
                "mismatched_fields": mismatched_fields,
                "method": "vector_similarity"
            }
        else:
            # Check if it's completely fake
            return {
                "type": "Fake",
                "confidence": float(similarity_score),
                "matched_pattern_id": None,
                "matched_fields": [],
                "mismatched_fields": self.key_fields,
                "method": "vector_similarity"
            }