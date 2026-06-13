"""Application settings. Every tunable lives here, sourced from the environment."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Required
    openai_api_key: str

    # Storage
    chroma_persist_dir: str = "./data/chroma"
    bm25_persist_dir: str = "./data/bm25"
    documents_dir: str = "./data/documents"
    sample_corpus_dir: str = "./data/sample_corpus"
    golden_qa_path: str = "./data/golden_qa.json"
    query_log_path: str = "./data/query_log.json"
    eval_runs_path: str = "./data/eval_runs.json"

    # Models
    embedding_model: str = "text-embedding-3-small"
    generation_model: str = "gpt-4o"
    judge_model: str = "gpt-4o"

    # Retrieval / indexing
    collection_name: str = "rag_chunks"
    dedup_threshold: float = 0.95
    rrf_k: int = 60
    default_dense_weight: float = 0.7
    default_top_k: int = 5
    candidate_pool_size: int = 10

    # Confidence weights (must sum to 1.0)
    weight_retrieval: float = 0.3
    weight_citation: float = 0.4
    weight_completeness: float = 0.3

    # Eval: sequential by default so low-TPM OpenAI orgs don't hit 429 storms
    eval_concurrency: int = 1

    # Hard cap on simultaneously indexed documents
    max_documents: int = 8

    # Misc
    log_level: str = "INFO"
    query_log_max_entries: int = 200
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # --- Public demo guardrails (cap OpenAI spend from stranger traffic) ---
    # When true, /v1/ask is rate-limited and the expensive endpoints (upload,
    # eval) are locked to an admin key. Set false for a private/local instance.
    public_demo_mode: bool = True
    # A request bypasses every limit (and reaches admin-only endpoints) when it
    # sends header  X-Admin-Key: <this value>.  Empty disables admin access.
    admin_api_key: str = ""
    # Per-IP cap on /v1/ask per UTC day.
    rate_limit_per_ip_daily: int = 20
    # Global cap on /v1/ask per UTC day across all callers — the hard kill-switch.
    rate_limit_global_daily: int = 300


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # openai_api_key comes from env


settings = get_settings()
