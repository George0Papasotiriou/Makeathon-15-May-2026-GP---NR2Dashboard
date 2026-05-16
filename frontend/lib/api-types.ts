import { z } from "zod";

// Helper: optional string field tolerant of `null` from Pydantic (which
// emits null for absent optional values). Normalizes to undefined in TS.
const optionalString = () =>
  z
    .string()
    .nullable()
    .optional()
    .transform((v) => v ?? undefined);

const seriesFormatSchema = z.enum([
  "currency",
  "percentage",
  "number",
  "duration",
  "datetime",
]);

const yAxisIdSchema = z.enum(["left", "right"]);
const chartKindSchema = z.enum(["bar", "line", "area"]);
const quartileSchema = z.enum(["min", "q1", "median", "q3", "max"]);

const seriesConfigSchema = z.object({
  dataKey: z.string(),
  label: z.string(),
  format: seriesFormatSchema
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
  yAxisId: yAxisIdSchema
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
  chartKind: chartKindSchema
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
  quartile: quartileSchema
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
});

const chartTypeSchema = z.enum([
  "bar",
  "bar-stacked",
  "horizontal-bar",
  "line",
  "area",
  "area-stacked",
  "combo",
  "pie",
  "treemap",
  "kpi",
  "sparkline-kpi",
  "gauge",
  "histogram",
  "box-plot",
  "heatmap",
  "funnel",
  "radar",
  "waterfall",
  "table",
  "multi-panel",
]);

export type ChartConfig = {
  xAxisKey?: string;
  yAxisKey?: string;
  valueKey?: string;
  target?: number;
  max?: number;
  series: Array<z.infer<typeof seriesConfigSchema>>;
  panels?: ChartSpec[];
};

export type ChartSpec = {
  chartType: z.infer<typeof chartTypeSchema>;
  title: string;
  description?: string;
  config: ChartConfig;
  sql: string;
};

const chartSpecSchema: z.ZodType<ChartSpec> = z.lazy(() =>
  z.object({
    chartType: chartTypeSchema,
    title: z.string(),
    description: optionalString(),
    config: chartConfigSchema,
    sql: z.string(),
  }),
);

const chartConfigSchema: z.ZodType<ChartConfig> = z.lazy(() =>
  z.object({
    xAxisKey: optionalString(),
    yAxisKey: optionalString(),
    valueKey: optionalString(),
    target: z
      .number()
      .nullable()
      .optional()
      .transform((v) => v ?? undefined),
    max: z
      .number()
      .nullable()
      .optional()
      .transform((v) => v ?? undefined),
    series: z.array(seriesConfigSchema),
    panels: z
      .array(chartSpecSchema)
      .nullable()
      .optional()
      .transform((v) => v ?? undefined),
  }),
);

const widgetPayloadSchema = z.object({
  chart_id: z.string(),
  spec: chartSpecSchema,
  data: z.array(z.record(z.string(), z.unknown())),
  panel_data: z
    .array(z.array(z.record(z.string(), z.unknown())))
    .nullable()
    .optional(),
});

export const queryResponseSchema = z.object({
  spec: chartSpecSchema,
  data: z.array(z.record(z.string(), z.unknown())),
  explanation: z.string(),
  follow_up_hint: z.string().nullable().optional(),
  clarification_question: z.string().nullable().optional(),
  narrative_html: z.string().nullable().optional(),
  metadata: z.object({
    latency_ms: z.number(),
    token_cost: z.number(),
    sql_retries: z.number(),
    conversation_id: z.string(),
    request_id: z.string(),
    chart_id: z.string().nullable().optional(),
  }),
  panel_data: z
    .array(z.array(z.record(z.string(), z.unknown())))
    .nullable()
    .optional(),
  widgets: z.array(widgetPayloadSchema).nullable().optional(),
});

export type QueryResponse = z.infer<typeof queryResponseSchema>;

// ---------------------------------------------------------------------------
// Editorial (POST /api/editorial)
// ---------------------------------------------------------------------------

export const EditorialSectionSchema = z.object({
  number: z.number(),
  chart_id: z.string(),
  section_kicker: z.string(),
  headline: z.string(),
  kpi_value: z.string(),
  kpi_label: z.string(),
  lede: z.string(),
  body: z.string(),
  insight: z.string(),
});

export const EditorialResponseSchema = z.object({
  title: z.string(),
  dek: z.string(),
  kicker: z.string(),
  sections: z.array(EditorialSectionSchema),
  methodology_note: z.string(),
  colophon_stamp: z.string(),
  metadata: z.object({
    request_id: z.string(),
    conversation_id: z.string(),
    chart_count: z.number(),
    latency_ms: z.number(),
    token_cost_usd: z.number(),
  }),
});

export type EditorialSection = z.infer<typeof EditorialSectionSchema>;
export type EditorialResponse = z.infer<typeof EditorialResponseSchema>;

// ---------------------------------------------------------------------------
// Canvas-side types (canvas widget shape, selection, SSE events).
// ---------------------------------------------------------------------------

/** Widget as the canvas holds it: derived from a QueryResponse. */
export type WidgetData = {
  id: string;
  spec: ChartSpec;
  data: Array<Record<string, unknown>>;
  columns: string[];
  sql: string;
  explanation: string;
  follow_up?: string;
  clarification?: string;
  latency_ms: number;
  panelData?: Array<Array<Record<string, unknown>>>;
};

/** Shape accepted by editorial-document for rendering charts inside the
 *  editorial overlay. Mirrors the minimum surface needed. */
export type ChartCardData = {
  chartId: string;
  spec: ChartSpec;
  data: Array<Record<string, unknown>>;
};

/** A user-selected element (row, bar, slice, kpi, or whole widget) used
 *  as context for the next question. */
export type SelectedItem = {
  uid: string;
  widgetId: string;
  widgetTitle: string;
  kind:
    | "row"
    | "bar"
    | "slice"
    | "kpi"
    | "widget"
    | "point"
    | "cell"
    | "stage"
    | "tile";
  label: string;
  payload: unknown;
};

/** SSE events emitted by POST /api/query/stream. */
export type StreamEvent =
  | { kind: "start"; question: string }
  | { kind: "sql_start"; widgetIndex: number; widgetId: string }
  | { kind: "sql"; widgetIndex: number; ch: string }
  | { kind: "sql_end"; widgetIndex: number }
  | { kind: "done"; payload: QueryResponse }
  | { kind: "error"; error: string };
