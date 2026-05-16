"""POST /api/query — natural language to chart spec.

Pipeline:
  1. Call LLM with user question (system prompt cached).
  2. Validate emitted SQL via sqlglot AST + DuckDB EXPLAIN.
  3. Execute SQL on DuckDB.
  4. Return ChartSpec + data + explanation + metadata.

Retry loop: if SQL validation OR execution fails, retry up to MAX_RETRIES
with the previous failed SQL + error fed back to the LLM. If all retries
fail, return a graceful clarification response (no chart_spec, no SQL).
"""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.conversation import Turn, get_store
from app.llm.anthropic_client import call_llm
from app.logger import get_logger
from app.models import (
    ChartConfig,
    ChartSpec,
    QueryMetadata,
    QueryRequest,
    QueryResponse,
    SeriesConfig,
    WidgetPayload,
)
from app.sql.validator import SQLValidationError, validate_and_execute

SSE_CHAR_DELAY_S = 0.012
SSE_CHARS_PER_TICK = 8

log = get_logger("routes.query")
router = APIRouter()

MAX_RETRIES = 3


def _build_chart_spec_from_dict(raw: dict[str, Any]) -> ChartSpec:
    """Coerce the LLM's tool_use input dict into our Pydantic ChartSpec."""
    config_raw = raw.get("config") or {}
    series_raw = config_raw.get("series") or []
    series = [SeriesConfig(**s) for s in series_raw]

    panels_raw = config_raw.get("panels")
    panels = [_build_chart_spec_from_dict(p) for p in panels_raw] if panels_raw else None

    config = ChartConfig(
        xAxisKey=config_raw.get("xAxisKey"),
        series=series,
        panels=panels,
    )
    return ChartSpec(
        chartType=raw["chartType"],
        title=raw["title"],
        description=raw.get("description"),
        config=config,
        sql=raw.get("sql") or "",
    )


def _no_chart_response(
    parsed: dict[str, Any],
    *,
    request_id: str,
    conversation_id: str,
    started: float,
    token_cost: float,
    retries: int,
    question: str | None = None,
    tool_use_id: str | None = None,
    store_turn_for_conversation_id: str | None = None,
) -> QueryResponse:
    """Return a response with no chart (clarification or unanswerable case).

    If store_turn_for_conversation_id + tool_use_id + question are provided,
    also persist the turn so the next LLM call sees the prior context.
    """
    placeholder = ChartSpec(
        chartType="kpi",
        title="",
        config=ChartConfig(series=[]),
        sql="",
    )
    chart_id = str(uuid.uuid4())
    if (
        store_turn_for_conversation_id
        and tool_use_id
        and question is not None
    ):
        get_store().append_turn(
            store_turn_for_conversation_id,
            Turn(
                question=question,
                tool_use_id=tool_use_id,
                tool_input=parsed,
                row_count=0,
                chart_id=chart_id,
                aggregated_results=[],
            ),
        )
    return QueryResponse(
        spec=placeholder,
        data=[],
        explanation=parsed.get("explanation", ""),
        follow_up_hint=parsed.get("follow_up_hint"),
        clarification_question=parsed.get("clarification_question"),
        metadata=QueryMetadata(
            latency_ms=int((time.perf_counter() - started) * 1000),
            token_cost=token_cost,
            sql_retries=retries,
            conversation_id=conversation_id,
            request_id=request_id,
        ),
    )


_MODEL_RATES_USD_PER_M = {
    "claude-opus-4-7": (15.0, 75.0),
    "claude-opus-4-6": (15.0, 75.0),
    "claude-sonnet-4-6": (3.0, 15.0),
    "claude-sonnet-4-5": (3.0, 15.0),
    "claude-haiku-4-5": (1.0, 5.0),
}


