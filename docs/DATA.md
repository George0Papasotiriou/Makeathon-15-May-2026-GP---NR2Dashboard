# Data

Single source: `data/conversations.duckdb`. Read-only at runtime. ~10,000 synthetic banking voicebot conversations across **90 days, 2026-02-01 to 2026-05-01**. Outside this window, the LLM is instructed to return a clarification (`R13` in the system prompt) rather than silently re-interpret.

Reference originals (not loaded by the runtime): `data/conversations.jsonl` (raw nested form), `data/schema.md` (full column list), `data/metrics_dictionary.md` (canonical metric formulas).

---

## Views verified at backend startup

`backend/app/db.py:verify_connection()` opens the file `read_only=true` and `SELECT 1` from each of the following 5 views. Startup fails fast if any is missing.

### `v_conversations` (1 row per call)

Headline call-level facts. Key columns the system prompt teaches the LLM to reach for:

- `conversation_id` (PK; never feed back to LLM — PII).
- `start_time`, `end_time` (TIMESTAMP).
- `call_duration_secs` (INT).
- `outcome`, `call_successful`, `intent_resolved` — three outcome fields with subtly different semantics (see `data/metrics_dictionary.md`).
- `termination_reason` (`natural_end` / `caller_hung_up` / etc.).
- `bot_version` (`2.2.1`, `2.3.0`, ...) — the embedded step-change pattern.
- `csat_score` (DOUBLE 1-5, NULL when no survey). **AVG ignores NULLs natively — never `COALESCE(csat_score, 0)`**.
- `customer_segment` (`new`, `returning`, `premium`).
- `main_language` (`en`, `el`).
- `region` (e.g., `attica`).
- `cost_amount` (DOUBLE, EUR).

### `v_turns` (1 row per turn within a call)

Message-level detail. Joined to `v_conversations` via `conversation_id`.

- `turn_number`, `role` (`user` / `bot` / `tool`).
- `detected_intent`, `intent_confidence` (DOUBLE 0..1).
- `sentiment` (`positive` / `neutral` / `negative`).
- `message`, `transcript_summary` — PII, never returned in `aggregated_results`.

### `v_evaluations` (1 row per conversation × criterion)

LLM-as-judge evaluations. ~80k rows (≈ 8 criteria × 10k calls).

- `criterion` (e.g., `tone_appropriate`, `information_correct`).
- `value` (`success` / `failure` / `unknown`). **Filter `WHERE value <> 'unknown'` for pass-rate denominators** (R6).

### `v_data_collection`

Per-call key-value bag. **All values are TEXT** — cast explicitly: `CAST(value AS BOOLEAN)`, `TRY_CAST(value AS DOUBLE)` (R7).

- `field`, `value`.
- Special-case `field = 'topic_tags'`: comma-separated, use `UNNEST(string_split(value, ','))` (R8).

### `v_tool_calls`

Tool invocation log per call.

- `tool_name`, `latency_ms`, `success` (BOOL).
- Useful for `tool_success_rate` and `tool_latency_p95` queries.

---

## Embedded patterns

`devdocs/DATA_OUTLINE.md` §10 enumerates 12 patterns intentionally seeded into the synthetic dataset. The eval golden set (`docs/EVALUATION.md`) targets each. Examples:

- Step-change in containment rate between `bot_version` 2.2.1 → 2.3.0.
- Incident-window p95 latency spike on `transfer` intents.
- CSAT gradient: `premium > returning > new`.
- ~3% language-consistency failures, regional skew.
- ~5% mismatch between `intent_resolved` and `call_successful` (LLM-judge disagreement).

---

## Metric definitions (excerpt — see `data/metrics_dictionary.md`)

The system prompt (`backend/app/prompts/smartrep_voicebot.txt`) embeds these formulas verbatim. Diffs against the dictionary are a correctness failure.

