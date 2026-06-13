"""Models for document ingestion and chunk storage."""

from typing import Literal

from pydantic import BaseModel, Field

ChunkingStrategy = Literal["fixed", "recursive", "semantic"]
FileType = Literal["pdf", "markdown", "text", "html"]


class Chunk(BaseModel):
    chunk_id: str
    document_id: str
    text: str
    chunk_index: int
    section_heading: str = ""
    chunking_strategy: ChunkingStrategy
    source_document: str


class DocumentMeta(BaseModel):
    document_id: str
    filename: str
    file_type: FileType
    chunk_count: int
    chunking_strategy: ChunkingStrategy
    chunk_size: int
    overlap: int
    uploaded_at: str  # ISO 8601


class IngestResponse(BaseModel):
    document_id: str
    filename: str
    chunks_created: int
    chunks_deduplicated: int
    chunking_strategy: ChunkingStrategy
    processing_time_ms: float


class DocumentListResponse(BaseModel):
    documents: list[DocumentMeta]
    total_chunks: int


class ErrorResponse(BaseModel):
    error: str = Field(description="Machine-readable error code")
    message: str = Field(description="Human-readable explanation")
