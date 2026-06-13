"""Embedding generation (OpenAI) and dense vector storage (ChromaDB)."""

import asyncio
import logging

import chromadb
import openai
from chromadb.api.models.Collection import Collection
from openai import AsyncOpenAI

from config import settings
from exceptions import LLMResponseError
from models.documents import Chunk

logger = logging.getLogger(__name__)

EMBED_BATCH_SIZE = 128


class EmbeddingStore:
    """Owns the ChromaDB collection and all embedding calls."""

    def __init__(self) -> None:
        self._client = chromadb.PersistentClient(
            path=settings.chroma_persist_dir,
            settings=chromadb.Settings(anonymized_telemetry=False),
        )
        self._collection: Collection = self._client.get_or_create_collection(
            name=settings.collection_name,
            metadata={"hnsw:space": "cosine"},
        )
        self._openai = AsyncOpenAI(api_key=settings.openai_api_key, max_retries=8)

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """Embed a list of texts, batching to stay under request limits."""
        embeddings: list[list[float]] = []
        try:
            for start in range(0, len(texts), EMBED_BATCH_SIZE):
                batch = texts[start : start + EMBED_BATCH_SIZE]
                response = await self._openai.embeddings.create(
                    model=settings.embedding_model, input=batch
                )
                embeddings.extend(item.embedding for item in response.data)
        except openai.APIError as exc:
            raise LLMResponseError(f"OpenAI embedding request failed: {exc}") from exc
        return embeddings

    async def embed_query(self, query: str) -> list[float]:
        return (await self.embed_texts([query]))[0]

    async def add_chunks(self, chunks: list[Chunk], embeddings: list[list[float]]) -> None:
        if not chunks:
            return
        await asyncio.to_thread(
            self._collection.add,
            ids=[c.chunk_id for c in chunks],
            embeddings=embeddings,  # type: ignore[arg-type]
            documents=[c.text for c in chunks],
            metadatas=[
                {
                    "document_id": c.document_id,
                    "source_document": c.source_document,
                    "section_heading": c.section_heading,
                    "chunking_strategy": c.chunking_strategy,
                    "chunk_index": c.chunk_index,
                }
                for c in chunks
            ],
        )

    async def query(
        self, embedding: list[float], k: int
    ) -> list[tuple[str, str, dict[str, str | int | float | bool], float]]:
        """Return (chunk_id, text, metadata, cosine_similarity), best first."""
        count = await self.count()
        if count == 0:
            return []
        result = await asyncio.to_thread(
            self._collection.query,
            query_embeddings=[embedding],  # type: ignore[arg-type]
            n_results=min(k, count),
            include=["documents", "metadatas", "distances"],
        )
        ids = result["ids"][0]
        docs = (result["documents"] or [[]])[0]
        metas = (result["metadatas"] or [[]])[0]
        dists = (result["distances"] or [[]])[0]
        # Chroma cosine distance = 1 - cosine similarity
        return [
            (ids[i], docs[i], dict(metas[i]), 1.0 - float(dists[i]))
            for i in range(len(ids))
        ]

    async def max_similarity(self, embedding: list[float]) -> float:
        """Highest cosine similarity of any stored chunk to this embedding (for dedup)."""
        hits = await self.query(embedding, k=1)
        return hits[0][3] if hits else -1.0

    async def delete_document(self, document_id: str) -> None:
        await asyncio.to_thread(self._collection.delete, where={"document_id": document_id})

    async def count(self) -> int:
        return await asyncio.to_thread(self._collection.count)
