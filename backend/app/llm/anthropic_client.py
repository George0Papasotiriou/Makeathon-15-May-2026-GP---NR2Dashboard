"""Anthropic Claude Opus 4.7 client with prompt caching and tool-use forced choice."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from anthropic import Anthropic
from anthropic.types import Message, ToolUseBlock

from app.conversation import Turn
from app.logger import get_logger
from app.settings import settings

log = get_logger("llm.anthropic")

# Tool schema mirrors the QueryResponse contract. The frontend Zod schema
# validates the same shape; this is the authoritative server-side definition.
EMIT_CHART_SPEC_TOOL: dict[str, Any] = {
    "name": "emit_chart_spec",
    "description": (
        "Emit one or more SQL queries and chart specifications for the user's "
        "analytical question. Always called exactly once per turn. Prefer the "
        "`widgets` array — emit one entry per independent card. Use a single "
        "entry with chartType='multi-panel' when several sub-views belong "
        "inside ONE cohesive card."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "sql": {
                "type": ["string", "null"],
                "description": (
                    "LEGACY single-chart shortcut. Prefer `widgets`. "
                    "DuckDB SELECT or WITH statement. Null when the query is "
                    "ambiguous (use clarification_question) or unanswerable."
                ),
            },
            "chart_spec": {
                "type": ["object", "null"],
                "description": "LEGACY single-chart shortcut. Prefer `widgets`.",
                "properties": {
                    "chartType": {
                        "type": "string",
                        "enum": [
                            "bar",
                            "bar-stacked",
                            "horizontal-bar",
                            "line",
                            "area",
                            "area-stacked",
                            "combo",
                            "pie",
                            "treemap",
                            "kpi",
                            "sparkline-kpi",
                            "gauge",
                            "histogram",
                            "box-plot",
                            "heatmap",
                            "funnel",
                            "radar",
                            "waterfall",
                            "table",
                            "multi-panel",
                        ],
                    },
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                    "config": {
                        "type": "object",
                        "properties": {
                            "xAxisKey": {"type": "string"},
                            "series": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "dataKey": {"type": "string"},
                                        "label": {"type": "string"},
                                        "format": {
                                            "type": "string",
                                            "enum": [
                                                "currency",
                                                "percentage",
                                                "number",
                                                "duration",
                                                "datetime",
                                            ],
                                        },
                                        "yAxisId": {
                                            "type": "string",
                                            "enum": ["left", "right"],
                                            "description": "combo only — which Y axis this series binds to. Default left.",
                                        },
                                        "chartKind": {
                                            "type": "string",
                                            "enum": ["bar", "line", "area"],
                                            "description": "combo only — per-series renderer choice. Default bar.",
                                        },
                                        "quartile": {
                                            "type": "string",
                                            "enum": ["min", "q1", "median", "q3", "max"],
                                            "description": "box-plot only — marks this series as one of the five quartile columns.",
                                        },
                                    },
                                    "required": ["dataKey", "label"],
                                },
                            },
                            "yAxisKey": {
                                "type": "string",
                                "description": "scatter, heatmap — column for the Y dimension.",
                            },
                            "valueKey": {
                                "type": "string",
                                "description": "heatmap (cell value), gauge (metric), treemap (tile size). Defaults to series[0].dataKey.",
                            },
                            "target": {
                                "type": "number",
                                "description": "gauge — target / SLA threshold tick.",
                            },
                            "max": {
                                "type": "number",
                                "description": "gauge upper bound; histogram explicit domain top.",
                            },
                            "panels": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "chartType": {"type": "string"},
                                        "title": {"type": "string"},
                                        "description": {"type": "string"},
                                        "sql": {
                                            "type": "string",
                                            "description": (
                                                "DuckDB SELECT statement for this sub-panel. "
                                                "REQUIRED for every panel. Each panel runs its "
                                                "own query — they do NOT share data."
                                            ),
                                        },
                                        "config": {"type": "object"},
                                    },
                                    "required": ["chartType", "title", "sql", "config"],
                                },
                                "description": (
                                    "Only for chartType: multi-panel. "
                                    "Array of nested chart_spec objects. Each panel "
                                    "MUST include its own `sql` field — the panel "
                                    "queries are executed independently and results "
                                    "are NOT shared across panels."
                                ),
                            },
                        },
                        "required": ["series"],
                    },
                },
                "required": ["chartType", "title", "config"],
            },
            "widgets": {
                "type": "array",
                "description": (
                    "PREFERRED FIELD. One entry per independent card to "
                    "render on the canvas. Use 1 entry for a single chart; "
                    "use N entries when the user wants N separate cards; "
                    "use a single entry whose chartType is 'multi-panel' "
                    "when sub-views genuinely belong together in ONE card. "
                    "When this field is present and non-empty, the legacy "
                    "top-level `sql`/`chart_spec` fields are ignored."
                ),
                "items": {
                    "type": "object",
                    "properties": {
                        "sql": {
                            "type": "string",
                            "description": (
                                "DuckDB SELECT or WITH statement for this card."
                            ),
                        },
                        "chart_spec": {
                            "type": "object",
                            "description": "Chart specification for this card.",
                        },
                    },
                    "required": ["sql", "chart_spec"],
                },
            },
            "explanation": {
                "type": "string",
                "description": (
                    "1 short sentence answering the user, in their language (Greek or English)."
                ),
            },
            "follow_up_hint": {
                "type": "string",
                "description": "Optional. Natural-language hint for a useful next question.",
            },
            "clarification_question": {
                "type": "string",
                "description": "Optional. Only when the query is genuinely ambiguous.",
            },
        },
        "required": ["explanation"],
    },
}


EMIT_EDITORIAL_TOOL: dict[str, Any] = {
    "name": "emit_editorial",
    "description": (
        "Emit the editorial document for a multi-chart briefing. "
        "Always called exactly once per editorial request."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "title": {"type": "string", "description": "Editorial headline, max 8 words"},
            "dek": {
                "type": "string",
                "description": "Standfirst, 1-2 sentences, max 240 chars",
            },
            "kicker": {
                "type": "string",
                "description": "IBM Plex Mono uppercase top line",
            },
            "sections": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "number": {"type": "integer"},
                        "chart_id": {"type": "string"},
                        "section_kicker": {"type": "string"},
                        "headline": {
                            "type": "string",
                            "description": "Editorial title, max 9 words",
                        },
                        "kpi_value": {"type": "string"},
                        "kpi_label": {"type": "string"},
                        "lede": {
                            "type": "string",
                            "description": "2-3 sentences, max 280 chars",
                        },
                        "body": {
                            "type": "string",
                            "description": "3-5 sentences, max 520 chars",
                        },
                        "insight": {
                            "type": "string",
                            "description": "1-2 sentences, max 200 chars",
                        },
                    },
                    "required": [
                        "number",
                        "chart_id",
                        "section_kicker",
                        "headline",
                        "kpi_value",
                        "kpi_label",
                        "lede",
                        "body",
                        "insight",
                    ],
                },
            },
            "methodology_note": {"type": "string"},
            "colophon_stamp": {"type": "string"},
        },
        "required": [
            "title",
            "dek",
            "kicker",
            "sections",
            "methodology_note",
            "colophon_stamp",
        ],
    },
}


@dataclass
class LLMResult:
    parsed: dict[str, Any]
    tool_use_id: str
    input_tokens: int
    cache_creation_tokens: int
    cache_read_tokens: int
    output_tokens: int
    stop_reason: str
    raw_response: Message


_client: Anthropic | None = None
_system_prompt: str | None = None
_editorial_prompt: str | None = None


def get_client() -> Anthropic:
    global _client
    if _client is None:
        if not settings.ANTHROPIC_API_KEY:
            raise RuntimeError("ANTHROPIC_API_KEY is empty. Set it in backend/.env before running.")
        _client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        log.info("Anthropic client initialized", extra={"model": settings.ANTHROPIC_MODEL})
    return _client


def get_system_prompt() -> str:
    global _system_prompt
    if _system_prompt is None:
        path = Path(settings.SYSTEM_PROMPT_PATH)
        if not path.exists():
            raise FileNotFoundError(f"System prompt not found at {path}")
        _system_prompt = path.read_text(encoding="utf-8")
        log.info(
            "System prompt loaded",
            extra={"path": str(path), "char_len": len(_system_prompt)},
        )
    return _system_prompt


def get_editorial_prompt() -> str:
    global _editorial_prompt
    if _editorial_prompt is None:
        path = Path(settings.EDITORIAL_PROMPT_PATH)
        if not path.exists():
            raise FileNotFoundError(f"Editorial prompt not found at {path}")
        _editorial_prompt = path.read_text(encoding="utf-8")
        log.info(
            "Editorial prompt loaded",
            extra={"path": str(path), "char_len": len(_editorial_prompt)},
        )
    return _editorial_prompt


def _format_retry_notes(prior_attempts: list[dict[str, str]]) -> str:
    return (
        "\n\nPrior attempts on this question failed:\n"
        + "\n".join(
            f"  Attempt {i + 1}:\n    SQL: {a['sql']}\n    Error: {a['error']}"
            for i, a in enumerate(prior_attempts)
        )
        + "\n\nFix the SQL based on the error above. "
        "Keep the same chart_spec shape unless the error is structural."
    )


def _build_messages(
    user_question: str,
    history: list[Turn] | None,
    prior_attempts: list[dict[str, str]] | None,
) -> list[dict[str, Any]]:
    """Build the messages array, including conversation history if any.

    Anthropic format: every assistant tool_use must be paired with a user
    tool_result before the next user message. We synthesize the tool_results
    (generic "ok, N rows") because raw rows never reach the LLM.
    """
    effective_question = user_question
    if prior_attempts:
        effective_question = f"{user_question}{_format_retry_notes(prior_attempts)}"

    messages: list[dict[str, Any]] = []

    if not history:
        messages.append({"role": "user", "content": effective_question})
        return messages

    for i, turn in enumerate(history):
        if i == 0:
            messages.append({"role": "user", "content": turn.question})

        messages.append(
            {
                "role": "assistant",
                "content": [
                    {
                        "type": "tool_use",
                        "id": turn.tool_use_id,
                        "name": "emit_chart_spec",
                        "input": turn.tool_input,
                    }
                ],
            }
        )

        is_last = i == len(history) - 1
        next_q = effective_question if is_last else history[i + 1].question

        if turn.row_count > 0:
            tool_result_text = (
                f"Executed successfully. {turn.row_count} rows returned."
            )
        elif turn.tool_input.get("clarification_question"):
            tool_result_text = (
                "User was asked for clarification; awaiting their reply."
            )
        elif not turn.tool_input.get("sql"):
            tool_result_text = "No SQL emitted (unanswerable or out of scope)."
        else:
            tool_result_text = "Executed successfully. 0 rows returned."

        messages.append(
            {
                "role": "user",
                "content": [
                    {
                        "type": "tool_result",
                        "tool_use_id": turn.tool_use_id,
                        "content": tool_result_text,
                    },
                    {"type": "text", "text": next_q},
                ],
            }
        )

    return messages


def call_llm(
    user_question: str,
    *,
    request_id: str,
    prior_attempts: list[dict[str, str]] | None = None,
    history: list[Turn] | None = None,
) -> LLMResult:
    """Single LLM call. Forces emit_chart_spec tool. Caches system prompt.

    prior_attempts feeds the SQL retry loop. history threads a prior
    conversation through Anthropic's tool_use/tool_result protocol so the
    model can refine ("switch to line chart", "now compare by region").
    """
    client = get_client()
    system_prompt = get_system_prompt()

    messages = _build_messages(user_question, history, prior_attempts)

    log.info(
        "LLM call starting",
        extra={
            "request_id": request_id,
            "model": settings.ANTHROPIC_MODEL,
            "retry_attempt": len(prior_attempts) if prior_attempts else 0,
            "history_turns": len(history) if history else 0,
            "message_count": len(messages),
        },
    )

    # NOTE: do NOT set temperature/top_p/top_k — Opus 4.7 returns 400.
    # mypy: SDK uses strict TypedDicts for tools/system/messages; dict literals
    # are runtime-correct but don't match nominally. Narrow ignore.
    response = client.messages.create(  # type: ignore[call-overload]
        model=settings.ANTHROPIC_MODEL,
        max_tokens=8192,
        system=[
            {
                "type": "text",
                "text": system_prompt,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        tools=[EMIT_CHART_SPEC_TOOL],
        tool_choice={"type": "tool", "name": "emit_chart_spec"},
        messages=messages,
    )

    tool_blocks = [b for b in response.content if isinstance(b, ToolUseBlock)]
    if not tool_blocks:
        raise RuntimeError(
            f"Expected forced tool_use, got none. stop_reason={response.stop_reason}"
        )
    tool_block = tool_blocks[0]
    parsed: dict[str, Any] = dict(tool_block.input)

    usage = response.usage
    result = LLMResult(
        parsed=parsed,
        tool_use_id=tool_block.id,
        input_tokens=usage.input_tokens,
        cache_creation_tokens=getattr(usage, "cache_creation_input_tokens", 0) or 0,
        cache_read_tokens=getattr(usage, "cache_read_input_tokens", 0) or 0,
        output_tokens=usage.output_tokens,
        stop_reason=response.stop_reason or "unknown",
        raw_response=response,
    )

    log.info(
        "LLM call completed",
        extra={
            "request_id": request_id,
            "input_tokens": result.input_tokens,
            "cache_creation_tokens": result.cache_creation_tokens,
            "cache_read_tokens": result.cache_read_tokens,
            "output_tokens": result.output_tokens,
            "stop_reason": result.stop_reason,
        },
    )

    return result


def call_editorial_llm(
    context: dict[str, Any],
    *,
    request_id: str,
) -> LLMResult:
    """Single LLM call for the editorial route. Forces emit_editorial.

    Uses a separate cached system prompt (smartrep_editorial.txt). The
    user message is a JSON-stringified context block describing every
    chart from the conversation.
    """
    import json

    client = get_client()
    editorial_prompt = get_editorial_prompt()
    # `default=str` coerces date / datetime / Decimal / other non-JSON
    # types from DuckDB into ISO-8601 strings instead of raising.
    content = json.dumps(context, ensure_ascii=False, default=str)

    log.info(
        "Editorial LLM call starting",
        extra={
            "request_id": request_id,
            "model": settings.ANTHROPIC_MODEL,
            "chart_count": len(context.get("charts", [])),
            "user_language": context.get("user_language"),
            "user_content_chars": len(content),
        },
    )

    response = client.messages.create(  # type: ignore[call-overload]
        model=settings.ANTHROPIC_MODEL,
        max_tokens=4096,
        system=[
            {
                "type": "text",
                "text": editorial_prompt,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        tools=[EMIT_EDITORIAL_TOOL],
        tool_choice={"type": "tool", "name": "emit_editorial"},
        messages=[{"role": "user", "content": content}],
    )

    tool_blocks = [b for b in response.content if isinstance(b, ToolUseBlock)]
    if not tool_blocks:
        raise RuntimeError(
            f"Expected forced tool_use, got none. stop_reason={response.stop_reason}"
        )
    tool_block = tool_blocks[0]
    parsed: dict[str, Any] = dict(tool_block.input)

    usage = response.usage
    result = LLMResult(
        parsed=parsed,
        tool_use_id=tool_block.id,
        input_tokens=usage.input_tokens,
        cache_creation_tokens=getattr(usage, "cache_creation_input_tokens", 0) or 0,
        cache_read_tokens=getattr(usage, "cache_read_input_tokens", 0) or 0,
        output_tokens=usage.output_tokens,
        stop_reason=response.stop_reason or "unknown",
        raw_response=response,
    )

    log.info(
        "Editorial LLM call completed",
        extra={
            "request_id": request_id,
            "input_tokens": result.input_tokens,
            "cache_creation_tokens": result.cache_creation_tokens,
            "cache_read_tokens": result.cache_read_tokens,
            "output_tokens": result.output_tokens,
            "stop_reason": result.stop_reason,
        },
    )

    return result
