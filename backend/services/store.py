"""Process-wide singletons, initialized once at startup via the FastAPI lifespan."""

import logging
from pathlib import Path

from config import settings
from services.bm25_index import BM25Index
from services.embeddings import EmbeddingStore

logger = logging.getLogger(__name__)

_embedding_store: EmbeddingStore | None = None
_bm25_index: BM25Index | None = None


def init() -> None:
    global _embedding_store, _bm25_index
    for directory in (
        settings.chroma_persist_dir,
        settings.bm25_persist_dir,
        settings.documents_dir,
    ):
        Path(directory).mkdir(parents=True, exist_ok=True)
    _embedding_store = EmbeddingStore()
    _bm25_index = BM25Index()


def embedding_store() -> EmbeddingStore:
    assert _embedding_store is not None, "store.init() must run before use"
    return _embedding_store


def bm25_index() -> BM25Index:
    assert _bm25_index is not None, "store.init() must run before use"
    return _bm25_index


async def seed_sample_corpus() -> None:
    """On a fresh index, ingest the bundled sample corpus so the app works immediately."""
    from services.ingestion import ingest_file

    if await embedding_store().count() > 0:
        return
    corpus_dir = Path(settings.sample_corpus_dir)
    if not corpus_dir.exists():
        logger.warning("sample_corpus_missing", extra={"dir": str(corpus_dir)})
        return
    files = sorted(corpus_dir.glob("*.md"))
    logger.info("seeding_sample_corpus", extra={"files": len(files)})
    for path in files:
        try:
            await ingest_file(
                file_path=path,
                original_filename=path.name,
                strategy="recursive",
                chunk_size=512,
                overlap=64,
                embedding_store=embedding_store(),
                bm25_index=bm25_index(),
            )
        except Exception:
            logger.exception("seed_failed", extra={"file": path.name})
