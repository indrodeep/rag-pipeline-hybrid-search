"""POST /v1/eval/run, GET /v1/eval/results, GET /v1/eval/progress."""

from fastapi import APIRouter, Depends

from models.documents import ErrorResponse
from models.eval import EvalProgress, EvalReport, EvalRunSummary
from services import registry
from services.evaluator import get_progress, run_eval
from services.rate_limit import require_admin

router = APIRouter(prefix="/v1/eval", tags=["eval"])


@router.post(
    "/run",
    response_model=EvalReport,
    responses={403: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
    dependencies=[Depends(require_admin)],
)
async def run() -> EvalReport:
    """Run the bundled golden Q&A suite against the current index. Takes a few minutes."""
    return await run_eval()


@router.get("/progress", response_model=EvalProgress)
async def progress() -> EvalProgress:
    """Poll while a run is in flight to drive a progress bar."""
    return get_progress()


@router.get("/results", response_model=list[EvalRunSummary])
async def results() -> list[EvalRunSummary]:
    """Summaries of all past runs, oldest first — powers the trend chart."""
    return [EvalRunSummary.model_validate(run) for run in registry.read_eval_runs()]


@router.get("/results/{run_id}", response_model=EvalReport, responses={404: {"model": ErrorResponse}})
async def result_detail(run_id: str) -> EvalReport:
    """Full per-question results for one run."""
    from exceptions import DocumentNotFoundError

    for run in registry.read_eval_runs():
        if run.get("run_id") == run_id:
            return EvalReport.model_validate(run)
    raise DocumentNotFoundError(f"No eval run with id '{run_id}'")