def _compute_token_cost(
    input_tokens: int,
    cache_creation: int,
    cache_read: int,
    output_tokens: int,
) -> float:
    """USD cost from per-model rates.
    Cache read = 10% of input. Cache write = 125% of input (5m TTL).
    Unknown model → fall back to Sonnet rates.
    """
    from app.settings import settings

    model = settings.ANTHROPIC_MODEL
    base_in, base_out = _MODEL_RATES_USD_PER_M.get(model, (3.0, 15.0))
    input_rate = base_in / 1_000_000
    output_rate = base_out / 1_000_000
    cache_read_rate = input_rate * 0.10
    cache_write_rate = input_rate * 1.25
    return round(
        input_tokens * input_rate
        + cache_creation * cache_write_rate
        + cache_read * cache_read_rate
        + output_tokens * output_rate,
        6,
    )


async def _execute_query(req: QueryRequest, request_id: str) -> QueryResponse:
    """Full query pipeline shared by /query and /query/stream."""
    started = time.perf_counter()
    conversation_id = req.conversation_id or str(uuid.uuid4())

    store = get_store()
    history = store.get_history(req.conversation_id) if req.conversation_id else []

    log.info(
        "Query received",
        extra={
            "request_id": request_id,
            "conversation_id": conversation_id,
            "question_chars": len(req.question),
            "history_turns": len(history),
        },
    )

    prior_attempts: list[dict[str, str]] = []
    accumulated_cost = 0.0

    for attempt in range(MAX_RETRIES):
        try:
            llm = call_llm(
                req.question,
                request_id=request_id,
                prior_attempts=prior_attempts if prior_attempts else None,
                history=history if history else None,
            )
        except Exception as e:
            log.error(
                "LLM call failed",
                extra={"request_id": request_id, "attempt": attempt + 1, "error": str(e)},
            )
            raise

        accumulated_cost += _compute_token_cost(
            llm.input_tokens,
            llm.cache_creation_tokens,
            llm.cache_read_tokens,
            llm.output_tokens,
        )

        sql_emitted = llm.parsed.get("sql")
        chart_spec_raw = llm.parsed.get("chart_spec") or {}
        is_multi_panel = chart_spec_raw.get("chartType") == "multi-panel"
        panels_raw = (chart_spec_raw.get("config") or {}).get("panels") or []
        widgets_raw = llm.parsed.get("widgets") or []

        # New widgets-array path. Each entry is an independent card.
        # A multi-panel entry still renders as ONE grouped card.
        if widgets_raw:
            widget_payloads: list[WidgetPayload] = []
            failed_widget_idx: int = -1
            failed_widget_sql: str = ""
            failed_widget_error: str | None = None
            total_rows = 0

            for w_idx, w in enumerate(widgets_raw):
                w_spec_raw = w.get("chart_spec") or {}
                w_sql = w.get("sql") or ""
                w_is_multi = w_spec_raw.get("chartType") == "multi-panel"
                w_panels = (w_spec_raw.get("config") or {}).get("panels") or []

                if w_is_multi and w_panels:
                    w_panel_data: list[list[dict[str, Any]]] = []
                    sub_failed = False
                    for p_idx, p in enumerate(w_panels):
                        p_sql = p.get("sql") or ""
                        if not p_sql:
                            failed_widget_error = (
                                f"widget[{w_idx}].panel[{p_idx}] missing sql"
                            )
                            failed_widget_idx = w_idx
                            failed_widget_sql = ""
                            sub_failed = True
                            break
                        try:
                            p_exec = validate_and_execute(p_sql, request_id=request_id)
                        except SQLValidationError as e:
                            failed_widget_error = (
                                f"widget[{w_idx}].panel[{p_idx}]: {e}"
                            )
                            failed_widget_idx = w_idx
                            failed_widget_sql = p_sql
                            sub_failed = True
                            break
                        w_panel_data.append(p_exec.rows)
                        total_rows += p_exec.row_count
                    if sub_failed:
                        break
                    spec = _build_chart_spec_from_dict({**w_spec_raw, "sql": ""})
                    widget_payloads.append(
                        WidgetPayload(
                            chart_id=str(uuid.uuid4()),
                            spec=spec,
                            data=[],
                            panel_data=w_panel_data,
                        )
                    )
                else:
                    if not w_sql:
                        failed_widget_error = f"widget[{w_idx}] missing sql"
                        failed_widget_idx = w_idx
                        failed_widget_sql = ""
                        break
                    try:
                        w_exec = validate_and_execute(w_sql, request_id=request_id)
                    except SQLValidationError as e:
                        failed_widget_error = f"widget[{w_idx}]: {e}"
                        failed_widget_idx = w_idx
                        failed_widget_sql = w_sql
                        break
                    spec = _build_chart_spec_from_dict({**w_spec_raw, "sql": w_sql})
                    widget_payloads.append(
                        WidgetPayload(
                            chart_id=str(uuid.uuid4()),
                            spec=spec,
                            data=w_exec.rows,
                            panel_data=None,
                        )
                    )
                    total_rows += w_exec.row_count

            if failed_widget_error is not None:
                log.warning(
                    "Widgets-array SQL attempt failed",
                    extra={
                        "request_id": request_id,
                        "attempt": attempt + 1,
                        "error": failed_widget_error,
                        "failed_widget_idx": failed_widget_idx,
                        "widget_count": len(widgets_raw),
                    },
                )
                prior_attempts.append(
                    {
                        "sql": failed_widget_sql,
                        "error": (
                            f"Only widget[{failed_widget_idx}] of "
                            f"{len(widgets_raw)} failed; keep the other "
                            f"widgets unchanged. {failed_widget_error}"
                        ),
                    },
                )
                continue

            first = widget_payloads[0]
            if req.conversation_id and llm.tool_use_id:
                first_rows = (
                    first.panel_data[0]
                    if first.panel_data
                    else first.data
                )
                store.append_turn(
                    req.conversation_id,
                    Turn(
                        question=req.question,
                        tool_use_id=llm.tool_use_id,
                        tool_input=llm.parsed,
                        row_count=total_rows,
                        chart_id=first.chart_id,
                        aggregated_results=first_rows[:100],
                    ),
                )
            log.info(
                "Widgets-array query completed",
                extra={
                    "request_id": request_id,
                    "attempts": attempt + 1,
                    "widget_count": len(widget_payloads),
                    "total_rows": total_rows,
                    "total_cost_usd": accumulated_cost,
                    "latency_ms": int((time.perf_counter() - started) * 1000),
                },
            )
            return QueryResponse(
                spec=first.spec,
                data=first.data,
                panel_data=first.panel_data,
                widgets=widget_payloads,
                explanation=llm.parsed.get("explanation", ""),
                follow_up_hint=llm.parsed.get("follow_up_hint"),
                clarification_question=llm.parsed.get("clarification_question"),
                metadata=QueryMetadata(
                    latency_ms=int((time.perf_counter() - started) * 1000),
                    token_cost=accumulated_cost,
                    sql_retries=attempt,
                    conversation_id=conversation_id,
                    request_id=request_id,
                    chart_id=first.chart_id,
                ),
            )

        # Multi-panel: ignore top-level sql, execute each sub-panel's sql.
        if is_multi_panel and panels_raw:
            panel_data: list[list[dict[str, Any]]] = []
            panel_sqls: list[str] = []
            failed_panel_error: str | None = None
            failed_panel_sql: str = ""
            failed_panel_idx: int = -1
            total_rows = 0
            for idx, p in enumerate(panels_raw):
                p_sql = p.get("sql") or ""
                panel_sqls.append(p_sql)
                if not p_sql:
                    failed_panel_error = f"panel[{idx}] missing sql"
                    failed_panel_sql = ""
                    failed_panel_idx = idx
                    break
                try:
                    p_exec = validate_and_execute(p_sql, request_id=request_id)
                except SQLValidationError as e:
                    failed_panel_error = f"panel[{idx}]: {e}"
                    failed_panel_sql = p_sql
                    failed_panel_idx = idx
                    break
                panel_data.append(p_exec.rows)
                total_rows += p_exec.row_count

            if failed_panel_error is not None:
                log.warning(
                    "Multi-panel SQL attempt failed",
                    extra={
                        "request_id": request_id,
                        "attempt": attempt + 1,
                        "error": failed_panel_error,
                        "failed_panel_idx": failed_panel_idx,
                        "panel_count": len(panels_raw),
                    },
                )
                prior_attempts.append(
                    {
                        "sql": failed_panel_sql,
                        "error": (
                            f"Only panel[{failed_panel_idx}] of {len(panels_raw)} "
                            f"failed; keep the other panels unchanged. {failed_panel_error}"
                        ),
                    },
                )
                continue

            spec = _build_chart_spec_from_dict({**chart_spec_raw, "sql": ""})
            chart_id = str(uuid.uuid4())
            if req.conversation_id and llm.tool_use_id:
                first_panel_rows = panel_data[0] if panel_data else []
                store.append_turn(
                    req.conversation_id,
                    Turn(
                        question=req.question,
                        tool_use_id=llm.tool_use_id,
                        tool_input=llm.parsed,
                        row_count=total_rows,
                        chart_id=chart_id,
                        aggregated_results=first_panel_rows[:100],
                    ),
                )
            log.info(
                "Multi-panel query completed",
                extra={
                    "request_id": request_id,
                    "attempts": attempt + 1,
                    "panel_count": len(panel_data),
                    "total_rows": total_rows,
                    "total_cost_usd": accumulated_cost,
                    "latency_ms": int((time.perf_counter() - started) * 1000),
                },
            )
            return QueryResponse(
                spec=spec,
                data=[],
                panel_data=panel_data,
                explanation=llm.parsed.get("explanation", ""),
                follow_up_hint=llm.parsed.get("follow_up_hint"),
                clarification_question=llm.parsed.get("clarification_question"),
                metadata=QueryMetadata(
                    latency_ms=int((time.perf_counter() - started) * 1000),
                    token_cost=accumulated_cost,
                    sql_retries=attempt,
                    conversation_id=conversation_id,
                    request_id=request_id,
                    chart_id=chart_id,
                ),
            )

        if not sql_emitted:
            log.info(
                "LLM declined to emit SQL (clarification or unanswerable)",
                extra={
                    "request_id": request_id,
                    "has_clarification": bool(llm.parsed.get("clarification_question")),
                },
            )
            return _no_chart_response(
                llm.parsed,
                request_id=request_id,
                conversation_id=conversation_id,
                started=started,
                token_cost=accumulated_cost,
                retries=attempt,
                question=req.question,
                tool_use_id=llm.tool_use_id,
                store_turn_for_conversation_id=req.conversation_id,
            )

        try:
            exec_result = validate_and_execute(sql_emitted, request_id=request_id)
        except SQLValidationError as e:
            log.warning(
                "SQL attempt failed",
                extra={
                    "request_id": request_id,
                    "attempt": attempt + 1,
                    "error": str(e),
                },
            )
            prior_attempts.append({"sql": sql_emitted, "error": str(e)})
            continue

        spec = _build_chart_spec_from_dict({**chart_spec_raw, "sql": sql_emitted})

        # Mint a stable chart_id for this turn so the frontend can refer
        # back to it (e.g., when generating an editorial). Persist the
        # turn only on real success — clarification paths and zero-row
        # executions don't pollute future-turn context.
        chart_id = str(uuid.uuid4())
        if req.conversation_id and llm.tool_use_id:
            store.append_turn(
                req.conversation_id,
                Turn(
                    question=req.question,
                    tool_use_id=llm.tool_use_id,
                    tool_input=llm.parsed,
                    row_count=exec_result.row_count,
                    chart_id=chart_id,
                    aggregated_results=exec_result.rows[:100],
                ),
            )
            log.debug(
                "Turn appended",
                extra={
                    "request_id": request_id,
                    "conversation_id": req.conversation_id,
                    "turn_index": len(history),
                    "chart_id": chart_id,
                },
            )

        log.info(
            "Query completed successfully",
            extra={
                "request_id": request_id,
                "attempts": attempt + 1,
                "row_count": exec_result.row_count,
                "total_cost_usd": accumulated_cost,
                "latency_ms": int((time.perf_counter() - started) * 1000),
                "history_turns_used": len(history),
            },
        )

        return QueryResponse(
            spec=spec,
            data=exec_result.rows,
            explanation=llm.parsed.get("explanation", ""),
            follow_up_hint=llm.parsed.get("follow_up_hint"),
            clarification_question=llm.parsed.get("clarification_question"),
            metadata=QueryMetadata(
                latency_ms=int((time.perf_counter() - started) * 1000),
                token_cost=accumulated_cost,
                sql_retries=attempt,
                conversation_id=conversation_id,
                request_id=request_id,
                chart_id=chart_id,
            ),
        )

    log.error(
        "Query exhausted retries",
        extra={
            "request_id": request_id,
            "attempts": MAX_RETRIES,
            "last_errors": [a["error"] for a in prior_attempts],
        },
    )

    return _no_chart_response(
        {
            "explanation": (
                "I couldn't generate a working SQL query for that question. "
                "Could you rephrase or be more specific about the timeframe or dimension?"
            ),
            "clarification_question": (
                "Could you rephrase the question — perhaps specifying the "
                "timeframe (e.g., last 30 days) or the dimension (e.g., by intent, by region)?"
            ),
        },
        request_id=request_id,
        conversation_id=conversation_id,
        started=started,
        token_cost=accumulated_cost,
        retries=MAX_RETRIES,
    )


