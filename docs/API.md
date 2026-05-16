# API Reference

Base URL: `${NEXT_PUBLIC_BACKEND_URL}` (default `http://localhost:8000`).
All endpoints expect/return JSON unless noted.
Every response carries an `X-Request-Id` header. Client may set its own via the same request header.

---

## GET /api/health

Liveness probe. Does not touch DuckDB or Anthropic.

```http
GET /api/health
→ 200 OK
{
  "status": "ok",
  "service": "aperture-backend"
}
```

---

## POST /api/query

Non-streaming natural-language → chart spec + executed data.

### Request
```json
{
  "question": "Containment rate by intent",
  "conversation_id": "5d57b27e-..."
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `question` | string (1..2000 chars) | yes | |
| `conversation_id` | string (UUID) | no | If absent, the backend mints one and returns it in `metadata.conversation_id`. Future turns must reuse it for context continuity. |

### Response — single chart
```json
{
  "spec": {
    "chartType": "bar",
    "title": "Containment by intent",
    "description": null,
    "config": {
      "xAxisKey": "intent_name",
      "series": [{ "dataKey": "rate", "label": "Containment", "format": "percentage" }]
    },
    "sql": "SELECT intent_name, AVG(...) AS rate FROM ... GROUP BY intent_name"
  },
  "data": [
    { "intent_name": "balance", "rate": 0.82 },
    { "intent_name": "transfer", "rate": 0.74 }
  ],
  "explanation": "Containment averages 78% across intents...",
  "follow_up_hint": "Compare bot v2.2.1 vs v2.3.0",
  "clarification_question": null,
  "narrative_html": null,
  "metadata": {
    "latency_ms": 1820,
    "token_cost": 0.0231,
    "sql_retries": 0,
    "conversation_id": "5d57b27e-...",
    "request_id": "f1b2...",
    "chart_id": "c0a8..."
  },
  "panel_data": null
}
```

### Response — multi-panel

`spec.chartType === "multi-panel"` and `spec.sql == ""`. Each panel's data lives in `panel_data[i]` (aligned with `spec.config.panels[i]`):

```json
{
  "spec": {
    "chartType": "multi-panel",
    "title": "Voicebot health overview",
    "config": {
      "series": [],
      "panels": [
        { "chartType": "kpi",  "title": "Total calls", "sql": "SELECT ...", "config": {...} },
        { "chartType": "line", "title": "Daily containment", "sql": "SELECT ...", "config": {...} },
        { "chartType": "donut", "title": "Termination mix", "sql": "SELECT ...", "config": {...} },
        { "chartType": "bar",  "title": "Top intents", "sql": "SELECT ...", "config": {...} }
      ]
    },
    "sql": ""
  },
  "data": [],
  "panel_data": [
    [{ "total": 10000 }],
    [{ "day": "2026-02-01", "rate": 0.82 }, ...],
    [{ "reason": "natural_end", "share": 0.71 }, ...],
    [{ "intent": "balance", "rate": 0.92 }, ...]
  ],
  "metadata": {...}
}
```

### Response — clarification / unanswerable

`spec.chartType === "kpi"`, `spec.title === ""`, `spec.sql === ""`, `data === []`. The semantic answer is in `explanation` + `clarification_question`.

```json
{
  "spec": { "chartType": "kpi", "title": "", "config": {"series": []}, "sql": "" },
  "data": [],
  "explanation": "I need a bit more detail.",
  "follow_up_hint": null,
  "clarification_question": "Which week did you mean — current ISO week or the last 7 days?",
  "metadata": {...}
}
```

### Errors

| Status | Body | Cause |
|---|---|---|
| 422 | Pydantic validation error | `question` empty / >2000 chars |
| 429 | `{detail, retry_after_seconds}` + `Retry-After` header | Rate limit (30/60s/IP) |
| 500 | `{detail}` | Anthropic call raised; or DuckDB error after 3 SQL retries (returns clarification path, not 500) |

---

## POST /api/query/stream

Same input shape as `/api/query`. Returns `text/event-stream`. Frame format: `event: <name>\ndata: <json>\n\n`.

### Event order

| Order | event | data |
|---|---|---|
| 1 | `start` | `{"question": "..."}` |
| 2 | _LLM tool_use + SQL exec (no event)_ | |
| 3 | `sql_start` | `{"widget_index": 0, "widget_id": "<chart_id>"}` |
| 4..N | `sql` | `{"widget_index": 0, "ch": "<char>"}` — 35 ms cadence |
| N+1 | `sql_end` | `{"widget_index": 0}` |
| N+2 | `done` | full `QueryResponse` JSON, identical to non-streaming response |
| _err_ | `error` | `{"error": "<message>"}` — terminal, no further events |

`widget_index` is always `0` (single-chart per turn; multi-panel still emits one widget on the frontend side, panels live inside `spec.config.panels` + `panel_data`).

For multi-panel responses the streamed SQL is the concatenation of every panel's SQL joined by `\n\n-- next panel --\n\n`.

For clarification / no-SQL responses `sql_start` / `sql` / `sql_end` are skipped; only `start` → `done`.

### Client expectations

- Set `Content-Type: application/json` on the POST.
- Use a streaming-fetch reader; `EventSource` does not support POST.
- Reference implementation: `frontend/lib/api-client.ts:queryStream` (an async generator).

---

## POST /api/editorial

Build a magazine-style multi-section briefing from every successful turn in a conversation. Requires ≥2 charts.

### Request
```json
{ "conversation_id": "5d57b27e-..." }
```

### Response
```json
{
  "title": "Voicebot Health, Week 12",
  "dek": "Three signals worth surfacing this week.",
  "kicker": "OPERATIONS BRIEFING",
  "sections": [
    {
      "number": 1,
      "chart_id": "c0a8...",
      "section_kicker": "CONTAINMENT",
      "headline": "Containment held above the 80% line",
      "kpi_value": "82.4%",
      "kpi_label": "Daily mean",
      "lede": "...",
      "body": "...",
      "insight": "..."
    }
  ],
  "methodology_note": "All metrics defined per data/metrics_dictionary.md.",
  "colophon_stamp": "APERTURE · 2026-05-16",
  "metadata": {
    "request_id": "...",
    "conversation_id": "...",
    "chart_count": 4,
    "latency_ms": 8312,
    "token_cost_usd": 0.0894,
    "input_tokens": 12053,
    "cache_creation_tokens": 0,
    "cache_read_tokens": 11214,
    "output_tokens": 1827
  }
}
```

### Errors

| Status | Body | Cause |
|---|---|---|
| 400 | `{"detail": "Need at least 2 charts to generate an editorial"}` | Fewer than 2 successful turns in the conversation. |
| 404 | `{"detail": "Conversation not found"}` | Backend restarted, or TTL expired. |

---

## POST /api/conversations/{conversation_id}/reset

Drop a conversation's history. Idempotent — no error if absent. The next query under the same `conversation_id` starts fresh.

```http
POST /api/conversations/abc/reset
→ 200 OK
{ "status": "reset", "conversation_id": "abc" }
```

---

## Type catalog (Pydantic / zod)

Both backend Pydantic (`backend/app/models.py`) and frontend zod (`frontend/lib/api-types.ts`) define mirrored types. Keep them in sync if you add fields.

```ts
type ChartType =
  | "bar" | "bar-stacked" | "horizontal-bar"
  | "line" | "area" | "area-stacked" | "combo"
  | "pie" | "donut" | "treemap"
  | "scatter" | "kpi" | "sparkline-kpi" | "gauge"
  | "histogram" | "box-plot" | "heatmap"
  | "funnel" | "radar" | "waterfall"
  | "table" | "multi-panel";

