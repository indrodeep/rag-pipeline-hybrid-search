"""Sparse BM25 index with pickle persistence."""

import asyncio
import logging
import pickle
import re
from pathlib import Path
from typing import Any

from rank_bm25 import BM25Okapi

from config import settings
from models.documents import Chunk

logger = logging.getLogger(__name__)

_TOKEN_RE = re.compile(r"[a-z0-9_]+")


def tokenize(text: str) -> list[str]:
    """Lowercase word tokens; underscores preserved so identifiers like rotate_key survive."""
    return _TOKEN_RE.findall(text.lower())


class BM25Index:
    """In-memory BM25 over all chunks, persisted as a pickle of the raw corpus."""

    def __init__(self) -> None:
        self._path = Path(settings.bm25_persist_dir) / "bm25_corpus.pkl"
        self._chunk_ids: list[str] = []
        self._texts: list[str] = []
        self._metadatas: list[dict[str, Any]] = []
        self._bm25: BM25Okapi | None = None
        self._lock = asyncio.Lock()
        self._load()

    def _load(self) -> None:
        if not self._path.exists():
            return
        try:
            with self._path.open("rb") as fh:
                payload = pickle.load(fh)
            self._chunk_ids = payload["chunk_ids"]
            self._texts = payload["texts"]
            self._metadatas = payload["metadatas"]
            self._rebuild()
            logger.info("bm25_loaded", extra={"chunks": len(self._chunk_ids)})
        except Exception:
            logger.exception("bm25_load_failed; starting empty")

    def _save(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with self._path.open("wb") as fh:
            pickle.dump(
                {"chunk_ids": self._chunk_ids, "texts": self._texts, "metadatas": self._metadatas},
                fh,
            )

    def _rebuild(self) -> None:
        self._bm25 = BM25Okapi([tokenize(t) for t in self._texts]) if self._texts else None

    async def add_chunks(self, chunks: list[Chunk]) -> None:
        if not chunks:
            return
        async with self._lock:
            for chunk in chunks:
                self._chunk_ids.append(chunk.chunk_id)
                self._texts.append(chunk.text)
                self._metadatas.append(
                    {
                        "document_id": chunk.document_id,
                        "source_document": chunk.source_document,
                        "section_heading": chunk.section_heading,
                        "chunking_strategy": chunk.chunking_strategy,
                    }
                )
            await asyncio.to_thread(self._rebuild)
            await asyncio.to_thread(self._save)

    async def delete_document(self, document_id: str) -> None:
        async with self._lock:
            keep = [
                i
                for i, meta in enumerate(self._metadatas)
                if meta["document_id"] != document_id
            ]
            self._chunk_ids = [self._chunk_ids[i] for i in keep]
            self._texts = [self._texts[i] for i in keep]
            self._metadatas = [self._metadatas[i] for i in keep]
            await asyncio.to_thread(self._rebuild)
            await asyncio.to_thread(self._save)

    async def search(self, query: str, k: int) -> list[tuple[str, str, dict[str, Any], float]]:
        """Return (chunk_id, text, metadata, bm25_score), best first. Zero-score hits dropped."""
        if self._bm25 is None:
            return []
        tokens = tokenize(query)
        if not tokens:
            return []
        scores = await asyncio.to_thread(self._bm25.get_scores, tokens)
        ranked = sorted(range(len(scores)), key=lambda i: float(scores[i]), reverse=True)[:k]
        return [
            (self._chunk_ids[i], self._texts[i], self._metadatas[i], float(scores[i]))
            for i in ranked
            if float(scores[i]) > 0.0
        ]

    @property
    def size(self) -> int:
        return len(self._chunk_ids)
