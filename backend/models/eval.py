"""Models for the golden Q&A evaluation suite."""

from typing import Literal

from pydantic import BaseModel, Field

AnswerType = Literal["lookup", "multi_hop", "unanswerable", "ambiguous"]


class EvalCase(BaseModel):
    id: str
    question: str
    expected_answer: str
    answer_type: AnswerType
    expected_sources: list[str] = Field(default_factory=list)


class EvalCaseResult(BaseModel):
    case_id: str
    question: str
    answer_type: AnswerType
    answer: str
    answer_correctness: float = Field(description="LLM-as-judge 1-5")
    retrieved_relevant: bool
    citation_accurate: bool
    said_i_dont_know: bool
    passed: bool
    latency_ms: float
    composite_confidence: float


class EvalReport(BaseModel):
    run_id: str
    started_at: str
    finished_at: str
    total_cases: int
    pass_rate: float
    avg_correctness: float
    idk_accuracy: float = Field(description="Fraction of unanswerable cases correctly refused")
    avg_latency_ms: float
    results: list[EvalCaseResult]


class EvalRunSummary(BaseModel):
    run_id: str
    started_at: str
    pass_rate: float
    avg_correctness: float
    idk_accuracy: float
    avg_latency_ms: float
    total_cases: int


class EvalProgress(BaseModel):
    running: bool
    completed: int
    total: int
