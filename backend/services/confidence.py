"""Composite confidence scoring: retrieval quality + citation coverage + completeness."""

import logging

from config import settings
from models.query import Citation, ConfidenceBreakdown, RetrievedChunk
from services.llm import chat_json

logger = logging.getLogger(__name__)

_COMPLETENESS_SYSTEM = """You judge ONLY whether an answer addresses everything the question asked. \
Do not judge factual correctness, style, or length — a short answer that covers the whole \
question scores 5.

Scoring guide:
5 = every part of the question is addressed
4 = the main question is addressed; a minor sub-part is missing
3 = the main question is addressed but significant sub-parts are missing, OR the answer is an \
explicit honest "I don't have enough information"
2 = only a small part of the question is addressed
1 = the answer does not address the question at all

First write one sentence of reasoning, then the score.
Respond with JSON: {"reasoning": "<one sentence>", "score": <1-5>}"""


def retrieval_confidence(chunks: list[RetrievedChunk]) -> float:
    """Average cosine similarity of the top chunks; sparse-only hits contribute 0."""
    if not chunks:
        return 0.0
    sims = [max(0.0, min(1.0, c.dense_score)) for c in chunks if c.dense_score is not None]
    if not sims:
        return 0.0
    return sum(sims) / len(sims)


def citation_coverage(citations: list[Citation], insufficient_context: bool) -> float:
    """Fraction of citations verified as supported. An honest refusal scores full coverage."""
    if insufficient_context:
        return 1.0
    if not citations:
        return 0.0
    return sum(1 for c in citations if c.verified) / len(citations)


async def answer_completeness(question: str, answer: str) -> float:
    """LLM-as-judge 1-5 normalized to 0-1."""
    try:
        result = await chat_json(
            _COMPLETENESS_SYSTEM, f"Question: {question}\n\nAnswer: {answer}"
        )
        score = float(result.get("score", 1))
    except Exception:
        logger.exception("completeness_judge_failed; defaulting to 1")
        score = 1.0
    return (max(1.0, min(5.0, score)) - 1.0) / 4.0


async def compute_confidence(
    question: str,
    answer: str,
    chunks: list[RetrievedChunk],
    citations: list[Citation],
    insufficient_context: bool,
) -> ConfidenceBreakdown:
    retrieval = retrieval_confidence(chunks)
    coverage = citation_coverage(citations, insufficient_context)
    completeness = await answer_completeness(question, answer)
    composite = (
        settings.weight_retrieval * retrieval
        + settings.weight_citation * coverage
        + settings.weight_completeness * completeness
    )
    return ConfidenceBreakdown(
        retrieval=round(retrieval, 3),
        citation_coverage=round(coverage, 3),
        completeness=round(completeness, 3),
        composite=round(composite, 3),
    )
