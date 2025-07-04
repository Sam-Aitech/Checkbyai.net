#!/usr/bin/env python3
"""
Integration tests for the complete COS Verification System
Tests the full workflow from PDF upload to verification results
"""

import json
import tempfile
import os
from cos_verifier import COSVerifier
from main import TrustedPattern, compare_with_trusted

def test_integration_workflow():
    """Test the complete verification workflow"""
    print("Running Integration Test Suite")
    print("=" * 40)
    
    # Initialize verifier
    verifier = COSVerifier()
    
    # Simulate trusted patterns storage
    trusted_patterns = []
    
    # Step 1: Add trusted pattern
    print("1. Adding trusted pattern...")
    genuine_metadata = {
        "dc:date": "2023-10-01T12:00:00Z",
        "dc:language": "en-US",
        "pdf:Producer": "Apache FOP Version 2.3",
        "xmp:CreateDate": "2023-10-01T12:00:00Z",
        "xmp:CreatorTool": "Apache FOP Version 2.3",
        "xmp:MetadataDate": "2023-10-01T12:00:00Z"
    }
    
    pattern = TrustedPattern(1, "genuine_cos.pdf", genuine_metadata)
    trusted_patterns.append(pattern)
    
    # Load patterns into verifier
    pattern_list = [{"id": p.id, "filename": p.filename, "metadata": p.metadata} for p in trusted_patterns]
    verifier.load_trusted_patterns(pattern_list)
    print(f"✓ Loaded {len(pattern_list)} trusted patterns")
    
    # Step 2: Test genuine document verification
    print("2. Testing genuine document verification...")
    genuine_result = verifier.verify_cos(genuine_metadata)
    print(f"   Result: {genuine_result['type']} (confidence: {genuine_result['confidence']:.2f})")
    assert genuine_result["type"] == "Genuine"
    assert genuine_result["confidence"] > 0.95
    
    # Step 3: Test edited document verification
    print("3. Testing edited document verification...")
    edited_metadata = {
        "dc:date": "2023-11-15T15:30:00Z",  # Changed
        "dc:language": "en-US",
        "pdf:Producer": "Adobe Acrobat Pro DC",  # Changed
        "xmp:CreateDate": "2023-11-15T15:30:00Z",  # Changed
        "xmp:CreatorTool": "Apache FOP Version 2.3",  # Original
        "xmp:MetadataDate": "2023-11-15T15:30:00Z"  # Changed
    }
    
    edited_result = verifier.verify_cos(edited_metadata)
    print(f"   Result: {edited_result['type']} (confidence: {edited_result['confidence']:.2f})")
    print(f"   Mismatched fields: {edited_result['mismatched_fields']}")
    assert edited_result["type"] in ["Edited", "Fake"]
    assert edited_result["confidence"] < 0.9
    
    # Step 4: Test fake document verification
    print("4. Testing fake document verification...")
    fake_metadata = {
        "dc:date": "2024-01-01T00:00:00Z",
        "dc:language": "fr-FR",
        "pdf:Producer": "Microsoft Word 2019",
        "xmp:CreateDate": "2024-01-01T00:00:00Z",
        "xmp:CreatorTool": "Microsoft Word 2019",
        "xmp:MetadataDate": "2024-01-01T00:00:00Z"
    }
    
    fake_result = verifier.verify_cos(fake_metadata)
    print(f"   Result: {fake_result['type']} (confidence: {fake_result['confidence']:.2f})")
    print(f"   Mismatched fields: {fake_result['mismatched_fields']}")
    assert fake_result["type"] in ["Edited", "Fake"]
    assert fake_result["confidence"] < 0.85
    
    # Step 5: Test fallback mechanism
    print("5. Testing fallback mechanism...")
    fallback_result = compare_with_trusted(genuine_metadata)
    print(f"   Fallback result: {fallback_result['type']} (confidence: {fallback_result['confidence']:.2f})")
    
    print("=" * 40)
    print("✅ Integration tests completed successfully!")
    
    return {
        "genuine": genuine_result,
        "edited": edited_result,
        "fake": fake_result,
        "fallback": fallback_result
    }

def test_api_response_format():
    """Test that results match the expected API response format"""
    print("\nTesting API Response Format")
    print("=" * 30)
    
    verifier = COSVerifier()
    
    # Load test pattern
    test_patterns = [
        {
            "id": 1,
            "filename": "test.pdf",
            "metadata": {
                "pdf:Producer": "Adobe Acrobat Pro DC",
                "xmp:CreatorTool": "Adobe InDesign CS6"
            }
        }
    ]
    
    verifier.load_trusted_patterns(test_patterns)
    
    # Get verification result
    test_metadata = {
        "pdf:Producer": "Adobe Acrobat Pro DC",
        "xmp:CreatorTool": "Adobe InDesign CS6"
    }
    
    result = verifier.verify_cos(test_metadata)
    
    # Check required fields
    required_fields = ["type", "confidence", "matched_pattern_id", "matched_fields", "mismatched_fields", "method"]
    for field in required_fields:
        assert field in result, f"Missing required field: {field}"
    
    # Check types
    assert isinstance(result["type"], str)
    assert isinstance(result["confidence"], (int, float))
    assert isinstance(result["matched_fields"], list)
    assert isinstance(result["mismatched_fields"], list)
    
    print("✓ API response format is correct")
    print(f"   Response: {json.dumps(result, indent=2)}")

if __name__ == "__main__":
    try:
        integration_results = test_integration_workflow()
        test_api_response_format()
        
        print("\n" + "=" * 50)
        print("🎉 All integration tests passed!")
        print("   The COS Verification System is ready for production.")
        
    except Exception as e:
        print(f"\n❌ Integration test failed: {e}")
        import traceback
        traceback.print_exc()