| Metric | Formula |
|---|---|
| Containment rate | `COUNT_IF(call_successful = 'success') * 1.0 / COUNT(*)` |
| Escalation rate | `COUNT_IF(call_successful = 'unknown') * 1.0 / COUNT(*)` (the rest are routed to a human) |
| Abandonment rate | `COUNT_IF(termination_reason = 'caller_hung_up') * 1.0 / COUNT(*)` |
| AHT | `AVG(call_duration_secs)` |
| CSAT | `AVG(csat_score)` over rows with `csat_score IS NOT NULL` |
| Cost per resolved | `SUM(cost_amount) / NULLIF(COUNT_IF(call_successful = 'success'), 0)` |
| Tool success rate | `COUNT_IF(success) * 1.0 / COUNT(*)` (from `v_tool_calls`) |
| Tool latency p95 | `QUANTILE_CONT(latency_ms, 0.95)` |

---

## SQL gotchas baked into the prompt

- **`LEFT JOIN` scoping (R1)** — outer-side filters in `WHERE`, inner-side filters in `ON`. Misplacement silently degrades to INNER JOIN.
- **`NOT IN` with NULLs (R2)** — UNKNOWN drops rows. Use `NOT EXISTS` or filter the subquery first.
- **Window functions (R3)** — always explicit `PARTITION BY` + `ORDER BY`.
- **Aggregate defaults (R4)** — `COALESCE(COUNT(...), 0)` when missing rows should appear as 0 (e.g., escalations by intent); but **never `COALESCE(csat_score, 0)`** — that treats no-response as zero (R5).
- **`unknown` state (R6)** — exclude from denominators for pass rates; keep as its own category for outcome distributions.
- **`v_data_collection` casting (R7)** — every value is TEXT, must `CAST` / `TRY_CAST` explicitly.
- **Tautological filters (R9)** — never filter on `status`, `channel_origin`, `currency`, `direction`. They are constants for this dataset.
- **Greek literals (R10)** — preserve EXACT orthography (case, accents, breathings). Do not transliterate. Enum codes like `'el'`, `'en'`, `'attica'` stay English.
- **No `SELECT *` (R11)** — project explicit columns.
- **Read-only only (R12)** — `SELECT` / `WITH` only. Enforced by `sql/validator.py`.
- **Date range awareness (R13)** — return a clarification when the user names a period outside 2026-02-01 — 2026-05-01.
- **No fabricated metrics (R14)** — engagement score / NPS / CES / first-response-time / agent ID hash do not exist; ask which existing metric they meant.
- **Single-metric focus (R15)** — when the user asks for one rate, emit ONE series. Mixing rate + raw count on one Y axis breaks the axis scale.

---

## DuckDB capabilities the prompt advertises

- `GROUP BY ALL` — auto-groups by every non-aggregated SELECT column.
- `ORDER BY ALL` — orders by every output column left-to-right.
- `NULLS FIRST` / `NULLS LAST`.
- `COUNT(*) FILTER (WHERE ...)` — conditional aggregate.
- `QUANTILE_CONT(col, p)` / `MEDIAN(col)` — percentile / median, used by `box-plot` and `tool_latency_p95`.
- `UNNEST(string_split(value, ','))` — list-column expansion for `topic_tags`.
- `DATE_TRUNC('day' | 'week' | 'month', ts)` — bucketed time series.
- `EXTRACT(HOUR FROM ts)`, `DAYNAME(ts)` — heatmap-friendly time dims.

---

## What the LLM never sees

- Raw `aggregated_results` rows during normal `/api/query` turns. Tool results synthesized as `"Executed successfully. N rows returned."` strings (or clarification equivalents).
- PII columns (`user_id`, `from_number`, `message`, `transcript_summary`, `conversation_id`) — stripped before any row leaves the store, including the editorial pipeline (`conversation.py:_PII_COLUMNS`).

The editorial endpoint DOES feed PII-stripped sampled rows into Claude as JSON context — to let the briefing cite numbers.
