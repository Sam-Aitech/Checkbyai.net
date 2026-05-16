"""
CoS Verifier — CheckByAI Core Service

This module is part of the CheckByAI proprietary verification layer.
The CoS (Certificate of Sponsorship) verification algorithm, ML models,
fraud-detection heuristics, and scoring logic are proprietary.

Public Interface (API Contract)
================================
This file defines the public-facing interface contract only.
The implementation is maintained in a private service repository.

Security Notice
---------------
The verification algorithm must remain private to prevent fraud gaming.
Bad actors who can read the verification logic can craft documents
designed to bypass it. This is intentional IP and anti-fraud protection.

Copyright (c) 2024-2026 CheckByAI. All rights reserved.
Proprietary and confidential. Unauthorised use prohibited.
"""

from typing import Dict, Any, Optional


class COSVerifier:
    """
    Public interface contract for the CheckByAI CoS Verification engine.

    The concrete ML-based implementation, fraud scoring heuristics,
    and similarity algorithms are hosted in the private core-engine
    service. This class exposes the public API contract only.

    Do not implement verification business logic here.
    """

    async def verify(
        self,
        document_path: str,
        sponsor_data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Verify a Certificate of Sponsorship document.

        Args:
            document_path: Path to the uploaded PDF/document.
            sponsor_data: Optional sponsor licence record for cross-check.

        Returns:
            Dict with keys:
                - status: 'verified' | 'suspicious' | 'invalid'
                - confidence: float (0.0 - 1.0)
                - flags: List[str] of detected anomaly flags
                - metadata: Dict of extracted document fields

        Raises:
            NotImplementedError: Core logic is proprietary.
        """
        raise NotImplementedError(
            "CoS Verifier is a proprietary service. "
            "See docs/API_CONTRACT.md for integration."
        )

    async def extract_metadata(self, document_path: str) -> Dict[str, Any]:
        """
        Extract structured metadata from a CoS PDF document.

        Args:
            document_path: Path to the uploaded PDF.

        Returns:
            Dict of extracted fields. Schema in docs/API_CONTRACT.md.

        Raises:
            NotImplementedError: Core logic is proprietary.
        """
        raise NotImplementedError(
            "CoS Verifier is a proprietary service. "
            "See docs/API_CONTRACT.md for integration."
        )
