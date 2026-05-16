# Chart Types

The LLM picks `chartType` based on the user's question and emits one `chart_spec` per turn. The frontend renderer (`frontend/components/canvas/ChartRenderer.tsx:SpecRenderer`) routes to a primitive in `frontend/components/charts/`.

This doc is the single source of truth for:
- **When** the LLM should pick each type (selection rules also live in `backend/app/prompts/smartrep_voicebot.txt`, `[CHART SELECTION GUIDE]`).
- **The exact SQL row shape** each type expects.
- **What config fields** apply per type.
- **Which types are selectable** (marquee + click → SelectedChips context).

The system prompt embeds a condensed version of the shape table below so the LLM has it at call time.

---

## Picker rules (LLM-facing)

| Intent | Pick | Why |
|---|---|---|
| Single number | `kpi` | One scalar, no trend. |
| Single number + recent trend | `sparkline-kpi` | Headline + inline sparkline. |
| Single number vs target | `gauge` | Use when user names a target / SLA / threshold. |
| Trend over time, one or many series | `line` | Default time series. |
| Trend with volume emphasis | `area`, `area-stacked` | When magnitude matters. |
| Rate AND volume on one chart | `combo` | Twin Y axes (`yAxisId: "left" | "right"`). |
| Period-over-period delta | `waterfall` | Cost decomposition, churn breakdown. |
| Ranking with short labels | `bar`, `bar-stacked` | Categorical. |
| Ranking with long labels (intent names, error reasons) | `horizontal-bar` | Avoids axis-tick truncation. |
| Multi-dimension entity compare | `radar` | ≥2 entities, ≥3 axes. |
| Distribution of one numeric column | `histogram` | Backend SQL emits one row per bin. |
| Distribution per group | `box-plot` | Quartiles via `QUANTILE_CONT`. |
| 2D matrix (hour×day, intent×region) | `heatmap` | Cap dims to ≤24×7. |
| Part of whole, ≤6 categories | `pie`, `donut` | |
| Part of whole, ≥7 categories | `treemap` | Pie/donut becomes illegible at scale. |
| Correlation / anomaly hunt | `scatter` | Two numeric columns. |
| Conversion stages | `funnel` | Ordered drop-off. |
| Raw row detail | `table` | When nothing aggregates well. |
| Open-ended health check | `multi-panel` | Each sub-panel emits its own SQL. |

---

## Shape contract per chartType

The frontend matches column names from SQL output to `xAxisKey` / `yAxisKey` / `valueKey` / `series[].dataKey` **case-sensitive**. Use explicit aliases in the SELECT.

### `kpi`
- **SQL**: one row, one metric column.
- **Config**: `series[0] = {dataKey: <metric-col>, label, format?}`.
- **Renderer**: `KPICard`. Selection: yes (`kind="kpi"`).
- **Example**: `SELECT COUNT(*) AS total FROM v_conversations`.

### `sparkline-kpi`
- **SQL**: `{x_value, metric}` ordered ASC. Last row = headline.
- **Config**: `xAxisKey = x_value`, `series[0] = {dataKey: metric}`.
- **Renderer**: `SparklineKPI`. Selection: yes (`kind="kpi"`).
- **Example**: `SELECT DATE_TRUNC('day', start_time) AS day, AVG(success::INT) AS rate FROM v_conversations GROUP BY day ORDER BY day`.

### `gauge`
- **SQL**: one row `{value [, target, max]}`.
- **Config**: `valueKey` (or `series[0].dataKey`) for metric, optional `target`, `max`.
- **Renderer**: `GaugeChart` — half-circle SVG arc. Selection: no.
- **Example**: `SELECT 0.82 AS value, 0.80 AS target`.

### `bar`, `bar-stacked`
- **SQL**: `{category, metric1 [, metric2, ...]}`.
- **Config**: `xAxisKey = category`, `series[]` per metric.
- **Renderer**: `BarChart` (stacked toggles `stackId`). Selection: yes (`kind="bar"`).
- **Note (R15)**: don't add a 2nd series for the count when the user asked for a single rate.

### `horizontal-bar`
- **SQL**: `{category, metric}` already sorted descending.
- **Config**: `xAxisKey = category`, `series[0] = {dataKey: metric}`.
- **Renderer**: `HorizontalBarChart`. Selection: yes (`kind="bar"`).
- **Best for**: long category labels (`top intents`, `top error reasons`).

