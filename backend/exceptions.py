"""Typed service-layer exceptions, mapped to structured HTTP errors at the API boundary."""


class RagError(Exception):
    """Base class for all service errors."""

    status_code: int = 500
    code: str = "internal_error"

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class UnsupportedFileTypeError(RagError):
    status_code = 415
    code = "unsupported_file_type"


class DocumentParseError(RagError):
    status_code = 422
    code = "document_parse_error"


class EmptyIndexError(RagError):
    status_code = 409
    code = "empty_index"


class DocumentNotFoundError(RagError):
    status_code = 404
    code = "document_not_found"


class LLMResponseError(RagError):
    status_code = 502
    code = "llm_response_error"


class EvalAlreadyRunningError(RagError):
    status_code = 409
    code = "eval_already_running"


class DocumentLimitError(RagError):
    status_code = 409
    code = "document_limit_reached"


class RateLimitError(RagError):
    status_code = 429
    code = "rate_limited"


class AdminRequiredError(RagError):
    status_code = 403
    code = "admin_required"
