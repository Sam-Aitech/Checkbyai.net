#!/usr/bin/env python3
"""
Test suite for COS Verification System
Validates AI comparison engine with various document scenarios
"""

import json
from cos_verifier import COSVerifier

def test_genuine_document():
    """Test verification of genuine document with exact metadata match"""
    verifier = COSVerifier()
    
    # Load trusted patterns
    trusted_patterns = [
        {
            "id": 1,
            "filename": "genuine_cos_1.pdf",
            "metadata": {
                "dc:date": "2023-10-01T12:00:00Z",
                "dc:language": "en-US",
                "pdf:Producer": "Apache FOP Version 2.3",
                "xmp:CreateDate": "2023-10-01T12:00:00Z",
                "xmp:CreatorTool": "Apache FOP Version 2.3",
                "xmp:MetadataDate": "2023-10-01T12:00:00Z"
            }
        }
    ]
    
    verifier.load_trusted_patterns(trusted_patterns)
    
    # Test with identical metadata
    extracted_metadata = {
        "dc:date": "2023-10-01T12:00:00Z",
        "dc:language": "en-US",
        "pdf:Producer": "Apache FOP Version 2.3",
        "xmp:CreateDate": "2023-10-01T12:00:00Z",
        "xmp:CreatorTool": "Apache FOP Version 2.3",
        "xmp:MetadataDate": "2023-10-01T12:00:00Z"
    }
    
    result = verifier.verify_cos(extracted_metadata)
    assert result["type"] == "Genuine", "Should identify genuine document"
    assert result["confidence"] > 0.95, "High confidence expected for genuine document"
    assert len(result["mismatched_fields"]) == 0, "No mismatched fields expected for identical documents"
    print(f"✓ Genuine document test passed: {result['confidence']:.2f} confidence")

def test_edited_document():
    """Test verification of edited document with partial metadata match"""
    verifier = COSVerifier()
    
    # Load trusted patterns
    trusted_patterns = [
        {
            "id": 1,
            "filename": "genuine_cos_1.pdf",
            "metadata": {
                "dc:date": "2023-10-01T12:00:00Z",
                "dc:language": "en-US",
                "pdf:Producer": "Apache FOP Version 2.3",
                "xmp:CreateDate": "2023-10-01T12:00:00Z",
                "xmp:CreatorTool": "Apache FOP Version 2.3",
                "xmp:MetadataDate": "2023-10-01T12:00:00Z"
            }
        }
    ]
    
    verifier.load_trusted_patterns(trusted_patterns)
    
    # Test with modified metadata (edited document)
    extracted_metadata = {
        "dc:date": "2023-11-15T15:30:00Z",  # Changed date
        "dc:language": "en-US",
        "pdf:Producer": "Adobe Acrobat Pro DC",  # Changed producer
        "xmp:CreateDate": "2023-11-15T15:30:00Z",  # Changed
        "xmp:CreatorTool": "Apache FOP Version 2.3",  # Original
        "xmp:MetadataDate": "2023-11-15T15:30:00Z"  # Changed
    }
    
    result = verifier.verify_cos(extracted_metadata)
    assert result["type"] in ["Edited", "Fake"], "Should identify as edited or fake document"
    assert result["confidence"] < 0.9, "Lower confidence expected for edited document"
    assert len(result["mismatched_fields"]) > 0, "Should have mismatched fields"
    print(f"✓ Edited document test passed: {result['type']} with {result['confidence']:.2f} confidence")

def test_fake_document():
    """Test verification of completely fake document"""
    verifier = COSVerifier()
    
    # Load trusted patterns
    trusted_patterns = [
        {
            "id": 1,
            "filename": "genuine_cos_1.pdf",
            "metadata": {
                "dc:date": "2023-10-01T12:00:00Z",
                "dc:language": "en-US",
                "pdf:Producer": "Apache FOP Version 2.3",
                "xmp:CreateDate": "2023-10-01T12:00:00Z",
                "xmp:CreatorTool": "Apache FOP Version 2.3",
                "xmp:MetadataDate": "2023-10-01T12:00:00Z"
            }
        }
    ]
    
    verifier.load_trusted_patterns(trusted_patterns)
    
    # Test with completely different metadata (fake document)
    extracted_metadata = {
        "dc:date": "2024-01-01T00:00:00Z",
        "dc:language": "fr-FR",
        "pdf:Producer": "Microsoft Word 2019",
        "xmp:CreateDate": "2024-01-01T00:00:00Z",
        "xmp:CreatorTool": "Microsoft Word 2019",
        "xmp:MetadataDate": "2024-01-01T00:00:00Z"
    }
    
    result = verifier.verify_cos(extracted_metadata)
    # Accept either Fake or Edited for completely different metadata
    assert result["type"] in ["Fake", "Edited"], f"Should identify as fake or edited document, got {result['type']}"
    assert result["confidence"] < 0.85, f"Lower confidence expected for fake document, got {result['confidence']:.2f}"
    print(f"✓ Fake document test passed: {result['type']} with {result['confidence']:.2f} confidence")

