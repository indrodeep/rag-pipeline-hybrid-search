"""POST /v1/ask — the full RAG question-answering pipeline."""

from fastapi import APIRouter, Depends

from models.documents import ErrorResponse
from models.query import AskRequest, AskResponse
from services.pipeline import answer_question
from services.rate_limit import enforce_rate_limit

router = APIRouter(prefix="/v1", tags=["ask"])


@router.post(
    "/ask",
    response_model=AskResponse,
    responses={
        409: {"model": ErrorResponse},
        429: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
    },
    dependencies=[Depends(enforce_rate_limit)],
)
async def ask(request: AskRequest) -> AskResponse:
    """Retrieve (hybrid/dense/sparse) → rerank → generate → verify citations → score confidence."""
    return await answer_question(request)
