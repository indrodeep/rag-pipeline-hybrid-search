"""Document loading, chunking (fixed / recursive / semantic), dedup, and indexing."""

import logging
import re
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from bs4 import BeautifulSoup
from langchain_text_splitters import CharacterTextSplitter, RecursiveCharacterTextSplitter

from exceptions import DocumentParseError, UnsupportedFileTypeError
from models.documents import Chunk, ChunkingStrategy, DocumentMeta, FileType, IngestResponse
from services import registry
from services.bm25_index import BM25Index
from services.embeddings import EmbeddingStore

logger = logging.getLogger(__name__)

# chunk_size/overlap are expressed in approximate tokens; splitters work in characters.
CHARS_PER_TOKEN = 4

_EXTENSION_MAP: dict[str, FileType] = {
    ".pdf": "pdf",
    ".md": "markdown",
    ".markdown": "markdown",
    ".txt": "text",
    ".html": "html",
    ".htm": "html",
}

_HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$", re.MULTILINE)
_SENTENCE_RE = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9#])")


def detect_file_type(filename: str) -> FileType:
    ext = Path(filename).suffix.lower()
    if ext not in _EXTENSION_MAP:
        raise UnsupportedFileTypeError(
            f"Unsupported file extension '{ext}'. Supported: {sorted(_EXTENSION_MAP)}"
        )
    return _EXTENSION_MAP[ext]


def load_document(file_path: Path, file_type: FileType) -> str:
    """Extract plain text from a document on disk."""
    try:
        if file_type == "pdf":
            import fitz  # PyMuPDF

            with fitz.open(file_path) as doc:
                text = "\n\n".join(page.get_text() for page in doc)
        elif file_type == "html":
            soup = BeautifulSoup(file_path.read_text(encoding="utf-8", errors="replace"), "html.parser")
            for tag in soup(["script", "style", "nav", "footer"]):
                tag.decompose()
            text = soup.get_text(separator="\n")
        else:  # markdown, text
            text = file_path.read_text(encoding="utf-8", errors="replace")
    except UnsupportedFileTypeError:
        raise
    except Exception as exc:
        raise DocumentParseError(f"Failed to parse {file_path.name}: {exc}") from exc

    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if not text:
        raise DocumentParseError(f"{file_path.name} produced no extractable text")
    return text


def _section_heading_for(text: str, chunk_text: str) -> str:
    """Nearest markdown heading preceding the chunk's position in the source text."""
    probe = chunk_text.strip()[:80]
    pos = text.find(probe)
    if pos == -1:
        return ""
    last = ""
    for match in _HEADING_RE.finditer(text):
        if match.start() > pos:
            break
        last = match.group(2).strip()
    return last


def _split_fixed(text: str, chunk_size: int, overlap: int) -> list[str]:
    splitter = CharacterTextSplitter(
        separator=" ",
        chunk_size=chunk_size * CHARS_PER_TOKEN,
        chunk_overlap=overlap * CHARS_PER_TOKEN,
    )
    return splitter.split_text(text)


def _split_recursive(text: str, chunk_size: int, overlap: int) -> list[str]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size * CHARS_PER_TOKEN,
        chunk_overlap=overlap * CHARS_PER_TOKEN,
        separators=["\n## ", "\n### ", "\n\n", "\n", ". ", " "],
    )
    return splitter.split_text(text)


async def _split_semantic(
    text: str, chunk_size: int, embedding_store: EmbeddingStore
) -> list[str]:
    """Greedy semantic chunking: break where consecutive-sentence embedding similarity dips.

    Sentences are embedded once; a boundary is placed where similarity falls below
    (mean - std) of all adjacent-pair similarities, or when the size budget is hit.
    """
    sentences = [s.strip() for s in _SENTENCE_RE.split(text) if s.strip()]
    if len(sentences) < 3:
        return [text]

    vectors = np.array(await embedding_store.embed_texts(sentences), dtype=np.float64)
    vectors /= np.linalg.norm(vectors, axis=1, keepdims=True)
    sims = np.sum(vectors[:-1] * vectors[1:], axis=1)
    threshold = float(np.mean(sims) - np.std(sims))
    max_chars = chunk_size * CHARS_PER_TOKEN
    min_chars = max_chars // 4

    chunks: list[str] = []
    current: list[str] = [sentences[0]]
    current_len = len(sentences[0])
    for i, sentence in enumerate(sentences[1:]):
        boundary = sims[i] < threshold and current_len >= min_chars
        if boundary or current_len + len(sentence) > max_chars:
            chunks.append(" ".join(current))
            current, current_len = [], 0
        current.append(sentence)
        current_len += len(sentence) + 1
    if current:
        chunks.append(" ".join(current))
    return chunks


