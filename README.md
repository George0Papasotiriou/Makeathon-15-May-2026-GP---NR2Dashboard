# Aperture | Your Company's Portal

Natural-language analytics for banking voicebot conversations. Type a question in English or Greek, get a charted answer back. Drag charts around a canvas, marquee-select bars to feed context into the next question, generate a magazine-style editorial PDF of the whole session.

Built for the UniAI Makeathon 2026 **SmartRep** challenge.
**Live URL:** _(deploy pending)_

---

## Stack at a glance

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 (App Router, Turbopack), React 19, TypeScript strict, Tailwind v4, shadcn/ui, Recharts 3.8, framer-motion |
| Backend | FastAPI, Pydantic v2, Anthropic SDK (Claude Sonnet 4.6 default), sqlglot, DuckDB read-only |
| Data | DuckDB file `data/conversations.duckdb` — 5 flat views, ~10k conversations, 90 days |
| Streaming | Server-Sent Events on `POST /api/query/stream` |
| Storage | None. Conversation history is in-memory on the backend (30-min idle TTL, 10-turn cap). Frontend persists `conversation_id` + canvas layout in `localStorage`. |

---

## Quick start

### Prereqs
- Python **3.11, 3.12, 3.13, or 3.14**.
- Node 20+ and `pnpm`.
- `ANTHROPIC_API_KEY` (Claude Sonnet 4.6 by default; any Claude 4.x model works via env override).

### Backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # POSIX
pip install -e .
copy .env.example .env          # Windows
# cp .env.example .env          # POSIX
#  → set ANTHROPIC_API_KEY
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
pnpm install
echo NEXT_PUBLIC_BACKEND_URL=http://localhost:8000 > .env.local
pnpm dev
# → http://localhost:3000
```

---

## Key features

### Chart catalog — 22 types
The LLM picks from these per question. Full picker rules + SQL row shapes in [`docs/CHART_TYPES.md`](docs/CHART_TYPES.md).

| Category | Types |
|---|---|
| Headline | `kpi`, `sparkline-kpi`, `gauge` |
| Trend | `line`, `area`, `area-stacked`, `combo` (dual-axis), `waterfall` |
| Ranking | `bar`, `bar-stacked`, `horizontal-bar`, `radar` |
| Distribution | `histogram`, `box-plot`, `heatmap` |
| Part-of-whole | `pie`, `donut`, `treemap` |
| Correlation / flow | `scatter`, `funnel` |
| Detail | `table` |
| Open-ended | `multi-panel` (per-panel SQL) |

### Conversation
- **Server-side memory** via `conversation_id`. Every turn is persisted (including clarification turns) so refinements ("switch to a line chart", "now compare by region") and clarifications thread back through Claude as `tool_use` / `tool_result` history.
- **Follow-up suggestions** auto-pill from `follow_up_hint` after each answer.
- **Inline clarification** button when Claude needs more info — click prefills the input.
- **Reset** drops a conversation explicitly.

### Canvas
- **Draggable** widgets with pan, zoom, edge resize, edge snapping, overlap-resolved drop placement. Layout persists to `localStorage`.
- **Marquee context selection** — drag a box over bars, slices, rows, cells, points, or tiles; selections feed as explicit context into the next question.
- **Dynamic sizing** — initial widget width adapts to title + chart type.
- **Per-chart in-SVG animations** on mount (bar height grow, pie sector reveal, line stroke draw).

### Streaming
- **SSE** at `POST /api/query/stream`. Events: `start` → `sql_start` → `sql` chars @ 35 ms cadence → `sql_end` → `done` / `error`.
- The simulate-streamed SQL drives the ChatInput phase dots: thinking → sql → executing → done.
- Multi-panel concatenates panel SQLs separated by `\n\n-- next panel --\n\n` for the stream.

### Editorial mode
- After ≥2 successful turns, the header "Editorial" button enables.
- Claude (forced `emit_editorial` tool) returns a structured 3-section briefing with cover, KPIs, insights, methodology, colophon.
- Frontend renders A4 pages, jsPDF + modern-screenshot exports a multi-page PDF at 2× DPI.

### Safety + ops
- **SQL safety stack**: sqlglot AST whitelist → DuckDB `EXPLAIN` dry-run → DuckDB `read_only=true` execution → 10k row cap.
- **Prompt caching** (`cache_control: ephemeral`, 5-min TTL) keeps per-turn cost low after the first turn (~$0.006 vs ~$0.03 on Sonnet 4.6).
- **Rate limit**: 30 req / 60 s / IP, sliding window.
- **PII strip** on every aggregated row leaving the conversation store (`user_id`, `from_number`, `message`, `transcript_summary`, `conversation_id`).
- **Request id** woven through every log line and exposed as `X-Request-Id`.

### LLM
- **Default**: Claude Sonnet 4.6 (`ANTHROPIC_MODEL=claude-sonnet-4-6`).
- **Per-model cost table** in `routes/query.py` covers Opus 4.7, Sonnet 4.6/4.5, Haiku 4.5. Token cost is reported in every response's `metadata.token_cost`.
- **Forced tool use** — Claude must emit `emit_chart_spec` (or `emit_editorial`) — no free-form prose paths.
- **3 SQL retries** on validation failure, with the failed SQL + error fed back into the next attempt.

---

## Repository layout

```
backend/
  app/
    main.py              FastAPI app + lifespan + middleware
    settings.py          env-driven config (ANTHROPIC_API_KEY, ANTHROPIC_MODEL, DUCKDB_PATH, CORS_ORIGINS, ...)
    db.py                DuckDB read-only singleton, verifies 5 views at startup
    conversation.py      in-memory ConversationStore, 30-min TTL, 10-turn cap
    middleware.py        request_id + rate_limit middlewares
    logger.py            stdlib logging w/ structured `extra` dicts
    models.py            Pydantic v2 models (ChartType, ChartSpec, QueryRequest/Response, Editorial*)
    sql/validator.py     sqlglot AST whitelist + DuckDB EXPLAIN dry-run + 10k row cap
    llm/anthropic_client.py
                         Anthropic SDK wrapper with prompt caching, forced tool_use,
                         emit_chart_spec + emit_editorial tools
    routes/
      query.py           POST /api/query, POST /api/query/stream (SSE),
                         POST /api/conversations/{id}/reset
      editorial.py       POST /api/editorial
    prompts/
      smartrep_voicebot.txt   chart-spec system prompt
      smartrep_editorial.txt  editorial system prompt
  pyproject.toml         requires-python >=3.11,<3.15
  .env.example

