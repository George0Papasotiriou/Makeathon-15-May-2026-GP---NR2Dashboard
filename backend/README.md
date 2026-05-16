# Aperture — Backend

FastAPI + Pydantic v2 + DuckDB (read-only) + Anthropic SDK with prompt caching + sqlglot SQL validator.

## Run

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # POSIX
pip install -e ".[dev]"
cp .env.example .env
#  → set ANTHROPIC_API_KEY
uvicorn app.main:app --reload --port 8000
```

Python compatibility: **3.11, 3.12, 3.13, 3.14** (`pyproject.toml: requires-python = ">=3.11,<3.15"`).

## Environment

| Var | Required | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | — |
| `DUCKDB_PATH` | no | `../data/conversations.duckdb` |
| `ANTHROPIC_MODEL` | no | `claude-sonnet-4-6` |
| `CORS_ORIGINS` | no | `http://localhost:3000` |
| `ENV` | no | `development` |
| `LOG_LEVEL` | no | `info` |
| `SYSTEM_PROMPT_PATH` | no | `app/prompts/smartrep_voicebot.txt` |
| `EDITORIAL_PROMPT_PATH` | no | `app/prompts/smartrep_editorial.txt` |

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness probe (no DuckDB, no LLM). |
| POST | `/api/query` | NL → chart spec + executed data. JSON in/out. |
| POST | `/api/query/stream` | Same input. Returns Server-Sent Events. |
| POST | `/api/editorial` | Build a magazine briefing from a conversation. Requires ≥2 charts. |
| POST | `/api/conversations/{id}/reset` | Drop history; idempotent. |

Full payload schema + SSE event order: [`../docs/API.md`](../docs/API.md).

## Module layout

```
app/
  main.py              FastAPI app, lifespan (verifies DuckDB at boot), middleware order
  settings.py          Pydantic BaseSettings reading `.env`
  db.py                DuckDB read-only singleton; verifies 5 views at startup
  conversation.py      ConversationStore (in-memory; 30-min TTL, 10-turn cap, PII stripped)
  middleware.py        request_id_middleware, rate_limit_middleware (30/60s/IP)
  logger.py            stdlib logging with structured `extra` dicts
  models.py            Pydantic v2 types (ChartType, ChartSpec, QueryRequest/Response, Editorial*)
  sql/validator.py     sqlglot AST whitelist + DuckDB EXPLAIN dry-run + 10k row cap
  llm/anthropic_client.py
                       Anthropic SDK wrapper:
                         - EMIT_CHART_SPEC_TOOL (forced tool_use)
                         - EMIT_EDITORIAL_TOOL (forced tool_use)
                         - prompt caching via cache_control:ephemeral
                         - _build_messages reconstructs prior turns as
                           tool_use ↔ synthesized tool_result pairs
  routes/
    query.py           POST /api/query, /api/query/stream, /api/conversations/{id}/reset
                       _execute_query: shared pipeline (validate, LLM, retry, exec, persist)
                       _query_event_stream: SSE wrapper around _execute_query
                       Multi-panel branch executes each panel's sql independently.
                       _MODEL_RATES_USD_PER_M: cost calc table per model id.
    editorial.py       POST /api/editorial
                       Pulls turns via store.get_charts_for_editorial,
                       detects language, forces emit_editorial tool.
  prompts/
    smartrep_voicebot.txt   chart-spec system prompt; covers
                            DuckDB capabilities, metric formulas, R1..R15 rules,
                            B1..B9 behavioral rules, [CHART SELECTION GUIDE],
                            and [SHAPE CHECKLIST PER chartType].
    smartrep_editorial.txt  editorial system prompt
```

## Conversation history

In-process dict in `conversation.py`. **Resets on backend restart.**

- TTL: 30 min idle per conversation.
- Cap: 10 turns; FIFO eviction.
- Every turn persists, including clarification (`row_count=0`) and zero-row queries — so the next user reply lands in a context-aware LLM call.
- The LLM never sees raw rows in the voicebot path. `_build_messages` synthesizes `tool_result` text:
  - `row_count > 0` → `"Executed successfully. N rows returned."`
  - `clarification_question` present → `"User was asked for clarification; awaiting their reply."`
  - sql empty + no clarification → `"No SQL emitted (unanswerable or out of scope)."`
  - else → `"Executed successfully. 0 rows returned."`
- The editorial path DOES feed PII-stripped, capped (100 rows) `aggregated_results` back to Claude as JSON context.

## SQL safety

`sql/validator.py` enforces in order:

1. `sqlglot.parse_one(sql, dialect="duckdb")`. Top level must be `Select`, `With`, `Union`, or `Subquery`. Forbid `Insert`, `Update`, `Delete`, `Drop`, `Alter`, `Create`, `Truncate`, `Merge`, `Attach`, `Detach`, `Copy`, `Pragma`, `Load`, `Install`.
2. `EXPLAIN <sql>` against DuckDB read-only. Catches missing tables/columns and any non-SELECT residue that survived the parser.
3. Execute with a 10,000 row cap.

DuckDB is opened `read_only=True` (`db.py:get_conn`) as the engine-level floor.

## Prompt caching

The system prompt is sent as:

```python
system=[{"type": "text", "text": system_prompt, "cache_control": {"type": "ephemeral"}}]
```

Anthropic caches blocks ≥1024 tokens for 5 minutes. Cache write costs 125 % of base input rate; cache read costs 10 %. Hit/miss visible per call:

```
INFO llm.anthropic LLM call completed {
  "input_tokens": ...,
  "cache_creation_tokens": 0,        # cache hit
  "cache_read_tokens": 11214,
  "output_tokens": ...,
  "stop_reason": "tool_use"
}
```

If you change `smartrep_voicebot.txt` or the tool schema, expect `cache_creation_tokens` > 0 on the next call (one-time write).

## Cost accounting

`routes/query.py:_compute_token_cost` reads `settings.ANTHROPIC_MODEL` and picks from `_MODEL_RATES_USD_PER_M`:

| Model | Input $/M | Output $/M |
|---|---|---|
| `claude-opus-4-7` | 15.0 | 75.0 |
| `claude-sonnet-4-6` | 3.0 | 15.0 |
| `claude-sonnet-4-5` | 3.0 | 15.0 |
| `claude-haiku-4-5` | 1.0 | 5.0 |

Unknown models default to Sonnet rates (logged once for awareness).

## Verify

```bash
python -m py_compile $(git ls-files 'app/**/*.py')
ruff check .
mypy app
# pytest    # placeholder — golden-set runner lives at ../eval/
```
