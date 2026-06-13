"""Post-generation citation verification: does each cited chunk support its claim?"""

import logging
import re

from models.query import Citation, RetrievedChunk
from services.llm import chat_json

logger = logging.getLogger(__name__)

SUPPORT_THRESHOLD = 3.0

_SYSTEM = """You verify citations in a generated answer. For each (claim, passage) pair, score \
1-5 how well the passage supports the specific claim:
5 = passage explicitly states the claim
4 = passage strongly implies it
3 = passage partially supports it
2 = passage is topically related but does not support the claim
1 = passage is unrelated or contradicts the claim

Respond with JSON: {"verdicts": [{"index": <citation number>, "score": <1-5>, \
"explanation": "<one sentence>"}, ...]} covering every pair exactly once."""


def _claims_for_citations(answer: str, indices: list[int]) -> dict[int, str]:
    """For each citation index, the sentence(s) in the answer that carry that citation."""
    sentences = re.split(r"(?<=[.!?])\s+", answer)
    claims: dict[int, str] = {}
    for idx in indices:
        marker = f"[{idx}]"
        carrying = [s for s in sentences if marker in s]
        claims[idx] = " ".join(carrying) if carrying else answer[:300]
    return claims


async def verify_citations(
    answer: str, cited_indices: list[int], chunks: list[RetrievedChunk]
) -> list[Citation]:
    """One batched LLM-as-judge call scoring every citation in the answer."""
    if not cited_indices:
        return []

    claims = _claims_for_citations(answer, cited_indices)
    pairs = "\n\n".join(
        f"Citation [{idx}]\nClaim: {claims[idx]}\nPassage: {chunks[idx - 1].text[:1200]}"
        for idx in cited_indices
    )

    verdicts: dict[int, tuple[float, str]] = {}
    try:
        result = await chat_json(_SYSTEM, f"Pairs to verify:\n\n{pairs}")
        for item in result.get("verdicts", []):
            idx = int(item["index"])
            if idx in claims:
                verdicts[idx] = (float(item["score"]), str(item.get("explanation", "")))
    except Exception:
        logger.exception("citation_verification_failed; marking citations unverified")

    citations: list[Citation] = []
    for idx in cited_indices:
        chunk = chunks[idx - 1]
        score, explanation = verdicts.get(idx, (0.0, "Verification call failed"))
        citations.append(
            Citation(
                index=idx,
                chunk_id=chunk.chunk_id,
                source_document=chunk.source_document,
                section_heading=chunk.section_heading,
                excerpt=chunk.text[:300],
                support_score=score,
                verified=score >= SUPPORT_THRESHOLD,
                claim_text=claims[idx],
                judge_explanation=explanation,
            )
        )
    return citations


def unverified_citations(answer: str, cited_indices: list[int], chunks: list[RetrievedChunk]) -> list[Citation]:
    """Citation objects without a verification pass (verify_citations=false)."""
    claims = _claims_for_citations(answer, cited_indices)
    return [
        Citation(
            index=idx,
            chunk_id=chunks[idx - 1].chunk_id,
            source_document=chunks[idx - 1].source_document,
            section_heading=chunks[idx - 1].section_heading,
            excerpt=chunks[idx - 1].text[:300],
            support_score=0.0,
            verified=False,
            claim_text=claims[idx],
            judge_explanation="Verification skipped by request",
        )
        for idx in cited_indices
    ]
