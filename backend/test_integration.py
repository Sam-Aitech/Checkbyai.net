#!/usr/bin/env python3
"""
Integration tests for the COS Verification System.

Covers the shipped in-repo engine end-to-end:
  * main.compare_with_trusted — genuine / edited / fake scoring paths,
  * the FastAPI surface — health aliases, upload-pattern, and the
    /api/verify round-trip (regression: every non-demo verify request used
    to 500 with NameError after commit 3f35d77 removed the engine),
  * error mapping for unreadable PDFs (422, not 500).

The proprietary COSVerifier stub contract is covered separately in
test_cos_verifier.py.
"""

import os
import tempfile

# main.py resolves TEMP_DIR per request (default "/tmp" — absent on Windows).
os.environ.setdefault("TEMP_DIR", tempfile.gettempdir())

import fitz
from fastapi.testclient import TestClient

from main import TrustedPattern, app, compare_with_trusted, db

GENUINE_METADATA = {
    "dc:date": "2023-10-01T12:00:00Z",
    "dc:language": "en-US",
    "pdf:Producer": "Apache FOP Version 2.3",
    "xmp:CreateDate": "2023-10-01T12:00:00Z",
    "xmp:CreatorTool": "Apache FOP Version 2.3",
    "xmp:MetadataDate": "2023-10-01T12:00:00Z",
}

EDITED_METADATA = {
    "dc:date": "2023-11-15T15:30:00Z",  # Changed
    "dc:language": "en-US",
    "pdf:Producer": "Adobe Acrobat Pro DC",  # Changed
    "xmp:CreateDate": "2023-11-15T15:30:00Z",  # Changed
    "xmp:CreatorTool": "Apache FOP Version 2.3",
    "xmp:MetadataDate": "2023-11-15T15:30:00Z",  # Changed
}

FAKE_METADATA = {
    "dc:date": "2024-01-01T00:00:00Z",
    "dc:language": "fr-FR",
    "pdf:Producer": "Microsoft Word 2019",
    "xmp:CreateDate": "2024-01-01T00:00:00Z",
    "xmp:CreatorTool": "Microsoft Word 2019",
    "xmp:MetadataDate": "2024-01-01T00:00:00Z",
}


def _reset_state():
    """Clear the in-memory pattern store so tests are order-independent."""
    db.trusted_patterns.clear()
    db.pattern_index.clear()
    db.submitted_documents.clear()
    db.verification_results.clear()
    db.invalidate_cache()


def _sample_pdf_bytes() -> bytes:
    """Generate a minimal valid PDF with fixed metadata (deterministic)."""
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Certificate of Sponsorship (test fixture)")
    doc.set_metadata(
        {
            "producer": "CheckByAI test fixture",
            "creator": "pytest",
            "title": "Test CoS",
        }
    )
    data = doc.tobytes()
    doc.close()
    return data


def test_health_endpoints_serve_both_aliases():
    """Node probes /health (index.ts, diagnostics) and /api/health
    (enrichmentWorker) — both must answer 200."""
    client = TestClient(app)
    for path in ("/health", "/api/health"):
        resp = client.get(path)
        assert resp.status_code == 200, f"{path} -> {resp.status_code}"
        assert resp.json()["status"] == "healthy"


def test_compare_with_trusted_workflow():
    _reset_state()
    db.add_trusted_pattern(TrustedPattern(1, "genuine_cos.pdf", GENUINE_METADATA))

    genuine = compare_with_trusted(dict(GENUINE_METADATA))
    assert genuine["type"] == "Genuine", genuine
    assert genuine["confidence"] > 0.95
    assert genuine["mismatched_fields"] == []

    edited = compare_with_trusted(EDITED_METADATA)
    assert edited["type"] in ("Edited", "Fake"), edited
    assert edited["confidence"] < 0.9

    fake = compare_with_trusted(FAKE_METADATA)
    assert fake["type"] in ("Edited", "Fake"), fake
    assert fake["confidence"] < 0.85


def test_upload_pattern_and_verify_roundtrip():
    """Regression test: /api/verify previously raised NameError on every
    non-demo request (metadata was never extracted) and /api/admin/
    upload-pattern called the removed AIEngine.extract_metadata."""
    _reset_state()
    client = TestClient(app)
    pdf_bytes = _sample_pdf_bytes()

    upload = client.post(
        "/api/admin/upload-pattern",
        files={"file": ("genuine_cos.pdf", pdf_bytes, "application/pdf")},
    )
    assert upload.status_code == 200, upload.text
    assert upload.json()["pattern_id"] >= 1

    verify = client.post(
        "/api/verify",
        files={"file": ("genuine_cos.pdf", pdf_bytes, "application/pdf")},
    )
    assert verify.status_code == 200, verify.text
    body = verify.json()
    for field in ("id", "result", "confidence", "details", "mismatchedFields"):
        assert field in body, f"missing field {field}: {body}"
    # Same bytes → identical extracted metadata → exact hash match.
    assert body["result"] == "genuine", body
    assert body["confidence"] > 0.95


def test_verify_demo_result_without_patterns():
    _reset_state()
    client = TestClient(app)
    resp = client.post(
        "/api/verify",
        files={"file": ("anything.pdf", b"%PDF-1.4 junk", "application/pdf")},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["result"] == "fake"
    assert "details" in body


def test_verify_rejects_unreadable_pdf():
    _reset_state()
    db.add_trusted_pattern(TrustedPattern(1, "genuine_cos.pdf", GENUINE_METADATA))
    client = TestClient(app)
    resp = client.post(
        "/api/verify",
        files={"file": ("broken.pdf", b"this is not a pdf", "application/pdf")},
    )
    assert resp.status_code == 422, resp.text


def test_upload_rejects_unreadable_pdf():
    _reset_state()
    client = TestClient(app)
    resp = client.post(
        "/api/admin/upload-pattern",
        files={"file": ("broken.pdf", b"this is not a pdf", "application/pdf")},
    )
    assert resp.status_code == 422, resp.text


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print(f"✓ {t.__name__}")
    print(f"\n{len(tests)} integration tests passed")
