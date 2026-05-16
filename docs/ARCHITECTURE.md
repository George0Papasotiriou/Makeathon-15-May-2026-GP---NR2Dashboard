# Architecture

## Overview

A Next.js 16 SPA talks directly to a FastAPI backend. The backend owns the Anthropic SDK client, the DuckDB read-only connection, the SQL validator, and the in-memory conversation store. The frontend renders an infinite draggable canvas of chart widgets and streams SQL char-by-char into the chat input's phase indicator.

```
┌──────────────────┐  POST /api/query/stream (SSE)  ┌──────────────────────────┐
│  Next.js 16 SPA  │ ─────────────────────────────► │  FastAPI                 │
│  React 19        │                                │   ├─ request_id MW       │
│  DraggableCanvas │ ◄──────────────────────────── │   ├─ rate_limit MW       │
│  Recharts 3.8    │   start / sql / sql_end / done │   ├─ routes/query.py     │
└──────────────────┘                                │   ├─ routes/editorial.py │
        │                                           │   ├─ conversation.py    │
        │  POST /api/editorial                      │   ├─ llm/anthropic_*    │
        ▼                                           │   └─ sql/validator.py   │
   editorial overlay                                └────────────┬─────────────┘
   + jsPDF export                                                │
                                                         ┌───────┴────────┐
                                                         │ Anthropic API  │
                                                         │ Claude Sonnet  │
                                                         │ 4.6 (default)  │
                                                         └────────────────┘
                                                                │
                                                                ▼
                                                       ┌────────────────┐
                                                       │  DuckDB ro     │
                                                       │  5 flat views  │
                                                       └────────────────┘
```

## Request lifecycle — POST /api/query/stream

1. **Frontend** mints `conversation_id` via `crypto.randomUUID()` on first load, persists in `localStorage` (`aperture-conversation-id`). Subsequent queries reuse it.
2. **Frontend** assembles `{question, conversation_id}`, optionally prepends a context prefix built from `SelectedItem[]` (marquee selections), and calls `lib/api-client.ts:queryStream`.
3. **Backend** middleware mints `request_id` (UUID, also accepts client-supplied `X-Request-Id`) and runs sliding-window rate limit (30/60s/IP).
4. `routes/query.py:_execute_query` looks up the conversation history (in-memory), builds the Anthropic `messages` list as alternating `tool_use` / `tool_result` pairs, forces `tool_choice = emit_chart_spec`, and gets a tool_use back.
5. **Multi-panel branch** (`chart_spec.chartType == "multi-panel"`): each panel has its own `sql`; the backend validates + executes each through sqlglot AST + DuckDB EXPLAIN + DuckDB exec, collects rows into `panel_data`. Top-level `sql` is empty.
6. **Single-chart branch**: validate + execute the single top-level `sql`. On `SQLValidationError`, append `{sql, error}` to `prior_attempts` and retry up to 3 times (the failed SQL + error message are fed back to the LLM).
7. Persist the turn to the in-memory `ConversationStore` (even clarification turns with `row_count=0`, so the next turn sees full context).
8. **SSE wrapper** (`_query_event_stream`) emits:

   | order | event | payload |
   |---|---|---|
   | 1 | `start` | `{"question": "..."}` |
   | 2 | _(await LLM + SQL exec)_ | — |
   | 3 | `sql_start` | `{"widget_index": 0, "widget_id": chart_id}` |
   | 4..N | `sql` | `{"widget_index": 0, "ch": "<char>"}` @ 35 ms cadence |
   | N+1 | `sql_end` | `{"widget_index": 0}` |
   | N+2 | `done` | full `QueryResponse` (spec, data, panel_data, metadata, follow_up_hint, clarification_question) |
   | err | `error` | `{"error": "..."}` (terminal) |

   For multi-panel, the streamed SQL is the per-panel SQLs joined by `\n\n-- next panel --\n\n`.

9. **Frontend** parses each frame, drives `ChatInput` phase dots, and on `done` builds a `WidgetData` with `{id, spec, data, panelData, columns, sql, explanation, follow_up, clarification, latency_ms}`, appends to canvas state, persists to `localStorage` (`aperture-widgets-v2`).

## Editorial flow — POST /api/editorial

Triggered from the header button (disabled until ≥2 charts on the canvas). Backend pulls every turn from `ConversationStore` via `get_charts_for_editorial`, runs language detection (Greek vs English), forces `tool_choice = emit_editorial`, returns a structured `EditorialResponse{title, dek, kicker, sections[], methodology_note, colophon_stamp, metadata}`. The overlay (`components/editorial/editorial-overlay.tsx`) renders pages at A4 dimensions; `lib/pdf-export.ts` captures each `[data-editorial-page]` with `modern-screenshot` and composites them into a multi-page PDF via `jspdf`.