frontend/
  app/page.tsx           main canvas page, conversation_id mint, editorial trigger
  components/
    canvas/              DraggableCanvas, WidgetTile, ZoomControls, ChartRenderer (SpecRenderer)
    chat/                ChatInput, SelectedChips, WelcomeOverlay
    charts/              22 chart primitives (see docs/CHART_TYPES.md)
    editorial/           overlay + document + page + CSS
    ui/                  shadcn primitives
  lib/
    api-client.ts        postQuery, queryStream (SSE), generateEditorial, resetConversation
    api-types.ts         single source of truth for backend types (zod + TS)
    format.ts            formatValue(v, kind) — currency/percentage/number/duration/datetime
    pdf-export.ts        jsPDF + modern-screenshot multi-page A4 exporter
    env.ts               NEXT_PUBLIC_BACKEND_URL validation
  package.json           Next 16, React 19, Recharts 3.8

data/
  conversations.duckdb   90-day synthetic dataset (5 flat views)
  conversations.jsonl    raw nested form (unused by the runtime)
  schema.md
  metrics_dictionary.md

docs/
  ARCHITECTURE.md
  API.md
  CHART_TYPES.md
  DATA.md
  EVALUATION.md
```

---

## Docs

- **[Architecture](docs/ARCHITECTURE.md)** — request flow, components, streaming, safety.
- **[API reference](docs/API.md)** — every HTTP endpoint, payload shape, SSE event schema, error model.
- **[Chart types](docs/CHART_TYPES.md)** — the 22 primitives, when the LLM should pick each, exact SQL row shape per type.
- **[Data](docs/DATA.md)** — the 5 DuckDB views, key columns, metric definitions, dataset coverage window.
- **[Evaluation](docs/EVALUATION.md)** — golden-set methodology.

---

## License

MIT
