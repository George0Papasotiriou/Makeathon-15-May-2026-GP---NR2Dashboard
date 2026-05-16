"""In-memory conversation store. Maps conversation_id → ordered turns.

Each turn captures the user question, the LLM's emitted spec input
(the raw tool_use.input dict, NOT the executed results), the tool_use_id
returned by Anthropic, the row count from execution, AND a snapshot of
the aggregated result rows (capped, PII-stripped). The aggregated rows
are stored ONLY for the editorial route (POST /api/editorial) — they
are NEVER fed back into the voicebot /query LLM call.

Why store the tool_use input instead of just the SQL/spec:
We need to replay the conversation to Claude in subsequent turns.
Anthropic requires that every assistant tool_use block be paired with
a user tool_result block before the next user message. We synthesize
a generic tool_result ("ok, N rows") because Claude only needs to know
the call succeeded — it doesn't need the actual data rows.

In-memory storage: a single dict in process memory. Resets on backend
restart. TTL on idle conversations: 30 min. Max turns per conversation:
10 (oldest evicted FIFO).
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from threading import Lock
from typing import Any

from app.logger import get_logger

log = get_logger("conversation")

MAX_TURNS_PER_CONVERSATION = 10
CONVERSATION_TTL_SECONDS = 30 * 60  # 30 minutes
EDITORIAL_ROW_CAP = 100

# Columns that may surface in aggregated_results but must NEVER be fed
# to the editorial LLM. PII-strip on lowered name; conversation_id is
# matched as an exact lowercase token.
_PII_COLUMNS = frozenset(
    {
        "user_id",
        "from_number",
        "message",
        "transcript_summary",
        "conversation_id",
    }
)

# Greek script detection — at least one character in the Greek Unicode
# block is a strong signal that the question was authored in Greek.
_GREEK_PATTERN = re.compile(r"[Ͱ-Ͽἀ-῿]")


@dataclass
class Turn:
    question: str
    tool_use_id: str
    tool_input: dict[str, Any]
    row_count: int
    chart_id: str
    aggregated_results: list[dict[str, Any]] = field(default_factory=list)
    timestamp: float = field(default_factory=time.monotonic)
    # Wall-clock timestamp for editorial session_started_at reporting.
    created_at_wallclock: float = field(default_factory=time.time)


@dataclass
class Conversation:
    turns: list[Turn] = field(default_factory=list)
    last_touched: float = field(default_factory=time.monotonic)


def _strip_pii(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return rows with PII columns removed. Operates on a copy; the
    stored rows in the conversation are left intact."""
    if not rows:
        return rows
    cleaned: list[dict[str, Any]] = []
    for row in rows:
        cleaned.append({k: v for k, v in row.items() if k.lower() not in _PII_COLUMNS})
    return cleaned


class ConversationStore:
    def __init__(self) -> None:
        self._store: dict[str, Conversation] = {}
        self._lock = Lock()

    def _evict_stale(self) -> None:
        """Drop conversations idle >TTL. Called opportunistically."""
        now = time.monotonic()
        cutoff = now - CONVERSATION_TTL_SECONDS
        stale = [cid for cid, c in self._store.items() if c.last_touched < cutoff]
        for cid in stale:
            del self._store[cid]
            log.debug("Evicted stale conversation", extra={"conversation_id": cid})

    def get_history(self, conversation_id: str) -> list[Turn]:
        with self._lock:
            self._evict_stale()
            conv = self._store.get(conversation_id)
            if conv is None:
                return []
            conv.last_touched = time.monotonic()
            return list(conv.turns)

    def append_turn(self, conversation_id: str, turn: Turn) -> None:
        with self._lock:
            self._evict_stale()
            conv = self._store.setdefault(conversation_id, Conversation())
            conv.turns.append(turn)
            conv.last_touched = time.monotonic()
            if len(conv.turns) > MAX_TURNS_PER_CONVERSATION:
                dropped = len(conv.turns) - MAX_TURNS_PER_CONVERSATION
                conv.turns = conv.turns[dropped:]
                log.debug(
                    "Trimmed conversation history",
                    extra={
                        "conversation_id": conversation_id,
                        "dropped": dropped,
                        "remaining": len(conv.turns),
                    },
                )

    def reset(self, conversation_id: str) -> None:
        """Drop a specific conversation. Idempotent — no error if absent."""
        with self._lock:
            if conversation_id in self._store:
                del self._store[conversation_id]
                log.info(
                    "Conversation reset",
                    extra={"conversation_id": conversation_id},
                )

    def get_charts_for_editorial(self, conversation_id: str) -> list[dict[str, Any]]:
        """Return all charts from this conversation, in creation order,
        formatted for the editorial LLM context. Aggregated rows are
        PII-stripped before they leave the store."""
        with self._lock:
            self._evict_stale()
            conv = self._store.get(conversation_id)
            if conv is None:
                return []
            conv.last_touched = time.monotonic()
            charts: list[dict[str, Any]] = []
            for turn in conv.turns:
                widgets_in = turn.tool_input.get("widgets") or []
                if widgets_in:
                    for i, w in enumerate(widgets_in):
                        wspec = w.get("chart_spec") or {}
                        charts.append(
                            {
                                "chart_id": (
                                    turn.chart_id if i == 0
                                    else f"{turn.chart_id}:{i}"
                                ),
                                "title": wspec.get("title", turn.question[:60]),
                                "chart_type": wspec.get("chartType", "unknown"),
                                "sql": w.get("sql", ""),
                                "aggregated_results": (
                                    _strip_pii(turn.aggregated_results)
                                    if i == 0 else []
                                ),
                                "explanation": turn.tool_input.get("explanation", ""),
                            }
                        )
                    continue
                spec = turn.tool_input.get("chart_spec") or {}
                charts.append(
                    {
                        "chart_id": turn.chart_id,
                        "title": spec.get("title", turn.question[:60]),
                        "chart_type": spec.get("chartType", "unknown"),
                        "sql": turn.tool_input.get("sql", ""),
                        "aggregated_results": _strip_pii(turn.aggregated_results),
                        "explanation": turn.tool_input.get("explanation", ""),
                    }
                )
            return charts

    def get_dominant_language(self, conversation_id: str) -> str:
        """Return 'el' or 'en' based on majority script of the original
        questions in this conversation. Defaults to 'en' if absent."""
        with self._lock:
            conv = self._store.get(conversation_id)
            if conv is None or not conv.turns:
                return "en"
            greek = sum(1 for t in conv.turns if _GREEK_PATTERN.search(t.question))
            return "el" if greek > len(conv.turns) / 2 else "en"

    def get_session_start(self, conversation_id: str) -> str | None:
        """ISO-8601 timestamp of the first turn in this conversation."""
        with self._lock:
            conv = self._store.get(conversation_id)
            if conv is None or not conv.turns:
                return None
            first = conv.turns[0]
            return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(first.created_at_wallclock))


_STORE = ConversationStore()


def get_store() -> ConversationStore:
    return _STORE


# Module-level alias for convenience in routes that prefer
# `from app.conversation import store`.
store = _STORE
