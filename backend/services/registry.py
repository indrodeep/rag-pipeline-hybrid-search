"""JSON-file persistence for document metadata, query log, and eval run history."""

import json
import logging
from pathlib import Path
from typing import Any

from config import settings
from models.documents import DocumentMeta

logger = logging.getLogger(__name__)

_REGISTRY_PATH = Path(settings.documents_dir) / "registry.json"


def _read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        logger.exception("failed_to_read_json", extra={"path": str(path)})
        return default


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


# --- Document registry ---


def list_documents() -> list[DocumentMeta]:
    raw = _read_json(_REGISTRY_PATH, {})
    return [DocumentMeta.model_validate(entry) for entry in raw.values()]


def get_document(document_id: str) -> DocumentMeta | None:
    raw = _read_json(_REGISTRY_PATH, {})
    entry = raw.get(document_id)
    return DocumentMeta.model_validate(entry) if entry else None


def save_document(meta: DocumentMeta) -> None:
    raw = _read_json(_REGISTRY_PATH, {})
    raw[meta.document_id] = meta.model_dump()
    _write_json(_REGISTRY_PATH, raw)


def remove_document(document_id: str) -> bool:
    raw = _read_json(_REGISTRY_PATH, {})
    if document_id not in raw:
        return False
    del raw[document_id]
    _write_json(_REGISTRY_PATH, raw)
    return True


# --- Query log (powers /v1/stats) ---


def append_query_log(entry: dict[str, Any]) -> None:
    path = Path(settings.query_log_path)
    log: list[dict[str, Any]] = _read_json(path, [])
    log.append(entry)
    _write_json(path, log[-settings.query_log_max_entries :])


def read_query_log() -> list[dict[str, Any]]:
    return _read_json(Path(settings.query_log_path), [])


# --- Eval run history ---


def append_eval_run(report: dict[str, Any]) -> None:
    path = Path(settings.eval_runs_path)
    runs: list[dict[str, Any]] = _read_json(path, [])
    runs.append(report)
    _write_json(path, runs)


def read_eval_runs() -> list[dict[str, Any]]:
    return _read_json(Path(settings.eval_runs_path), [])
