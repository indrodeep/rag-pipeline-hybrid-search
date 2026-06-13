"""Models for the ask / retrieval pipeline."""

from typing import Literal

from pydantic import BaseModel, Field

RetrievalMode = Literal["hybrid", "dense", "sparse"]


class AskRequest(BaseModel):
    question: str = Field(min_length=3, max_length=2000)
    dense_weight: float = Field(default=0.7, ge=0.0, le=1.0, description="RRF weight for dense results")
    top_k: int = Field(default=5, ge=1, le=10)
    verify_citations: bool = True
    retrieval_mode: RetrievalMode = "hybrid"


class RetrievedChunk(BaseModel):
    chunk_id: str
    text: str
    source_document: str
    section_heading: str
    chunking_strategy: str
    dense_score: float | None = None
    sparse_score: float | None = None
    rrf_score: float | None = None
    rerank_score: float | None = None
    final_rank: int


class Citation(BaseModel):
    index: int
    chunk_id: str
    source_document: str
    section_heading: str
    excerpt: str
    support_score: float
    verified: bool
    claim_text: str = ""
    judge_explanation: str = ""


class ConfidenceBreakdown(BaseModel):
    retrieval: float
    citation_coverage: float
    completeness: float
    composite: float


class AskResponse(BaseModel):
    answer: str
    citations: list[Citation]
    confidence: ConfidenceBreakdown
    retrieved_chunks: list[RetrievedChunk]
    retrieval_mode_used: RetrievalMode
    latency_ms: float
    insufficient_context: bool


class StatsResponse(BaseModel):
    total_documents: int
    total_chunks: int
    avg_confidence_last_50: float | None
    retrieval_mode_distribution: dict[str, int]
    top_questions_by_confidence: list[dict[str, float | str]]
