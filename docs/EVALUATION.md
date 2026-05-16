# Evaluation

## Methodology

A curated **golden set** of 30–50 `(question, ground-truth-SQL, expected-chart-type)` triples covering:

- Five question families: distribution, trend, ranking, anomaly, open-ended.
- Both languages: English, Greek (EN/GR parity is a tracked metric).
- The 12 embedded patterns in `devdocs/DATA_OUTLINE.md` §10.

The runner (`eval/run_eval.py`, not yet committed) iterates the set, posts to `POST /api/query` against a fresh `conversation_id` per case, and logs per-row metrics. Multi-panel queries are flattened: each panel's SQL evaluated independently against ground-truth or marked "open-ended" if no exact SQL match.

## Metrics

| Metric | Definition |
|---|---|
| SQL validity | `sqlglot` parse + DuckDB `EXPLAIN` + actual execute succeed without raising. |
| Result correctness | Key result columns match ground-truth row-set (set equality on the row-tuples, sorted by all columns). Binary. |
| Chart-type appropriateness | `response.spec.chartType ∈ accepted_types[case]`. Binary. Accepted types is a small whitelist per case, not strict equality, because e.g. `bar` ↔ `horizontal-bar` are both fine for "top intents". |
| Median latency | End-to-end p50 across the set, ms. |
| EN/GR parity | Per-metric delta between English and Greek subsets. |
| Hallucination rate | LLM references columns or values not in the verified schema. Caught by `sql/validator.py` EXPLAIN. |
| Token cost (USD) | `response.metadata.token_cost`, summed across the run. Per-model rates in `routes/query.py:_MODEL_RATES_USD_PER_M`. |

## Results

_(populate after the first eval run)_

| Bucket | SQL valid | Result correct | Chart type | p50 latency | Notes |
|---|---|---|---|---|---|
| Distribution | — | — | — | — | |
| Trend | — | — | — | — | |
| Ranking | — | — | — | — | |
| Anomaly | — | — | — | — | |
| Open-ended | — | — | — | — | Multi-panel; chart-type metric uses panel-major scoring. |
| Greek | — | — | — | — | |
| Overall | — | — | — | — | |

## Anchor queries (target patterns)

These cover the embedded patterns from `devdocs/DATA_OUTLINE.md` §10:

- "Compare containment rate by bot version per week" → step-change v2.2.1 → v2.3.0 (combo or line, two series by `bot_version`).
- "Tool latency p95 by day for transfer intents" → incident-window spike (line).
- "CSAT by segment" → premium > returning > new gradient (bar).
- "Language consistency failures by region" → ~3 % rate, regional skew (bar / heatmap).
- "intent_resolved vs call_successful disagreement rate" → ~5 % LLM-judge mismatch (kpi or sparkline-kpi).
- "How is the bot doing?" → multi-panel (kpi + line + donut + bar).
- "Distribution of call duration" → histogram.
- "CSAT by segment with outliers" → box-plot.
- "Calls by hour of day and day of week" → heatmap.
- "Top 10 intents by escalation" → horizontal-bar.
- "AHT vs CSAT" → scatter.
- "Call → routed → resolved → CSAT positive" → funnel.

## Cost & speed expectations (Claude Sonnet 4.6, cached system prompt)

- First turn in a fresh process (cache miss): ~$0.03 + ~2.5 s.
- Subsequent turns within 5 min (cache hit): ~$0.006 + ~1.8 s.
- Multi-panel: N LLM calls? No — single LLM call emits all panels. Cost scales with number of panel SQLs only via `latency_ms` (each panel runs through DuckDB).
- Editorial: ~$0.02 + ~3-5 s for a 3-section briefing, dominated by output tokens.

Switch to Opus 4.7 (`ANTHROPIC_MODEL=claude-opus-4-7`) for tougher analytical questions at ~5× cost. Switch to Haiku 4.5 (`claude-haiku-4-5-20251001`) for cheap smoke testing.