### `line`, `area`, `area-stacked`
- **SQL**: `{x_value, metric1 [, metric2, ...]}`.
- **Config**: `xAxisKey = x_value`, `series[]` per metric.
- **Renderer**: `LineChart`, `AreaChart` (stacked uses `stackId`). Selection: no.

### `combo`
- **SQL**: `{x_value, series1, series2, ...}`.
- **Config**: each `series[i]` declares its own `chartKind` (`bar` / `line` / `area`) and `yAxisId` (`left` / `right`). Series sharing units must share an axis.
- **Renderer**: `ComboChart` (recharts `ComposedChart`). Selection: no.
- **Use when**: rate + volume on one chart ("containment rate AND volume by week"). The right axis renders only if at least one series has `yAxisId: "right"`.

### `pie`, `donut`
- **SQL**: `{label, value}`. Keep ≤6 rows or switch to `treemap`.
- **Config**: `xAxisKey = label`, `series[0].dataKey = value`.
- **Renderer**: `PieChart` (donut sets inner radius). Selection: yes (`kind="slice"`).

### `treemap`
- **SQL**: `{name, value}`.
- **Config**: `xAxisKey = name`, `valueKey = value` (or `series[0].dataKey`).
- **Renderer**: `Treemap`. Selection: yes (`kind="tile"`).

### `scatter`
- **SQL**: `{x_value, y_value}` (label optional).
- **Config**: `xAxisKey`, `yAxisKey`. Optional `series[i].format` for axis ticks.
- **Renderer**: `ScatterChart`. Selection: yes (`kind="point"`).
- **Use when**: correlations, anomaly hunts. Outliers stand out visually.

### `histogram`
- **SQL**: one row per bin. Backend computes bins, not the renderer.
  ```sql
  SELECT
    CASE
      WHEN call_duration_secs < 30 THEN '<30s'
      WHEN call_duration_secs < 60 THEN '30-60s'
      WHEN call_duration_secs < 120 THEN '1-2m'
      ELSE '>2m'
    END AS bin_label,
    COUNT(*) AS count,
    MIN(call_duration_secs) AS bin_order
  FROM v_conversations
  GROUP BY bin_label, bin_order
  ORDER BY bin_order
  ```
- **Config**: `xAxisKey = bin_label`, `series[0] = {dataKey: "count"}`.
- **Renderer**: `Histogram` (tight-gap bars). Selection: no.

### `box-plot`
- **SQL**: `{group, min, q1, median, q3, max}` per group via DuckDB:
  ```sql
  SELECT
    customer_segment AS group,
    MIN(csat_score) AS min,
    QUANTILE_CONT(csat_score, 0.25) AS q1,
    MEDIAN(csat_score) AS median,
    QUANTILE_CONT(csat_score, 0.75) AS q3,
    MAX(csat_score) AS max
  FROM v_conversations
  WHERE csat_score IS NOT NULL
  GROUP BY customer_segment
  ```
- **Config**: `xAxisKey = group`, then 5 `series` entries each tagged with the matching `quartile`:
  ```json
  "series": [
    {"dataKey": "min",    "label": "Min",    "quartile": "min"},
    {"dataKey": "q1",     "label": "Q1",     "quartile": "q1"},
    {"dataKey": "median", "label": "Median", "quartile": "median"},
    {"dataKey": "q3",     "label": "Q3",     "quartile": "q3"},
    {"dataKey": "max",    "label": "Max",    "quartile": "max"}
  ]
  ```
- **Renderer**: `BoxPlot` (pure SVG whiskers / box / median line). Selection: no.

### `heatmap`
- **SQL**: one row per cell `{x_value, y_value, value}`. Cap dims ≤24 × 7 to stay legible.
  ```sql
  SELECT
    EXTRACT(HOUR FROM start_time) AS hour,
    DAYNAME(start_time) AS day,
    COUNT(*) AS volume
  FROM v_conversations
  GROUP BY hour, day
  ```
- **Config**: `xAxisKey = hour`, `yAxisKey = day`, `valueKey = volume` (or set `series[0].dataKey = "volume"`).
- **Renderer**: `Heatmap` (custom SVG grid, color-mix interpolation). Selection: yes (`kind="cell"`).

