"""POST /v1/ingest — upload and index a document."""

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, UploadFile

from config import settings
from exceptions import DocumentLimitError, DocumentParseError
from models.documents import ChunkingStrategy, ErrorResponse, IngestResponse
from services import registry, store
from services.ingestion import detect_file_type, ingest_file
from services.rate_limit import require_admin

router = APIRouter(prefix="/v1", tags=["ingest"])

MAX_UPLOAD_BYTES = 25 * 1024 * 1024


@router.post(
    "/ingest",
    response_model=IngestResponse,
    responses={
        403: {"model": ErrorResponse},
        415: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
    },
    dependencies=[Depends(require_admin)],
)
async def ingest(
    file: UploadFile = File(...),
    chunking_strategy: ChunkingStrategy = Form("recursive"),
    chunk_size: int = Form(512, ge=64, le=2048),
    overlap: int = Form(64, ge=0, le=512),
) -> IngestResponse:
    """Parse, chunk, embed, dedup, and index an uploaded PDF / markdown / text / HTML file."""
    if len(registry.list_documents()) >= settings.max_documents:
        raise DocumentLimitError(
            f"Document limit reached ({settings.max_documents}). "
            "Remove a document before adding a new one."
        )

    filename = file.filename or "upload.txt"
    detect_file_type(filename)  # fail fast on unsupported extensions

    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise DocumentParseError(f"File exceeds {MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit")

    # Persist the raw upload so the corpus is reproducible.
    raw_dir = Path(settings.documents_dir) / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    saved_path = raw_dir / f"{uuid.uuid4().hex[:8]}_{Path(filename).name}"
    saved_path.write_bytes(content)

    return await ingest_file(
        file_path=saved_path,
        original_filename=filename,
        strategy=chunking_strategy,
        chunk_size=chunk_size,
        overlap=overlap,
        embedding_store=store.embedding_store(),
        bm25_index=store.bm25_index(),
    )