type SeriesConfig = {
  dataKey: string;
  label: string;
  format?: "currency" | "percentage" | "number" | "duration" | "datetime";
  yAxisId?: "left" | "right";        // combo only
  chartKind?: "bar" | "line" | "area"; // combo only
  quartile?: "min" | "q1" | "median" | "q3" | "max"; // box-plot only
};

type ChartConfig = {
  xAxisKey?: string;
  yAxisKey?: string;       // scatter, heatmap
  valueKey?: string;       // heatmap (cell), gauge (metric), treemap (size)
  target?: number;         // gauge
  max?: number;            // gauge, histogram domain top
  series: SeriesConfig[];
  panels?: ChartSpec[];    // multi-panel only
};

type ChartSpec = {
  chartType: ChartType;
  title: string;
  description?: string;
  config: ChartConfig;
  sql: string;             // "" for multi-panel and clarification responses
};

type QueryMetadata = {
  latency_ms: number;
  token_cost: number;      // USD; see _MODEL_RATES_USD_PER_M
  sql_retries: number;     // 0..MAX_RETRIES-1
  conversation_id: string;
  request_id: string;
  chart_id?: string;
};

type QueryResponse = {
  spec: ChartSpec;
  data: Array<Record<string, unknown>>;
  panel_data?: Array<Array<Record<string, unknown>>>;
  explanation: string;
  follow_up_hint?: string;
  clarification_question?: string;
  narrative_html?: string;
  metadata: QueryMetadata;
};
```

---

## Rate limit

Sliding-window, 30 requests per 60 seconds per IP. Implemented in `backend/app/middleware.py:rate_limit_middleware`. `/api/health` is exempt. Exceeding returns `429` with body `{detail, retry_after_seconds}` and a `Retry-After` response header.

## Request ID

Every response carries `X-Request-Id`. Clients may pass their own via the same request header — the backend honors it, otherwise it mints `uuid.uuid4()`. The id is woven into every log line for the request.
