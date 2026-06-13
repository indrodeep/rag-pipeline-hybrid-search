"""Thin wrapper around the OpenAI chat API for generation and LLM-as-judge calls."""

import asyncio
import json
import logging
from typing import Any

import openai
from openai import AsyncOpenAI

from config import settings
from exceptions import LLMResponseError

logger = logging.getLogger(__name__)

# Generous retry budget: low-tier OpenAI orgs have small TPM limits and the SDK
# honors Retry-After on 429s, so retrying is the correct behavior under burst load.
_client = AsyncOpenAI(api_key=settings.openai_api_key, max_retries=8)

# Statuses the SDK won't retry but that are transient at OpenAI's edge in practice
# (431 "request headers too large" shows up spuriously under concurrent load).
_TRANSIENT_STATUSES = {431, 500, 502, 503}


async def _create_completion(system: str, user: str, model: str, temperature: float) -> str | None:
    response = await _client.chat.completions.create(
        model=model,
        temperature=temperature,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    return response.choices[0].message.content


async def chat_json(
    system: str, user: str, model: str | None = None, temperature: float = 0.0
) -> dict[str, Any]:
    """Single chat completion constrained to a JSON object; parsed and returned.

    OpenAI failures are mapped to LLMResponseError so the API layer returns a
    structured 502 instead of an opaque 500.
    """
    resolved_model = model or settings.judge_model
    try:
        try:
            content = await _create_completion(system, user, resolved_model, temperature)
        except openai.APIStatusError as exc:
            if exc.status_code not in _TRANSIENT_STATUSES:
                raise
            logger.warning(
                "openai_transient_error_retrying",
                extra={"status": exc.status_code, "model": resolved_model},
            )
            await asyncio.sleep(1.0)
            content = await _create_completion(system, user, resolved_model, temperature)
    except openai.APIError as exc:
        raise LLMResponseError(f"OpenAI request failed: {exc}") from exc

    if not content:
        raise LLMResponseError("Model returned an empty response")
    try:
        parsed: dict[str, Any] = json.loads(content)
        return parsed
    except json.JSONDecodeError as exc:
        raise LLMResponseError(f"Model returned invalid JSON: {content[:200]}") from exc
