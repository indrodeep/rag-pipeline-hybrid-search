"""Golden Q&A eval runner with LLM-as-judge correctness scoring."""

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

from config import settings
from exceptions import EvalAlreadyRunningError
from models.eval import EvalCase, EvalCaseResult, EvalProgress, EvalReport
from models.query import AskRequest
from services import registry
from services.generation import IDK_TEXT
from services.llm import chat_json
from services.pipeline import answer_question

logger = logging.getLogger(__name__)

CORRECTNESS_PASS_THRESHOLD = 4.0

_CORRECTNESS_SYSTEM = """You grade a RAG system's answer against a reference answer. Score 1-5:
5 = factually equivalent to the reference (wording may differ)
4 = correct on all key facts, minor omissions
3 = partially correct
2 = mostly incorrect or missing the key fact
1 = wrong or unrelated
Ignore citation markers like [1]. Respond with JSON: {"score": <1-5>}"""

_progress = EvalProgress(running=False, completed=0, total=0)


def get_progress() -> EvalProgress:
    return _progress


def load_golden_cases() -> list[EvalCase]:
    raw = json.loads(Path(settings.golden_qa_path).read_text(encoding="utf-8"))
    return [EvalCase.model_validate(case) for case in raw]


async def _judge_correctness(case: EvalCase, answer: str) -> float:
    try:
        result = await chat_json(
            _CORRECTNESS_SYSTEM,
            f"Question: {case.question}\n\nReference answer: {case.expected_answer}\n\n"
            f"System answer: {answer}",
        )
        return max(1.0, min(5.0, float(result.get("score", 1))))
    except Exception:
        logger.exception("correctness_judge_failed", extra={"case": case.id})
        return 1.0


def _error_result(case: EvalCase, exc: Exception) -> EvalCaseResult:
    """A case that errored counts as a failure rather than aborting the whole run."""
    return EvalCaseResult(
        case_id=case.id,
        question=case.question,
        answer_type=case.answer_type,
        answer=f"ERROR: {exc}",
        answer_correctness=1.0,
        retrieved_relevant=False,
        citation_accurate=False,
        said_i_dont_know=False,
        passed=False,
        latency_ms=0.0,
        composite_confidence=0.0,
    )


async def _run_case(case: EvalCase, semaphore: asyncio.Semaphore) -> EvalCaseResult:
    global _progress
    try:
        async with semaphore:
            response = await answer_question(
                AskRequest(question=case.question, verify_citations=True), log_query=False
            )
    except Exception as exc:
        logger.exception("eval_case_failed", extra={"case": case.id})
        _progress = EvalProgress(
            running=True, completed=_progress.completed + 1, total=_progress.total
        )
        return _error_result(case, exc)

    said_idk = response.insufficient_context or IDK_TEXT.lower() in response.answer.lower()
    retrieved_sources = {c.source_document for c in response.retrieved_chunks}
    retrieved_relevant = (
        any(src in retrieved_sources for src in case.expected_sources)
        if case.expected_sources
        else not said_idk
    )
    citation_accurate = (
        all(c.verified for c in response.citations) if response.citations else said_idk
    )

    if case.answer_type == "unanswerable":
        correctness = 5.0 if said_idk else 1.0
        passed = said_idk
    else:
        correctness = await _judge_correctness(case, response.answer)
        passed = correctness >= CORRECTNESS_PASS_THRESHOLD and not said_idk

    _progress = EvalProgress(
        running=True, completed=_progress.completed + 1, total=_progress.total
    )
    return EvalCaseResult(
        case_id=case.id,
        question=case.question,
        answer_type=case.answer_type,
        answer=response.answer,
        answer_correctness=correctness,
        retrieved_relevant=retrieved_relevant,
        citation_accurate=citation_accurate,
        said_i_dont_know=said_idk,
        passed=passed,
        latency_ms=response.latency_ms,
        composite_confidence=response.confidence.composite,
    )


async def run_eval() -> EvalReport:
    global _progress
    if _progress.running:
        raise EvalAlreadyRunningError("An eval run is already in progress")

    cases = load_golden_cases()
    _progress = EvalProgress(running=True, completed=0, total=len(cases))
    started_at = datetime.now(timezone.utc).isoformat()

    try:
        semaphore = asyncio.Semaphore(max(1, settings.eval_concurrency))
        results = await asyncio.gather(*(_run_case(case, semaphore) for case in cases))
    finally:
        _progress = EvalProgress(running=False, completed=0, total=0)

    unanswerable = [r for r in results if r.answer_type == "unanswerable"]
    report = EvalReport(
        run_id=uuid.uuid4().hex[:8],
        started_at=started_at,
        finished_at=datetime.now(timezone.utc).isoformat(),
        total_cases=len(results),
        pass_rate=round(sum(r.passed for r in results) / len(results), 3),
        avg_correctness=round(sum(r.answer_correctness for r in results) / len(results), 2),
        idk_accuracy=round(
            sum(r.said_i_dont_know for r in unanswerable) / len(unanswerable), 3
        )
        if unanswerable
        else 1.0,
        avg_latency_ms=round(sum(r.latency_ms for r in results) / len(results), 1),
        results=list(results),
    )
    registry.append_eval_run(report.model_dump())
    logger.info(
        "eval_completed",
        extra={"run_id": report.run_id, "pass_rate": report.pass_rate},
    )
    return report