## SQL safety

Defense in depth:

1. **sqlglot AST whitelist** — only `SELECT`, `WITH`, `UNION` at top level. Forbid `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `CREATE`, `TRUNCATE`, `MERGE`, `ATTACH`, `DETACH`, `COPY`, `PRAGMA`, `LOAD`, `INSTALL`.
2. **DuckDB `EXPLAIN` dry-run** before execution catches missing tables/columns + non-SELECT residue.
3. **DuckDB read-only connection** — engine-level guarantee.
4. **10,000 row cap** per result set in the validator.

## Conversation history

`backend/app/conversation.py:ConversationStore`:

- In-process dict, **resets on backend restart**. No DB.
- TTL: 30 min idle per conversation.
- Cap: 10 turns (FIFO evict).
- Each turn stores `{question, tool_use_id, tool_input (the raw LLM tool_use dict), row_count, chart_id, aggregated_results (capped 100 rows, PII-stripped)}`.
- The LLM never sees raw rows — only synthesized `tool_result` content (`"Executed successfully. N rows returned."`, or `"User was asked for clarification; awaiting their reply."`, or `"No SQL emitted."`).
- `aggregated_results` is reserved for the editorial endpoint, which DOES feed sampled rows back into Claude.

## Prompt caching

System prompts (`smartrep_voicebot.txt` and `smartrep_editorial.txt`) are sent as `system: [{type: "text", text, cache_control: {type: "ephemeral"}}]`. Anthropic caches blocks ≥1024 tokens for 5 minutes. Cache reads cost 10 % of base input rate; cache writes 125 %. Real cache hit rates are visible per-call in `result.cache_read_tokens` / `result.cache_creation_tokens` (logged at INFO).

## Streaming choice — why simulate

LLM token streaming chunks unevenly and would render a jittery typing effect. Instead the full pipeline (LLM + SQL exec) runs up front; the resulting SQL is then **simulate-streamed** to the client at a deterministic 35 ms / char. The user-perceived effect is the same; the pacing is stable for the demo and the backend can emit the entire `done` payload as one frame.

## Frontend canvas model

`components/canvas/DraggableCanvas.tsx` is a pan + zoom + marquee surface. Each widget is an absolute-positioned `<motion.div>` with pointer-down → drag, edge resize handle, snap-on-release to other widget edges, overlap resolution along the smallest-penetration axis. Layout (positions + sizes) persists to `localStorage` (`aperture-layout-v1`).

Marquee selection scans `[data-selectable]` nodes inside the marquee rect, parses standardized `data-*` attributes (`data-uid`, `data-kind`, `data-widget-id`, `data-widget-title`, `data-label`, `data-payload`), builds `SelectedItem[]`, which the next query prepends to the user's question as a context block.

## LLM choice

**Default: `claude-sonnet-4-6`** (`backend/app/settings.py:ANTHROPIC_MODEL`). Overridable via env. Reasoning:

- Sonnet 4.6 handles forced tool use + structured `emit_chart_spec` output reliably at ~$3/M input, ~$15/M output — roughly 5× cheaper than Opus 4.7 for this workload.
- Caching of the 400-line system prompt eats most of the per-call cost after the first turn.
- Greek output is fluent.
- Per-model rates table in `routes/query.py:_MODEL_RATES_USD_PER_M`: opus-4-7, sonnet-4-6, sonnet-4-5, haiku-4-5. Unknown models fall back to Sonnet rates.

## Env vars (backend)

| Var | Required | Default | Notes |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | yes | — | Empty value raises at first LLM call. |
| `DUCKDB_PATH` | no | `../data/conversations.duckdb` | Resolved relative to `backend/`. |
| `ANTHROPIC_MODEL` | no | `claude-sonnet-4-6` | Any Claude 4.x model id. |
| `CORS_ORIGINS` | no | `http://localhost:3000` | Comma-separated. |
| `ENV` | no | `development` | `development` \| `production`. |
| `LOG_LEVEL` | no | `info` | `debug` \| `info` \| `warning` \| `error`. |
| `SYSTEM_PROMPT_PATH` | no | `app/prompts/smartrep_voicebot.txt` | |
| `EDITORIAL_PROMPT_PATH` | no | `app/prompts/smartrep_editorial.txt` | |

## Env vars (frontend)

| Var | Default | Notes |
|---|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | `http://localhost:8000` | Used by `lib/env.ts` (zod-validated URL). |
| `NEXT_PUBLIC_ENV` | `development` | |
| `NEXT_PUBLIC_LOG_LEVEL` | unset | `debug` \| `info` \| `warn` \| `error`. |
