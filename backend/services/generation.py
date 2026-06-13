"""Grounded answer generation with inline bracketed citations."""

import logging
import re

from config import settings
from models.query import RetrievedChunk
from services.llm import chat_json

logger = logging.getLogger(__name__)

IDK_TEXT = "I don't have enough information in the indexed documents to answer this question."

_CITATION_RE = re.compile(r"\[(\d+)\]")

_SYSTEM = """You answer questions strictly from the provided context blocks.

Rules:
1. Use ONLY information present in the numbered context blocks. Never use outside knowledge.
2. Cite every factual claim with the bracketed number of the supporting block, e.g. [1] or [2][3].
3. If the context does not contain enough information to answer, set "insufficient_context" \
to true and write exactly: "{idk}"
4. Be precise and concise. Quote exact identifiers, commands, and values verbatim.

Respond with JSON: {{"answer": "<answer text with [N] citations>", "insufficient_context": <bool>}}"""


def build_context_blocks(chunks: list[RetrievedChunk]) -> str:
    blocks = []
    for i, chunk in enumerate(chunks, start=1):
        heading = f" — {chunk.section_heading}" if chunk.section_heading else ""
        blocks.append(f"[{i}] (source: {chunk.source_document}{heading})\n{chunk.text}")
    return "\n\n".join(blocks)


def extract_citation_indices(answer: str, max_index: int) -> list[int]:
    """Unique citation indices appearing in the answer, in order of first appearance."""
    seen: list[int] = []
    for match in _CITATION_RE.finditer(answer):
        idx = int(match.group(1))
        if 1 <= idx <= max_index and idx not in seen:
            seen.append(idx)
    return seen


async def generate_answer(
    question: str, chunks: list[RetrievedChunk]
) -> tuple[str, bool, list[int]]:
    """Returns (answer_text, insufficient_context, cited_indices)."""
    if not chunks:
        return IDK_TEXT, True, []

    context = build_context_blocks(chunks)
    result = await chat_json(
        _SYSTEM.format(idk=IDK_TEXT),
        f"Context blocks:\n\n{context}\n\nQuestion: {question}",
        model=settings.generation_model,
    )
    answer = str(result.get("answer", "")).strip()
    insufficient = bool(result.get("insufficient_context", False))
    if not answer:
        answer, insufficient = IDK_TEXT, True

    cited = extract_citation_indices(answer, max_index=len(chunks))
    if insufficient:
        cited = []
    return answer, insufficient, cited
