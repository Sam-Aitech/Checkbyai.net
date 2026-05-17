"""
AI Engine — CheckByAI Core Service

This module is part of the CheckByAI proprietary AI inference layer.
The implementation is maintained in a private service repository and
deployed as an internal microservice.

Public Interface (API Contract)
================================
This file defines the public-facing interface contract only.
The core AI logic, ML models, and verification algorithms are
proprietary and not included in this open-source distribution.

Service Boundary
-----------------
All AI verification requests are handled via the internal AI service.
See CONTRIBUTING.md for integration and contribution details.

For contributors:
  - Do NOT add proprietary logic to this file.
  - Raise an issue if you need to extend the AI interface.
  - See CONTRIBUTING.md for the contribution guidelines.

Licensed under the MIT License. See LICENSE for details.
"""
from typing import Dict, Any, Optional


class AIEngine:
    """
    Public interface contract for the CheckByAI AI Engine.

    The concrete implementation is hosted in the private
    core-engine service and accessed via internal API.

    Do not implement business logic here.
    """

    async def initialize(self) -> None:
        """
        Initialise the AI engine service connection.
        Raises NotImplementedError in open-source build.
        See private service for implementation.
        """
        raise NotImplementedError(
            "AI Engine is a proprietary service. "
            "See CONTRIBUTING.md for integration details."
        )

    async def analyze_document(self, file_path: str) -> Dict[str, Any]:
        """
        Analyse a CoS document and return verification results.

        Args:
            file_path: Path to the uploaded PDF document.

        Returns:
            Dict containing verification result, confidence score,
            and metadata.

        Raises:
            NotImplementedError: Core logic is proprietary.
        """
        raise NotImplementedError(
            "AI Engine is a proprietary service. "
            "See CONTRIBUTING.md for integration details."
        )

    async def extract_metadata(self, file_path: str) -> Dict[str, Any]:
        """
        Extract metadata from an uploaded document.

        Args:
            file_path: Path to the uploaded document.

        Returns:
            Dict containing extracted document metadata.

        Raises:
            NotImplementedError: Core logic is proprietary.
        """
        raise NotImplementedError(
            "AI Engine is a proprietary service. "
            "See CONTRIBUTING.md for integration details."
        )

    async def extract_metadata(self, file_path: str) -> Dict[str, Any]:
        """
        Backward-compatible alias for legacy callers expecting document
        metadata extraction as a separate contract method.

        Args:
            file_path: Path to the uploaded PDF document.

        Returns:
            Dict containing document analysis/metadata.

        Raises:
            NotImplementedError: Propagated from analyze_document in the
            open-source build unless implemented by the private service.
        """
        return await self.analyze_document(file_path)

    async def verify_cos(
        self,
        document_data: Dict[str, Any],
        sponsor_data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Verify a Certificate of Sponsorship against known patterns.

        Args:
            document_data: Extracted document metadata.
            sponsor_data: Optional sponsor licence data for cross-reference.

        Returns:
            Verification result with status, confidence, and flags.

        Raises:
            NotImplementedError: Core logic is proprietary.
        """
        raise NotImplementedError(
            "AI Engine is a proprietary service. "
            "See CONTRIBUTING.md for integration details."
        )