def test_multiple_trusted_patterns():
    """Test verification against multiple trusted patterns"""
    verifier = COSVerifier()
    
    # Load multiple trusted patterns
    trusted_patterns = [
        {
            "id": 1,
            "filename": "genuine_cos_1.pdf",
            "metadata": {
                "dc:date": "2023-10-01T12:00:00Z",
                "dc:language": "en-US",
                "pdf:Producer": "Apache FOP Version 2.3",
                "xmp:CreateDate": "2023-10-01T12:00:00Z",
                "xmp:CreatorTool": "Apache FOP Version 2.3",
                "xmp:MetadataDate": "2023-10-01T12:00:00Z"
            }
        },
        {
            "id": 2,
            "filename": "genuine_cos_2.pdf",
            "metadata": {
                "dc:date": "2023-09-15T10:30:00Z",
                "dc:language": "en-GB",
                "pdf:Producer": "Adobe Acrobat Pro DC",
                "xmp:CreateDate": "2023-09-15T10:30:00Z",
                "xmp:CreatorTool": "Adobe InDesign CS6",
                "xmp:MetadataDate": "2023-09-15T10:30:00Z"
            }
        }
    ]
    
    verifier.load_trusted_patterns(trusted_patterns)
    
    # Test against second pattern
    extracted_metadata = {
        "dc:date": "2023-09-15T10:30:00Z",
        "dc:language": "en-GB",
        "pdf:Producer": "Adobe Acrobat Pro DC",
        "xmp:CreateDate": "2023-09-15T10:30:00Z",
        "xmp:CreatorTool": "Adobe InDesign CS6",
        "xmp:MetadataDate": "2023-09-15T10:30:00Z"
    }
    
    result = verifier.verify_cos(extracted_metadata)
    assert result["type"] == "Genuine", "Should match second pattern"
    assert result["matched_pattern_id"] == 2, "Should match pattern ID 2"
    assert result["confidence"] > 0.95, "High confidence expected"
    print(f"✓ Multiple patterns test passed: matched pattern {result['matched_pattern_id']}")

def test_no_trusted_patterns():
    """Test behavior when no trusted patterns are loaded"""
    verifier = COSVerifier()
    
    # Test without loading any patterns
    extracted_metadata = {
        "dc:date": "2023-10-01T12:00:00Z",
        "dc:language": "en-US",
        "pdf:Producer": "Apache FOP Version 2.3"
    }
    
    try:
        result = verifier.verify_cos(extracted_metadata)
        assert False, "Should raise ValueError when no patterns loaded"
    except ValueError as e:
        assert "No trusted patterns loaded" in str(e)
        print("✓ No patterns test passed: correctly raised ValueError")

def test_partial_metadata():
    """Test verification with incomplete metadata"""
    verifier = COSVerifier()
    
    # Load trusted patterns
    trusted_patterns = [
        {
            "id": 1,
            "filename": "genuine_cos_1.pdf",
            "metadata": {
                "dc:date": "2023-10-01T12:00:00Z",
                "dc:language": "en-US",
                "pdf:Producer": "Apache FOP Version 2.3",
                "xmp:CreateDate": "2023-10-01T12:00:00Z",
                "xmp:CreatorTool": "Apache FOP Version 2.3",
                "xmp:MetadataDate": "2023-10-01T12:00:00Z"
            }
        }
    ]
    
    verifier.load_trusted_patterns(trusted_patterns)
    
    # Test with incomplete metadata (missing some fields)
    extracted_metadata = {
        "dc:date": "2023-10-01T12:00:00Z",
        "dc:language": "en-US",
        "pdf:Producer": "Apache FOP Version 2.3"
        # Missing xmp fields
    }
    
    result = verifier.verify_cos(extracted_metadata)
    assert result["type"] in ["Edited", "Fake"], "Should identify issues with missing fields"
    assert len(result["mismatched_fields"]) > 0, "Should report missing fields as mismatched"
    print(f"✓ Partial metadata test passed: {len(result['mismatched_fields'])} missing fields detected")

def run_all_tests():
    """Run all test cases and report results"""
    print("Running COS Verifier Test Suite")
    print("=" * 40)
    
    try:
        test_genuine_document()
        test_edited_document()
        test_fake_document()
        test_multiple_trusted_patterns()
        test_no_trusted_patterns()
        test_partial_metadata()
        
        print("=" * 40)
        print("✅ All tests passed successfully!")
        return True
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False

if __name__ == "__main__":
    run_all_tests()