"""End-to-end ask pipeline: retrieve → generate → verify → score. Shared by /v1/ask and eval."""

import logging
import time
from datetime import datetime, timezone

from exceptions import EmptyIndexError
from models.query import AskRequest, AskResponse
from services import registry, store
from services.citation_verifier import unverified_citations, verify_citations
from services.confidence import compute_confidence
from services.generation import generate_answer
from services.retrieval import retrieve

logger = logging.getLogger(__name__)


async def answer_question(request: AskRequest, log_query: bool = True) -> AskResponse:
    started = time.perf_counter()
    embedding_store = store.embedding_store()
    bm25 = store.bm25_index()

    if await embedding_store.count() == 0 and bm25.size == 0:
        raise EmptyIndexError("No documents indexed yet. Upload documents before asking.")

    chunks = await retrieve(
        query=request.question,
        mode=request.retrieval_mode,
        dense_weight=request.dense_weight,
        top_k=request.top_k,
        embedding_store=embedding_store,
        bm25_index=bm25,
    )

    answer, insufficient, cited_indices = await generate_answer(request.question, chunks)

    if request.verify_citations:
        citations = await verify_citations(answer, cited_indices, chunks)
    else:
        citations = unverified_citations(answer, cited_indices, chunks)

    confidence = await compute_confidence(
        request.question, answer, chunks, citations, insufficient
    )

    latency_ms = round((time.perf_counter() - started) * 1000, 1)
    response = AskResponse(
        answer=answer,
        citations=citations,
        confidence=confidence,
        retrieved_chunks=chunks,
        retrieval_mode_used=request.retrieval_mode,
        latency_ms=latency_ms,
        insufficient_context=insufficient,
    )

    if log_query:
        registry.append_query_log(
            {
                "question": request.question,
                "retrieval_mode": request.retrieval_mode,
                "composite_confidence": confidence.composite,
                "latency_ms": latency_ms,
                "insufficient_context": insufficient,
                "asked_at": datetime.now(timezone.utc).isoformat(),
            }
        )

    logger.info(
        "question_answered",
        extra={
            "mode": request.retrieval_mode,
            "confidence": confidence.composite,
            "latency_ms": latency_ms,
            "insufficient": insufficient,
        },
    )
    return response
