# Outline — SmartRep NR2Dashboard Challenge

## 1. Objective

Build NL→dashboard system. User type/speak question (EN or GR) → return working chart(s) backed by real SQL on provided DuckDB. Must handle distributions, trends, rankings, anomaly hunts, open-ended health checks. No hardcoded `if query contains X → chart Y` lookup tables. Use dataset as-is.

Inputs: NL question. Outputs: chart spec + rendered chart + (ideally) SQL + short explanation.

## 2. Dataset shape

- 90-day synthetic banking voicebot logs, ~10K conversations.
- Two files, same data:
  - `conversations.jsonl` — raw nested JSON, 1 conversation/line, ~50MB.
  - `conversations.duckdb` — pre-flattened DuckDB with raw table + 5 views, ~25MB.
- One inbound voice call = one row. `status` always `done`. `channel_origin` always `phone`. `currency` always `EUR`. `direction` always `inbound`.
- Time range: spans ~90 days around 2026 (sample row: `2026-03-30`).
- Languages: `el` / `en`. ~85/15 split. EN share rises summer in tourist regions.

## 3. Schema (key columns)

### `conversations_raw` (nested)
- `conversation_id` PK, `agent_id` (v2.2.1 pre / v2.3.0 post), `user_id` (stable across calls), `start_time` UTC, `call_duration_secs`.
- `metadata.cost.amount` EUR, `metadata.termination_reason` (`completed`/`transferred_to_human`/`caller_hung_up`/`silence_timeout`), `metadata.bot_version`.
- `metadata.phone_call.from_number` E.164 or `anonymous`.
- `analysis.transcript_summary`, `analysis.call_successful` (`success`/`failure`/`unknown`), `analysis.main_language` (detected, ≠ declared sometimes).
- `analysis.evaluation_criteria_results[]` — 8 criteria/conversation.
- `analysis.data_collection_results[]` — 14 fields/conversation, values all stringly-typed (`"true"`/`"false"`/`"unknown"`).
- `transcript[]` — turns w/ `role`, `time_in_call_secs`, `message`, `detected_intent` (on user turn that surfaced it), `intent_confidence` (0.78–0.97), `sentiment` (pos/neu/neg), `tool_calls[]` (`tool_name`, `success`, `latency_ms`).
- `conversation_initiation_client_data.dynamic_variables`: `segment` (new/returning/premium/business/unknown), `region` (attica/thessaloniki/crete/patras/larissa/other_gr/international), `preferred_language`, `csat_score` (1.0–5.0, only ~30% populated), `csat_collected` bool, `outcome` (resolved/escalated/abandoned/timeout — synthetic ground-truth).

### Flat views (use these for SQL)
- `v_conversations` — 1 row/call. Has `start_date`/`start_hour`/`start_dow` helpers + lifted `segment`/`region`/`csat_score`/`outcome`/`bot_version`.
- `v_turns` — 1 row/turn. Joins `agent_id`/`start_time`/`main_language`, has `turn_number` window-derived.
- `v_evaluations` — 1 row/(conversation × criterion). Use for pass-rate per criterion.
- `v_data_collection` — 1 row/(conversation × field). Use for segment/region/transfer-bucket breakdowns.
- `v_tool_calls` — 1 row/tool invocation. Use for tool reliability/latency.

## 4. Triple-language fields (subtle trap)

Three independent language columns. Don't conflate:
- `preferred_language` — user profile.
- `declared_language` — IVR menu pick (in `data_collection_results`).
- `main_language` — detected from speech.

Mismatches between these are themselves a metric.

## 5. Triple-outcome fields (more subtle trap)

- `analysis.call_successful`: `success` / `failure` / `unknown`.
- `dynamic_variables.outcome`: `resolved` / `escalated` / `abandoned` / `timeout`.
- `metadata.termination_reason`: `completed` / `transferred_to_human` / `caller_hung_up` / `silence_timeout`.

Per metrics dict:
- `containment = call_successful='success' = outcome='resolved'` (agree by construction).
- `escalation = call_successful='unknown' = outcome='escalated'`.
- `abandonment = termination_reason='caller_hung_up'`.
- LLM-judge `intent_resolved` agrees w/ `call_successful` ~95%, disagrees ~5%.

## 6. Canonical metrics (must match dictionary exactly)

| Metric | Formula |
|---|---|
| Containment Rate | `COUNT(call_successful='success') / COUNT(*)` |
| Escalation Rate | `COUNT(call_successful='unknown') / COUNT(*)` |
| Abandonment Rate | `COUNT(termination_reason='caller_hung_up') / COUNT(*)` |
| Deflection Rate | `1 - escalation_rate` (≠ containment) |
| CSAT | `AVG(csat_score)` ignoring nulls; response rate ~30% |
| Sentiment-Negative Rate | share `sentiment='negative'` in `v_turns` |
| AHT | `AVG(call_duration_secs)` |
| Median Handle Time | median (often more useful than AHT — escalations skew mean) |
| Time-to-First-Intent | min `time_in_call_secs` per conv where intent not null |
| Tool Success Rate | per `tool_name`, share `success=true` |
| Tool Latency | median + p95 of `latency_ms` |
| Cost/Resolved Call | `SUM(cost) / COUNT(call_successful='success')` |
| Repeat Caller Rate | share users w/ >1 call in window |
| FCR | share users whose 1st call/24h had no follow-up |

