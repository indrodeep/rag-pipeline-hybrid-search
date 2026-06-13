"""GET /v1/documents, DELETE /v1/documents/{id}, GET /v1/stats."""

from fastapi import APIRouter

from exceptions import DocumentNotFoundError
from models.documents import DocumentListResponse, ErrorResponse
from models.query import StatsResponse
from services import registry, store

router = APIRouter(prefix="/v1", tags=["documents"])


@router.get("/documents", response_model=DocumentListResponse)
async def list_documents() -> DocumentListResponse:
    """All indexed documents with chunk counts, strategy, and upload time."""
    documents = sorted(registry.list_documents(), key=lambda d: d.uploaded_at, reverse=True)
    return DocumentListResponse(
        documents=documents,
        total_chunks=await store.embedding_store().count(),
    )


@router.delete(
    "/documents/{document_id}",
    responses={404: {"model": ErrorResponse}},
)
async def delete_document(document_id: str) -> dict[str, str]:
    """Remove a document's chunks from both indexes and the registry."""
    if not registry.remove_document(document_id):
        raise DocumentNotFoundError(f"No document with id '{document_id}'")
    await store.embedding_store().delete_document(document_id)
    await store.bm25_index().delete_document(document_id)
    return {"status": "deleted", "document_id": document_id}


@router.get("/stats", response_model=StatsResponse)
async def stats() -> StatsResponse:
    """Index size and rolling query-quality metrics."""
    documents = registry.list_documents()
    log = registry.read_query_log()
    recent = log[-50:]

    mode_distribution: dict[str, int] = {"hybrid": 0, "dense": 0, "sparse": 0}
    for entry in log:
        mode = str(entry.get("retrieval_mode", "hybrid"))
        mode_distribution[mode] = mode_distribution.get(mode, 0) + 1

    top = sorted(recent, key=lambda e: float(e.get("composite_confidence", 0)), reverse=True)[:5]
    return StatsResponse(
        total_documents=len(documents),
        total_chunks=await store.embedding_store().count(),
        avg_confidence_last_50=(
            round(sum(float(e["composite_confidence"]) for e in recent) / len(recent), 3)
            if recent
            else None
        ),
        retrieval_mode_distribution=mode_distribution,
        top_questions_by_confidence=[
            {
                "question": str(e["question"]),
                "confidence": float(e["composite_confidence"]),
            }
            for e in top
        ],
    )
