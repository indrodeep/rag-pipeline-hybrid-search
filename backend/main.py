"""FastAPI entrypoint for the RAG pipeline service.

Run from the backend/ directory:  uvicorn main:app --reload --port 8000
"""

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import settings
from exceptions import RagError
from logging_config import configure_logging
from routers import ask, documents, eval as eval_router, ingest
from services import store
from services.rate_limit import usage

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    store.init()
    await store.seed_sample_corpus()
    logger.info("startup_complete", extra={"chunks": await store.embedding_store().count()})
    yield


app = FastAPI(
    title="RAG Pipeline with Hybrid Search",
    description=(
        "Retrieval-Augmented Generation over internal documents: hybrid dense+sparse retrieval "
        "fused with Reciprocal Rank Fusion, LLM-as-judge reranking, grounded generation with "
        "verified citations, and composite confidence scoring."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RagError)
async def rag_error_handler(_: Request, exc: RagError) -> JSONResponse:
    # "message" is a reserved LogRecord attribute — use a non-colliding key
    logger.warning("service_error", extra={"code": exc.code, "error_message": exc.message})
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.code, "message": exc.message},
    )


@app.get("/health", tags=["meta"])
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/v1/usage", tags=["meta"])
async def usage_status(request: Request) -> dict[str, object]:
    """Current caller's standing against the public-demo rate limits."""
    return usage(request)


app.include_router(ask.router)
app.include_router(ingest.router)
app.include_router(documents.router)
app.include_router(eval_router.router)