## 7. Evaluation criteria (8, every call)

`authentication_completed`, `intent_resolved`, `escalation_triggered` (state not goodness), `compliance_disclaimer_given`, `pii_handled_safely`, `fallback_count_acceptable`, `language_consistency`, `tool_call_success_rate`. Exclude `unknown` when computing pass rate.

## 8. Data collection fields (14, every call, all strings)

`customer_segment`, `region`, `declared_language`, `caller_line_type` (withheld → ↑escalation), `account_type_referenced`, `transfer_amount_bucket` (>10000 → ↑escalation), `transfer_destination_country`, `card_type_referenced`, `loan_type_inquired`, `auth_method_used` (biometric ↑ post-v2.3), `self_service_completed` (ops KPI), `promised_callback` (~6% baseline, ~25% incident), `complaint_detected` (≠ sentiment), `topic_tags` (csv, ~30 vocab).

## 9. Intent catalog (20 intents, 7 categories)

accounts, cards, transfers, loans, auth, disputes, general, self_service. `requires_auth` flag varies. Pain-point intents cluster bottom of CSAT.

## 10. Embedded patterns / anomalies (data is **not** uniform — find these)

1. **Release step-change** — bot v2.2.1 → v2.3.0. v2.3.0 outperforms on auth-category metrics. Biometric auth share jumps post-release. PII-handling failure rate slightly higher on v2.2.1.
2. **Incident window** — tool-call failures spike for transfer-category intents in this window. `promised_callback` jumps ~6% → ~25%. Tool latency p95 spikes.
3. **Daily + weekly seasonality** — weekend volume ~30% of weekday.
4. **Regional language tilt** — EN share rises summer in tourist regions (crete, patras).
5. **Volume concentration** — Attica dominant; intent mix differs internationally.
6. **Segment quality gradient** — premium has highest resolution + CSAT; new has worst.
7. **Behavioral cascades between successive calls** — e.g. auth-failure cascade: users w/ `escalation_triggered=success` on auth call → resolution rate on next call/24h differs from global.
8. **Withheld caller line** → higher escalation.
9. **`>10000` transfer bucket** → elevated escalation.
10. **`fallback_count_acceptable` correlates tightly w/ pain-point intents.**
11. **Language inconsistency** — ~3% `language_consistency=failure`.
12. **LLM-judge disagreement** — `intent_resolved` vs `call_successful` ~5% mismatch (good for "find disagreements" hunts).

Flat trendlines across every metric = team averaged the whole window. Real findings need time/dim slicing.

## 11. Nature of data / gotchas

- Synthetic but realistic-shape. ~10K calls, deterministic seed — every team has identical numbers.
- All `data_collection_results.value` are strings — cast in SQL (`CAST(value AS BOOLEAN)`, etc.).
- `csat_score` only on ~30% of rows — nulls must be excluded, not zeroed.
- `unknown` is a third state for criteria + many fields, not a NaN. Filter explicitly.
- `from_number` may be literal `"anonymous"`.
- Greek values appear in `transcript_summary` + `message`; **column names + enum values stay English** → safe to filter on values like `'el'`.
- Detected `main_language` can differ from declared/preferred — surfaces real bilingual behavior.
- `topic_tags` is a comma-separated string, 0–3 tags — split before grouping.
- `start_time` UTC — convert if reporting in Greek local time.
- Cost computed deterministically from duration — `cost ∝ call_duration_secs`.

## 12. Implication for build

- **SQL surface = small** (1 raw table + 5 views, ~30 columns) → fits in system prompt. No RAG over schema needed.
- **Open-ended queries** ("how is bot doing this week?") → multi-panel spec (KPI row + trend line + top-intents bar).
- **Anomaly hunts** require time-bucketed SQL + comparison-to-baseline logic — embed in prompt as DuckDB capability hint, not as query template.
- **Validation gate**: read-only, SELECT-only, retry on error w/ error text in context (max 3).
- **Greek path**: detect query language, respond in same; SQL stays English; values can be Greek literals.
- **Eat-your-own-dogfood**: golden set should cover all 12 embedded patterns above — those are the "interesting findings" judges will look for.
- **Cross-check metric definitions before shipping** — judges will diff against `metrics_dictionary.md`.

## 13. Highest-leverage dashboard slices (judge bait)

- containment × `bot_version` × week (shows release step-change)
- tool success/latency × `start_date` × intent category (shows incident window)
- CSAT × segment (premium > returning > new)
- intent volume × hour-of-day × dow (seasonality)
- language consistency failures × region
- `intent_resolved` vs `call_successful` disagreement rate (LLM-judge quality)
- escalation × `transfer_amount_bucket` (>10K spike)
- repeat-caller cascade after auth-escalation
