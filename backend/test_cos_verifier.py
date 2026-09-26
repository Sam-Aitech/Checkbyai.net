#!/usr/bin/env python3
"""
Contract tests for the public CoS verification API surface.

cos_verifier.py / ai_engine.py are deliberately stripped to typed stubs —
the proprietary engine lives in a private repository (commit 3f35d77).
These tests pin that contract:

  * the stub classes instantiate and raise NotImplementedError on every
    business-logic method (so an accidental call in app code fails loudly),
  * removed legacy methods (load_trusted_patterns / verify_cos) stay gone,
  * VerificationResult validates its own invariants.

The real, built-in comparison logic exercised end-to-end lives in
test_integration.py (main.compare_with_trusted).
"""

import asyncio

from cos_verifier import AbstractCOSVerifier, COSVerifier, VerificationResult


def assert_raises(exc_type, fn, *args, **kwargs):
    """Minimal raises-helper so the file runs with or without pytest."""
    try:
        fn(*args, **kwargs)
    except exc_type:
        return
    except Exception as e:  # noqa: BLE001 - re-assert with context
        raise AssertionError(
            f"expected {exc_type.__name__}, got {type(e).__name__}: {e}"
        ) from e
    raise AssertionError(f"expected {exc_type.__name__}, nothing was raised")


def test_verifier_is_abstract_contract():
    assert issubclass(COSVerifier, AbstractCOSVerifier)
    verifier = COSVerifier()
    assert verifier is not None


def test_stub_verify_raises_not_implemented():
    verifier = COSVerifier()
    assert_raises(NotImplementedError, asyncio.run, verifier.verify("/tmp/x.pdf"))


def test_stub_extract_metadata_raises_not_implemented():
    verifier = COSVerifier()
    assert_raises(
        NotImplementedError, asyncio.run, verifier.extract_metadata("/tmp/x.pdf")
    )


def test_legacy_methods_stay_removed():
    # load_trusted_patterns / verify_cos were part of the pre-3f35d77
    # implementation. App code must not silently depend on them again.
    verifier = COSVerifier()
    assert_raises(AttributeError, getattr, verifier, "load_trusted_patterns")
    assert_raises(AttributeError, getattr, verifier, "verify_cos")


def test_verification_result_accepts_valid_input():
    result = VerificationResult(
        status="verified",
        confidence=0.97,
        flags=["ok"],
        metadata={"pdf:Producer": "Apache FOP"},
    )
    assert result.status == "verified"
    assert result.confidence == 0.97
    assert result.flags == ["ok"]
    assert result.metadata == {"pdf:Producer": "Apache FOP"}


def test_verification_result_rejects_invalid_status():
    assert_raises(
        ValueError,
        lambda: VerificationResult(
            status="totally-fine", confidence=0.5, flags=[], metadata={}
        ),
    )


def test_verification_result_rejects_out_of_range_confidence():
    for bad in (-0.01, 1.01):
        assert_raises(
            ValueError,
            lambda b=bad: VerificationResult(
                status="verified", confidence=b, flags=[], metadata={}
            ),
        )


def test_verification_result_copies_metadata():
    source = {"pdf:Producer": "Apache FOP"}
    result = VerificationResult(
        status="suspicious", confidence=0.5, flags=[], metadata=source
    )
    source["pdf:Producer"] = "mutated"
    assert result.metadata["pdf:Producer"] == "Apache FOP"


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print(f"✓ {t.__name__}")
    print(f"\n{len(tests)} contract tests passed")