### `funnel`
- **SQL**: `{stage, value}` ordered by funnel position. Synthesize a sort column if needed.
- **Config**: `xAxisKey = stage`, `valueKey = value`.
- **Renderer**: `FunnelChart`. Selection: yes (`kind="stage"`).

### `radar`
- **SQL**: one row per axis, one column per compared entity.
  ```sql
  -- compare bot v2.2.1 and v2.3.0 across 4 metrics
  WITH base AS (
    SELECT bot_version, ...
  )
  SELECT axis, ...
  ```
- **Config**: `xAxisKey = axis`, `series[]` per entity column.
- **Renderer**: `RadarChart`. Selection: no.

### `waterfall`
- **SQL**: `{label, delta [, is_total]}` ordered. Mark cumulative bars with `is_total = true`.
- **Config**: `xAxisKey = label`, `series[0] = {dataKey: "delta"}`.
- **Renderer**: `WaterfallChart` (running stacked bars on `ComposedChart`). Selection: no.

### `table`
- **SQL**: anything.
- **Config**: any (columns derived from `data[0]`).
- **Renderer**: `DataTable`. Selection: yes (`kind="row"`).

### `multi-panel`
- **Top-level `sql`**: `""` (or null). Top-level `data`: `[]`.
- **Each panel** in `config.panels[]` has its own `chartType`, `title`, `sql`, `config` — they are validated and executed **independently**. Results land in `panel_data[i]` aligned to `panels[i]`.
- **Frontend** routes each panel through `SpecRenderer` recursively with `panel_data[i]` as its own dataset.
- **Use when**: open-ended health checks ("how is the bot doing?"). 3–5 sub-panels covering KPI + trend + breakdown is the sweet spot.

---

## Selection — `data-*` attribute contract

Selectable charts emit standardized attributes that `DraggableCanvas.tsx:parseLeafItem` and `:buildWidgetItem` consume to build `SelectedItem[]`. Marquee selection scans `[data-selectable]` nodes inside the marquee rect.

| Chart | `data-kind` | `data-uid` |
|---|---|---|
| `bar`, `bar-stacked`, `horizontal-bar` | `bar` | `<widgetId>:bar:<xVal>` |
| `pie`, `donut` | `slice` | `<widgetId>:slice:<labelVal>` |
| `kpi`, `sparkline-kpi` | `kpi` | `<widgetId>:kpi` |
| `table` | `row` | `<widgetId>:row:<index>` |
| `scatter` | `point` | `<widgetId>:point:<xVal>:<yVal>` |
| `heatmap` | `cell` | `<widgetId>:cell:<xVal>|<yVal>` |
| `funnel` | `stage` | `<widgetId>:stage:<stageVal>` |
| `treemap` | `tile` | `<widgetId>:tile:<nameVal>` |

In a multi-panel widget, sub-panels render with `widgetId = "<parent-widget-id>:panel-<index>"`. `WidgetTile` filters `selectedItems` by `s.widgetId === widget.id || s.widgetId.startsWith("<widget.id>:")` so sub-panel selections still belong to the parent card.

Non-selectable: `line`, `area`, `area-stacked`, `combo`, `histogram`, `box-plot`, `waterfall`, `gauge`, `radar`.

---

## Format kinds

All axis ticks, tooltip labels, and KPI displays funnel through `frontend/lib/format.ts:formatValue(value, kind)`.

| `format` | Behavior |
|---|---|
| `"currency"` | EUR with 2 max fraction digits. |
| `"percentage"` | Auto-scales: ≤1 treated as ratio (×100), >1 treated as already-%. Always shown with 1 fraction digit + `%`. |
| `"number"` | Locale `Intl.NumberFormat`. ≥1000 shown as integer; else 2 fraction digits. |
| `"duration"` | Seconds → `Xs` if <60 else `Xm Ys`. |
| `"datetime"` | Pass-through for ISO strings; else `Date.toLocaleDateString()`. |
| `undefined` | Falls back to `"number"`. |

The LLM should set `format` per series in the spec so the Y axis ticks and tooltips render meaningfully — `percentage` instead of `0.82`, `duration` instead of `123` seconds, `currency` instead of `1234`.
