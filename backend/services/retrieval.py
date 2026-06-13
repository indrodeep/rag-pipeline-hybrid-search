"""Dense + sparse retrieval, Reciprocal Rank Fusion, and LLM-as-judge reranking."""

import logging

from config import settings
from models.query import RetrievalMode, RetrievedChunk
from services.bm25_index import BM25Index
from services.embeddings import EmbeddingStore
from services.llm import chat_json

logger = logging.getLogger(__name__)

_RERANK_SYSTEM = """You are a relevance judge for a retrieval system. You will receive a \
question and a numbered list of text passages. Score each passage 0-10 for how useful it is \
for answering the question (10 = directly answers it, 0 = irrelevant). Judge each passage \
independently. Respond with JSON: {"scores": [{"index": <int>, "relevance": <int>}, ...]} \
covering every passage exactly once."""


async def dense_search(
    query: str, k: int, embedding_store: EmbeddingStore
) -> list[RetrievedChunk]:
    embedding = await embedding_store.embed_query(query)
    hits = await embedding_store.query(embedding, k)
    return [
        RetrievedChunk(
            chunk_id=chunk_id,
            text=text,
            source_document=str(meta.get("source_document", "")),
            section_heading=str(meta.get("section_heading", "")),
            chunking_strategy=str(meta.get("chunking_strategy", "")),
            dense_score=round(similarity, 4),
            final_rank=rank + 1,
        )
        for rank, (chunk_id, text, meta, similarity) in enumerate(hits)
    ]


async def sparse_search(query: str, k: int, bm25_index: BM25Index) -> list[RetrievedChunk]:
    hits = await bm25_index.search(query, k)
    return [
        RetrievedChunk(
            chunk_id=chunk_id,
            text=text,
            source_document=str(meta.get("source_document", "")),
            section_heading=str(meta.get("section_heading", "")),
            chunking_strategy=str(meta.get("chunking_strategy", "")),
            sparse_score=round(score, 4),
            final_rank=rank + 1,
        )
        for rank, (chunk_id, text, meta, score) in enumerate(hits)
    ]


def reciprocal_rank_fusion(
    dense_results: list[RetrievedChunk],
    sparse_results: list[RetrievedChunk],
    alpha: float = 0.7,
) -> list[RetrievedChunk]:
    """Weighted RRF: score(c) = alpha/(k+rank_dense) + (1-alpha)/(k+rank_sparse).

    Rank-based fusion sidesteps the incomparable scales of cosine similarity and BM25.
    """
    k = settings.rrf_k
    merged: dict[str, RetrievedChunk] = {}
    scores: dict[str, float] = {}

    for rank, chunk in enumerate(dense_results):
        merged[chunk.chunk_id] = chunk.model_copy()
        scores[chunk.chunk_id] = alpha / (k + rank + 1)
    for rank, chunk in enumerate(sparse_results):
        contribution = (1.0 - alpha) / (k + rank + 1)
        if chunk.chunk_id in merged:
            merged[chunk.chunk_id].sparse_score = chunk.sparse_score
            scores[chunk.chunk_id] += contribution
        else:
            merged[chunk.chunk_id] = chunk.model_copy()
            scores[chunk.chunk_id] = contribution

    ranked = sorted(merged.values(), key=lambda c: scores[c.chunk_id], reverse=True)
    for rank, chunk in enumerate(ranked):
        chunk.rrf_score = round(scores[chunk.chunk_id], 6)
        chunk.final_rank = rank + 1
    return ranked


async def rerank(
    query: str, candidates: list[RetrievedChunk], top_k: int = 5
) -> list[RetrievedChunk]:
    """LLM-as-judge cross-encoder pass: jointly score query x passage, keep the best top_k."""
    if len(candidates) <= top_k:
        return candidates

    passages = "\n\n".join(
        f"[{i}] (from {c.source_document}) {c.text[:800]}" for i, c in enumerate(candidates)
    )
    try:
        result = await chat_json(_RERANK_SYSTEM, f"Question: {query}\n\nPassages:\n{passages}")
        relevance: dict[int, float] = {
            int(item["index"]): float(item["relevance"])
            for item in result.get("scores", [])
            if 0 <= int(item["index"]) < len(candidates)
        }
    except Exception:
        logger.exception("rerank_failed; falling back to fusion order")
        return candidates[:top_k]

    for i, chunk in enumerate(candidates):
        chunk.rerank_score = relevance.get(i)
    # Stable sort: rerank score desc, original fusion order breaks ties.
    reranked = sorted(
        candidates, key=lambda c: c.rerank_score if c.rerank_score is not None else -1.0, reverse=True
    )[:top_k]
    for rank, chunk in enumerate(reranked):
        chunk.final_rank = rank + 1
    return reranked


async def retrieve(
    query: str,
    mode: RetrievalMode,
    dense_weight: float,
    top_k: int,
    embedding_store: EmbeddingStore,
    bm25_index: BM25Index,
) -> list[RetrievedChunk]:
    """Run the full retrieval stage for the requested mode, including reranking."""
    pool = max(settings.candidate_pool_size, top_k)
    if mode == "dense":
        candidates = await dense_search(query, pool, embedding_store)
    elif mode == "sparse":
        candidates = await sparse_search(query, pool, bm25_index)
    else:
        dense = await dense_search(query, pool, embedding_store)
        sparse = await sparse_search(query, pool, bm25_index)
        candidates = reciprocal_rank_fusion(dense, sparse, alpha=dense_weight)
    return await rerank(query, candidates, top_k=top_k)
