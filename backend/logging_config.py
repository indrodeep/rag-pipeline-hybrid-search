"""Structured JSON logging for the whole service."""

import logging
import sys

from pythonjsonlogger.json import JsonFormatter

from config import settings


def configure_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        JsonFormatter(
            "%(asctime)s %(levelname)s %(name)s %(message)s",
            rename_fields={"asctime": "timestamp", "levelname": "level", "name": "logger"},
        )
    )
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(settings.log_level.upper())
    # Quiet noisy third-party loggers
    for noisy in ("httpx", "httpcore", "chromadb", "openai", "uvicorn.access"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    # Chroma's bundled posthog client is broken and logs ERRORs on every event
    logging.getLogger("chromadb.telemetry").setLevel(logging.CRITICAL)
