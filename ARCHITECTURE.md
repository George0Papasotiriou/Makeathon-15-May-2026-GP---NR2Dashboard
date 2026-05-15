# Architecture

## System Overview

```
┌────────────────────────────────────────────────────────────┐
│  Browser (http://localhost:8000)                           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Static Frontend (HTML + CSS + JS)                   │  │
│  │  • Command bar (Spotlight-style input)               │  │
│  │  • Bento grid (auto-arranging widget tiles)          │  │
│  │  • ECharts (bar, line, area, pie, KPI, table)        │  │
│  │  • SQL inspection panel                              │  │
│  └──────────────────────┬───────────────────────────────┘  │
│                         │ POST /api/query                  │
│  ┌──────────────────────▼───────────────────────────────┐  │
│  │  FastAPI Backend (app/main.py)                       │  │
│  │  1. Receive NL question                              │  │
│  │  2. Build prompt (system + schema + question)        │  │
│  │  3. Call Gemini 2.5 Flash → JSON {sql, chart_spec}   │  │
│  │  4. Validate SQL (read-only check)                   │  │
│  │  5. Execute on DuckDB → rows                        │  │
│  │  6. Return {widgets, latency_ms}                     │  │
│  │  * Retry up to 3x on SQL errors                     │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  DuckDB: data/conversations.duckdb (in-process, read-only)│
└────────────────────────────────────────────────────────────┘
```

## File Structure

```
├── app/
│   ├── __init__.py          # Package init
│   ├── main.py              # FastAPI app, routes, query pipeline
│   ├── database.py          # DuckDB connection, SQL safety, execution
│   ├── llm.py               # Gemini REST API client
│   ├── models.py            # Pydantic request/response models
│   └── prompts.py           # System prompt (schema + metrics + rules)
├── static/
│   ├── index.html           # Main frontend shell
│   ├── styles.css           # Dark-mode glassmorphic design system
│   └── app.js               # Chart rendering, grid management, UX
├── data/
│   ├── conversations.duckdb # Pre-built dataset (~3.5 MB)
│   ├── conversations.jsonl  # Raw nested JSON (~54 MB)
│   ├── schema.md            # Column dictionary
│   └── metrics_dictionary.md # KPI definitions
├── starter/                 # Original starter code (reference only)
├── requirements.txt         # Python dependencies
├── .env.example             # Environment template
├── README.md                # Project documentation
└── ARCHITECTURE.md          # This file
```

## Key Design Decisions

### 1. Monolithic FastAPI (not separate frontend + backend)
**Why:** Eliminates cross-service networking, CORS issues, and deploy complexity.
FastAPI serves both the API routes and static frontend files.

### 2. Gemini REST API (not SDK)
**Why:** Zero Python version constraints. The `google-genai` SDK requires 3.13+;
direct HTTP calls work on any Python 3.7+. Also simpler to debug.

### 3. ECharts (not Recharts/D3/Chart.js)
**Why:** Best dark-mode aesthetics out of the box. Smooth animations built-in.
Works via CDN — no build step. Supports all 6 chart types we need.

### 4. Zero query-pattern examples in system prompt
**Why:** Few-shot query examples bias the LLM toward mimicking specific patterns.
Without them, the model generalizes better to novel queries. We only include
structural examples (JSON output format) and behavioral rules.

### 5. SQL retry loop (3 attempts)
**Why:** LLMs occasionally generate SQL with wrong column names or syntax.
On failure, we feed the error message back as context and retry.
This catches ~90% of first-attempt SQL errors.

### 6. Read-only SQL validation
**Why:** Defense in depth. Even though the LLM is instructed to be read-only,
we parse the SQL and reject any statement not starting with SELECT/WITH.

## Data Flow

1. **User types question** in command bar
2. **Frontend** sends POST to `/api/query` with question + conversation history
3. **Backend** builds system prompt (schema + metrics + capabilities)
4. **Gemini 2.5 Flash** returns JSON: `{panels: [{sql, chart, explanation}]}`
5. **Backend** validates each SQL query (read-only check)
6. **DuckDB** executes SQL → returns rows
7. **Backend** assembles widget data and returns to frontend
8. **Frontend** renders each widget as a glassmorphic tile with ECharts
9. **Grid** auto-arranges tiles with staggered entrance animation