@router.post("/query", response_model=QueryResponse)
async def query(req: QueryRequest, request: Request) -> QueryResponse:
    request_id: str = request.state.request_id
    return await _execute_query(req, request_id)


def _sse(event: str, payload: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload)}\n\n"


async def _query_event_stream(
    req: QueryRequest, request_id: str
) -> AsyncIterator[str]:
    """SSE event sequence:
      start → (LLM + retries silently) → sql_start → sql×N → sql_end → done
      OR  start → done (clarification / retries exhausted, no SQL)
      OR  start → error (unexpected exception)
    """
    yield _sse("start", {"question": req.question})

    try:
        response = await _execute_query(req, request_id)
    except Exception as e:  # noqa: BLE001
        log.exception(
            "Stream pipeline raised",
            extra={"request_id": request_id, "error": str(e)},
        )
        yield _sse("error", {"error": str(e)})
        return

    if response.widgets:
        for idx, w in enumerate(response.widgets):
            if w.spec.chartType == "multi-panel" and w.spec.config.panels:
                wsql = "\n\n-- next panel --\n\n".join(
                    p.sql for p in w.spec.config.panels if p.sql
                )
            else:
                wsql = w.spec.sql
            if not wsql:
                continue
            yield _sse(
                "sql_start",
                {"widget_index": idx, "widget_id": w.chart_id},
            )
            for i in range(0, len(wsql), SSE_CHARS_PER_TICK):
                chunk = wsql[i : i + SSE_CHARS_PER_TICK]
                yield _sse("sql", {"widget_index": idx, "ch": chunk})
                await asyncio.sleep(SSE_CHAR_DELAY_S)
            yield _sse("sql_end", {"widget_index": idx})
    else:
        if response.spec.chartType == "multi-panel" and response.spec.config.panels:
            sql = "\n\n-- next panel --\n\n".join(
                p.sql for p in response.spec.config.panels if p.sql
            )
        else:
            sql = response.spec.sql
        if sql:
            yield _sse(
                "sql_start",
                {
                    "widget_index": 0,
                    "widget_id": response.metadata.chart_id or "",
                },
            )
            for i in range(0, len(sql), SSE_CHARS_PER_TICK):
                chunk = sql[i : i + SSE_CHARS_PER_TICK]
                yield _sse("sql", {"widget_index": 0, "ch": chunk})
                await asyncio.sleep(SSE_CHAR_DELAY_S)
            yield _sse("sql_end", {"widget_index": 0})

    yield _sse("done", response.model_dump(mode="json"))


@router.post("/query/stream")
async def query_stream(req: QueryRequest, request: Request) -> StreamingResponse:
    request_id: str = request.state.request_id
    return StreamingResponse(
        _query_event_stream(req, request_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/conversations/{conversation_id}/reset")
async def reset_conversation(conversation_id: str, request: Request) -> dict[str, str]:
    """Drop a conversation's history. Idempotent: silently succeeds if absent."""
    request_id: str = getattr(request.state, "request_id", "unknown")
    get_store().reset(conversation_id)
    log.info(
        "Conversation reset via API",
        extra={"request_id": request_id, "conversation_id": conversation_id},
    )
    return {"status": "reset", "conversation_id": conversation_id}