async def chunk_document(
    text: str,
    strategy: ChunkingStrategy,
    chunk_size: int,
    overlap: int,
    document_id: str,
    source_document: str,
    embedding_store: EmbeddingStore,
) -> list[Chunk]:
    if strategy == "fixed":
        pieces = _split_fixed(text, chunk_size, overlap)
    elif strategy == "recursive":
        pieces = _split_recursive(text, chunk_size, overlap)
    else:
        pieces = await _split_semantic(text, chunk_size, embedding_store)

    return [
        Chunk(
            chunk_id=f"{document_id}:{i}",
            document_id=document_id,
            text=piece.strip(),
            chunk_index=i,
            section_heading=_section_heading_for(text, piece),
            chunking_strategy=strategy,
            source_document=source_document,
        )
        for i, piece in enumerate(pieces)
        if piece.strip()
    ]


async def ingest_file(
    file_path: Path,
    original_filename: str,
    strategy: ChunkingStrategy,
    chunk_size: int,
    overlap: int,
    embedding_store: EmbeddingStore,
    bm25_index: BM25Index,
) -> IngestResponse:
    """Full ingest: parse → chunk → embed → dedup → index in Chroma + BM25."""
    started = time.perf_counter()
    file_type = detect_file_type(original_filename)
    text = load_document(file_path, file_type)
    document_id = uuid.uuid4().hex[:12]

    chunks = await chunk_document(
        text, strategy, chunk_size, overlap, document_id, original_filename, embedding_store
    )
    embeddings = await embedding_store.embed_texts([c.text for c in chunks])

    # Dedup: drop chunks whose cosine similarity to any existing (or already-accepted) chunk
    # exceeds the threshold.
    from config import settings

    kept_chunks: list[Chunk] = []
    kept_vectors: list[np.ndarray] = []
    kept_embeddings: list[list[float]] = []
    deduplicated = 0
    for chunk, embedding in zip(chunks, embeddings):
        vec = np.asarray(embedding, dtype=np.float64)
        vec = vec / np.linalg.norm(vec)
        in_batch_dup = any(float(vec @ kv) > settings.dedup_threshold for kv in kept_vectors)
        in_index_dup = (
            not in_batch_dup
            and await embedding_store.max_similarity(embedding) > settings.dedup_threshold
        )
        if in_batch_dup or in_index_dup:
            deduplicated += 1
            continue
        kept_chunks.append(chunk)
        kept_vectors.append(vec)
        kept_embeddings.append(embedding)
    await embedding_store.add_chunks(kept_chunks, kept_embeddings)
    await bm25_index.add_chunks(kept_chunks)

    registry.save_document(
        DocumentMeta(
            document_id=document_id,
            filename=original_filename,
            file_type=file_type,
            chunk_count=len(kept_chunks),
            chunking_strategy=strategy,
            chunk_size=chunk_size,
            overlap=overlap,
            uploaded_at=datetime.now(timezone.utc).isoformat(),
        )
    )

    elapsed_ms = (time.perf_counter() - started) * 1000
    logger.info(
        "document_ingested",
        extra={
            "document_id": document_id,
            "file_name": original_filename,  # "filename" is a reserved LogRecord attribute
            "chunks": len(kept_chunks),
            "deduplicated": deduplicated,
            "strategy": strategy,
        },
    )
    return IngestResponse(
        document_id=document_id,
        filename=original_filename,
        chunks_created=len(kept_chunks),
        chunks_deduplicated=deduplicated,
        chunking_strategy=strategy,
        processing_time_ms=round(elapsed_ms, 1),
    )
