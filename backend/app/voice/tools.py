"""Voice tool definitions + executor.

Gemini Live has exactly ONE tool: `query_data`. When the model calls it,
we run the chart-spec pipeline (same as /api/query) and push the chart
to the browser over the voice WebSocket. Gemini receives a short text
confirmation which it speaks back to the user.
"""

from __future__ import annotations

from typing import Any

from fastapi import WebSocket
from fastapi.encoders import jsonable_encoder
from google.genai.types import FunctionDeclaration

from app.logger import get_logger
from app.services.chart_pipeline import generate_chart_for_question

log = get_logger("voice.tools")


QUERY_DATA_TOOL = FunctionDeclaration(
    name="query_data",
    description=(
        "Run an analytics query against the voicebot dataset. "
        "The chart appears on the user's canvas automatically. "
        "Reply verbally with one or two sentences — the headline finding only."
    ),
    parameters={
        "type": "object",
        "properties": {
            "question": {
                "type": "string",
                "description": "The user's question, verbatim, in their language.",
            },
        },
        "required": ["question"],
    },
)


def _short_verbal_confirmation(chart_type: str, explanation: str) -> str:
    """Compact text Gemini will speak after a successful tool call."""
    base = explanation.strip() if explanation else ""
    if not base:
        return f"Showing a {chart_type} chart now."
    return base


async def execute_query_data(
    question: str,
    conversation_id: str,
    ws: WebSocket,
    session_id: str,
    context_prefix: str = "",
) -> dict[str, Any]:
    """Run the pipeline and push the chart to the browser. Returns text for Gemini.

    `session_id` is threaded into every log line so a single voice session's
    flow can be reconstructed from logs. `context_prefix` is the
    canvas-selection context block built by the browser; it is prepended
    to the question verbatim so Claude sees the same prompt the HTTP
    route would produce.
    """
    full_question = f"{context_prefix}{question}" if context_prefix else question
    log.info(
        "query_data invoked",
        extra={
            "session_id": session_id,
            "conversation_id": conversation_id,
            "question_chars": len(question),
            "context_chars": len(context_prefix),
        },
    )

    result = await generate_chart_for_question(
        full_question,
        conversation_id=conversation_id,
    )

    if result.status == "error":
        log.warning(
            "query_data pipeline error",
            extra={
                "session_id": session_id,
                "conversation_id": conversation_id,
                "error": result.error,
            },
        )
        return {
            "error": result.error or "Internal analytics error.",
            "message": "I couldn't run that query. Could you rephrase?",
        }

    if result.status == "clarification":
        log.info(
            "query_data clarification",
            extra={
                "session_id": session_id,
                "conversation_id": conversation_id,
                "has_clarification": bool(result.clarification_question),
            },
        )
        # Pipeline returned a clarification — pass the question back to Gemini
        # so it can ask the user verbally instead of pushing an empty chart.
        return {
            "needs_clarification": True,
            "message": (
                result.clarification_question
                or result.explanation
                or "I need a bit more detail to answer that."
            ),
        }

    # Success — push chart spec + data to the browser. DuckDB rows may
    # contain datetime / Decimal / etc.; jsonable_encoder coerces them.
    payload = jsonable_encoder({
        "type": "chart_ready",
        "chart_id": result.chart_id,
        "chart_spec": result.spec.model_dump(),
        "data": result.data,
        "panel_data": result.panel_data,
        "explanation": result.explanation,
    })
    await ws.send_json(payload)

    log.info(
        "query_data chart pushed",
        extra={
            "session_id": session_id,
            "conversation_id": conversation_id,
            "chart_id": result.chart_id,
            "chart_type": result.spec.chartType,
            "rows": len(result.data),
            "panels": len(result.panel_data) if result.panel_data else 0,
        },
    )

    return {
        "ok": True,
        "chart_type": result.spec.chartType,
        "message": _short_verbal_confirmation(result.spec.chartType, result.explanation),
    }
