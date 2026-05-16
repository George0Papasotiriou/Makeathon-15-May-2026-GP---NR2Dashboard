"""Shared chart-spec pipeline for the HTTP query route and the voice tool.

Both `/api/query` (synchronous + SSE) and the voice `query_data` tool call
into the same pipeline. The HTTP route keeps full control of its own
response shape; this module exposes a thin adapter that normalizes the
result into a single `PipelineResult` dataclass for non-HTTP callers.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any, Literal

from app.logger import get_logger
from app.models import ChartSpec, QueryRequest
from app.routes.query import _execute_query

log = get_logger("services.chart_pipeline")


@dataclass
class PipelineResult:
    status: Literal["ok", "clarification", "error"]
    spec: ChartSpec | None
    data: list[dict[str, Any]]
    panel_data: list[list[dict[str, Any]]] | None
    explanation: str
    chart_id: str
    clarification_question: str | None
    error: str | None


async def generate_chart_for_question(
    question: str,
    conversation_id: str | None = None,
) -> PipelineResult:
    """Run the full chart-spec pipeline outside the HTTP route.

    Used by the voice tool so a Gemini `query_data` call hits the same
    LLM + SQL validation + execution path as a normal HTTP query.
    """
    request_id = str(uuid.uuid4())
    req = QueryRequest(question=question, conversation_id=conversation_id)

    try:
        resp = await _execute_query(req, request_id)
    except Exception as exc:
        log.exception(
            "Pipeline error",
            extra={"request_id": request_id, "error": str(exc)},
        )
        return PipelineResult(
            status="error",
            spec=None,
            data=[],
            panel_data=None,
            explanation="",
            chart_id="",
            clarification_question=None,
            error=str(exc),
        )

    has_chart = bool(resp.spec.sql) or bool(resp.panel_data)
    if not has_chart:
        return PipelineResult(
            status="clarification",
            spec=resp.spec,
            data=resp.data,
            panel_data=resp.panel_data,
            explanation=resp.explanation,
            chart_id=resp.metadata.chart_id or "",
            clarification_question=resp.clarification_question,
            error=None,
        )

    return PipelineResult(
        status="ok",
        spec=resp.spec,
        data=resp.data,
        panel_data=resp.panel_data,
        explanation=resp.explanation,
        chart_id=resp.metadata.chart_id or "",
        clarification_question=None,
        error=None,
    )
