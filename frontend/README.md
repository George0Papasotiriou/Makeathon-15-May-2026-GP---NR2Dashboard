# Aperture — Frontend

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript strict · Tailwind v4 · shadcn/ui · Recharts 3.8 · framer-motion.

## Run

```bash
pnpm install
echo NEXT_PUBLIC_BACKEND_URL=http://localhost:8000 > .env.local
pnpm dev          # http://localhost:3000
pnpm build        # production build
pnpm lint
```

## Environment

| Var | Default | Notes |
|---|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | `http://localhost:8000` | URL-validated via zod in `lib/env.ts`. |
| `NEXT_PUBLIC_ENV` | `development` | |
| `NEXT_PUBLIC_LOG_LEVEL` | unset | `debug` \| `info` \| `warn` \| `error`. |

## Layout

```
app/
  page.tsx                Main canvas page. Mints conversation_id, owns widgets state,
                          handles SSE events, triggers editorial overlay.
  layout.tsx, globals.css

components/
  canvas/
    DraggableCanvas.tsx   Pan / zoom / drag / resize / marquee-select / snap surface.
                          Layout persists to localStorage (aperture-layout-v1).
    WidgetTile.tsx        Card chrome (header, intent badge, SQL viewer toggle, actions).
                          inferIntent maps chartType + title keywords to a small badge.
    ChartRenderer.tsx     SpecRenderer: switch(spec.chartType) → primitive.
                          Recursive multi-panel grid.
    ZoomControls.tsx      In/out/fit buttons.
  chat/
    ChatInput.tsx         Input + phase dots + follow-up pill + clarification button.
    SelectedChips.tsx     Popover listing SelectedItem context.
    WelcomeOverlay.tsx
  charts/                 22 primitives. Selection contract in ../docs/CHART_TYPES.md.
    BarChart.tsx          + bar-stacked variant
    HorizontalBarChart.tsx
    LineChart.tsx
    AreaChart.tsx         + area-stacked variant
    ComboChart.tsx        dual-axis composed
    PieChart.tsx          + donut variant
    Treemap.tsx
    ScatterChart.tsx
    KPICard.tsx
    SparklineKPI.tsx
    GaugeChart.tsx        half-circle SVG
    Histogram.tsx
    BoxPlot.tsx           SVG whiskers/box/median
    Heatmap.tsx           SVG grid + color-mix
    FunnelChart.tsx
    RadarChart.tsx
    WaterfallChart.tsx
    DataTable.tsx
  editorial/
    editorial-overlay.tsx Full-screen modal + jsPDF download button.
    editorial-document.tsx Cover, contents, section spreads, methodology page.
    editorial-page.tsx
    editorial.css
  ui/                     shadcn primitives (button, input, dialog, sheet, tooltip, ...).

lib/
  api-client.ts           postQuery, queryStream (SSE async generator),
                          generateEditorial, resetConversation.
  api-types.ts            zod schemas + TS types mirrored from backend Pydantic.
  format.ts               formatValue(v, kind): currency / percentage / number / duration / datetime.
  pdf-export.ts           jsPDF + modern-screenshot — captures every [data-editorial-page]
                          at 2× DPI, composites multi-page A4.
  env.ts                  parseEnv() — fails fast if NEXT_PUBLIC_BACKEND_URL is invalid.
  logger.ts               createLogger(scope) — console wrapper, respects NEXT_PUBLIC_LOG_LEVEL.
  download.ts             Generic blob download helper.
  utils.ts                cn() class merge.
```

## Conversation, follow-ups, clarifications

`app/page.tsx` mints `conversation_id` once via `crypto.randomUUID()`, persists to `localStorage` (`aperture-conversation-id`). Every query sends `{question, conversation_id}` — no client-side history array; the backend owns it.

After each successful turn, `response.follow_up_hint` becomes the suggestion pill above the input. `response.clarification_question` renders as an inline lime button — click prefills the input.

"Clear all" calls `resetConversation(conversationId)` so the backend store also clears.

## Marquee context selection

`DraggableCanvas` exposes a marquee region; on release, `parseLeafItem` walks `[data-selectable]` nodes inside the rect and builds `SelectedItem[]`. Items render as chips in `SelectedChips`. The next query's `question` is prefixed with a context block listing the selections.

Selection-aware chart primitives emit standardized `data-*` attrs (`data-selectable`, `data-kind`, `data-uid`, `data-widget-id`, `data-widget-title`, `data-label`, `data-payload`). The full contract is in [`../docs/CHART_TYPES.md`](../docs/CHART_TYPES.md).

## Editorial

Header "Editorial" button enables after the canvas has ≥ 2 widgets. Click → `generateEditorial(conversationId)` → mount `<EditorialOverlay>`. The overlay scales an A4 document (`zoom: 0.7`) inside a scrollable preview; the download button feeds each `[data-editorial-page]` to `modern-screenshot.domToPng` at 2× DPI, composited into a multi-page jsPDF.

## Adding a new chart type — checklist

1. Add the literal to `ChartType` in `backend/app/models.py`, the tool schema enum in `backend/app/llm/anthropic_client.py`, the docs in `backend/app/prompts/smartrep_voicebot.txt` (selection rule + shape row), and `chartTypeSchema` in `frontend/lib/api-types.ts`.
2. Add any new `ChartConfig` / `SeriesConfig` fields you need to all four locations.
3. Build the primitive under `frontend/components/charts/<Name>.tsx` consuming `{spec, data, widgetId?, widgetTitle?, selectedItems?, onSelectItem?}`. Use `formatValue` for every axis tick / tooltip / KPI display.
4. If the primitive should be selectable, emit the six `data-*` attrs and add the `kind` to `SelectedItem["kind"]` in `api-types.ts` plus `KIND_BADGE` in `SelectedChips.tsx`.
5. Add a `case` in `ChartRenderer.tsx:SpecRenderer`.
6. Optionally extend `WidgetTile.tsx:inferIntent` so the small badge in the header categorizes it (Trend / Distribution / Ranking / KPI).
7. `npx tsc --noEmit && npx next build`.

## Local persistence keys

| Key | Purpose | Lifecycle |
|---|---|---|
| `aperture-conversation-id` | Server-side conversation linkage. | Minted once; replaced only via Clear All. |
| `aperture-widgets-v2` | Canvas widget data. | Bumped from v1 during the ChartSpec migration; v1 ignored. |
| `aperture-layout-v1` | Per-widget positions + sizes for the draggable canvas. | |
| `aperture-interacted-v1` | Whether the user has ever submitted a query. Hides the WelcomeOverlay. | |
```
