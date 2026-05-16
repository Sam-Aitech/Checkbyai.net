# © 2024-2026 CheckByAI Ltd. All rights reserved.
# Proprietary and confidential. Unauthorised use prohibited.
#
# This file is the PUBLIC API CONTRACT for the CheckByAI CoS Verification Service.
# The verification engine, scoring models, and fraud-detection logic are hosted
# in a private, access-controlled repository and are NOT part of this distribution.
#
# Integrators: see docs/API_CONTRACT.md for the full integration guide.
# Security disclosures: security@checkbyai.net

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class VerificationResult:
    """Immutable result object returned by the CoS Verification engine.

    Attributes
    ----------
    status : str
        One of ``'verified'``, ``'suspicious'``, or ``'invalid'``.
    confidence : float
        Verification confidence score in the closed interval [0.0, 1.0].
    flags : list[str]
        Zero or more opaque anomaly codes.  Code meanings are documented in
        ``docs/API_CONTRACT.md``.  Codes are intentionally non-descriptive to
        prevent adversarial document crafting.
    metadata : dict[str, Any]
        Extracted document fields.  Schema is versioned; see
        ``docs/API_CONTRACT.md#metadata-schema``.
    """

    __slots__ = ("status", "confidence", "flags", "metadata")

    def __init__(
        self,
        *,
        status: str,
        confidence: float,
        flags: list[str],
        metadata: dict[str, Any],
    ) -> None:
        if status not in {"verified", "suspicious", "invalid"}:
            raise ValueError(f"Invalid status: {status!r}")
        if not 0.0 <= confidence <= 1.0:
            raise ValueError("confidence must be in [0.0, 1.0]")
        self.status = status
        self.confidence = confidence
        self.flags = list(flags)
        self.metadata = dict(metadata)

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"VerificationResult(status={self.status!r}, "
            f"confidence={self.confidence:.3f}, "
            f"flags={self.flags!r})"
        )


class AbstractCOSVerifier(ABC):
    """Abstract base class defining the public contract for the CoS Verification engine.

    CheckByAI integrators **must not** subclass this in production code.
    The concrete implementation is provided by the CheckByAI core-engine service.
    This ABC exists solely to document the stable public interface.

    See Also
    --------
    docs/API_CONTRACT.md : Full integration guide and SLA definitions.
    """

    @abstractmethod
    async def verify(
        self,
        document_path: str,
        sponsor_data: dict[str, Any] | None = None,
    ) -> VerificationResult:
        """Verify a Certificate of Sponsorship document.

        Parameters
        ----------
        document_path:
            Absolute path to the uploaded PDF on the processing node.
        sponsor_data:
            Optional sponsor licence record for cross-referencing.
            Structure defined in ``docs/API_CONTRACT.md#sponsor-data-schema``.

        Returns
        -------
        VerificationResult
            See :class:`VerificationResult` for field definitions.

        Raises
        ------
        NotImplementedError
            Always — concrete logic is proprietary and hosted privately.
        """

    @abstractmethod
    async def extract_metadata(
        self,
        document_path: str,
    ) -> dict[str, Any]:
        """Extract structured metadata fields from a CoS PDF.

        Parameters
        ----------
        document_path:
            Absolute path to the uploaded PDF on the processing node.

        Returns
        -------
        dict[str, Any]
            Extracted fields.  Schema versioned in
            ``docs/API_CONTRACT.md#metadata-schema``.

        Raises
        ------
        NotImplementedError
            Always — concrete logic is proprietary and hosted privately.
        """


class COSVerifier(AbstractCOSVerifier):
    """Public stub for the CheckByAI CoS Verification engine.

    This class **intentionally** raises :exc:`NotImplementedError` for every
    method.  It exists to:

    * Publish a stable, typed interface for open-source integrators.
    * Satisfy static analysers and import chains without exposing proprietary logic.
    * Serve as the contract reference for the private core-engine service.

    The ML scoring pipeline, document feature extractors, and fraud-detection
    heuristics are maintained in a private repository and deployed as an
    internal microservice.  Keeping them separate prevents adversarial actors
    from reverse-engineering verification signals to craft fraudulent documents.
    """

    async def verify(
        self,
        document_path: str,
        sponsor_data: dict[str, Any] | None = None,
    ) -> VerificationResult:
        """See :class:`AbstractCOSVerifier`.verify for the full contract."""
        raise NotImplementedError(
            "COSVerifier.verify is a proprietary service. "
            "Contact api@checkbyai.net or see docs/API_CONTRACT.md."
        )

    async def extract_metadata(
        self,
        document_path: str,
    ) -> dict[str, Any]:
        """See :class:`AbstractCOSVerifier`.extract_metadata for the full contract."""
        raise NotImplementedError(
            "COSVerifier.extract_metadata is a proprietary service. "
            "Contact api@checkbyai.net or see docs/API_CONTRACT.md."
        )


__all__ = ["AbstractCOSVerifier", "COSVerifier", "VerificationResult"]
