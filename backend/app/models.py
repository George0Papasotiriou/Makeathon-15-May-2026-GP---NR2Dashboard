# camelCase fields mirror the wire format expected by the frontend
# (Recharts / shadcn-chart conventions). Suppress N815 for this file.
# ruff: noqa: N815
from typing import Any, Literal

from pydantic import BaseModel, Field

ChartType = Literal[
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
]


class SeriesConfig(BaseModel):
    dataKey: str
    label: str
    format: Literal["currency", "percentage", "number", "duration", "datetime"] | None = None
    # combo charts: which Y axis this series binds to (default left).
    yAxisId: Literal["left", "right"] | None = None
    # combo charts: per-series renderer choice (default "bar").
    chartKind: Literal["bar", "line", "area"] | None = None
    # box-plot: marks this series as one of the five quartile columns.
    quartile: Literal["min", "q1", "median", "q3", "max"] | None = None


class ChartConfig(BaseModel):
    xAxisKey: str | None = None
    # scatter, heatmap.
    yAxisKey: str | None = None
    # heatmap (cell value), gauge (metric), treemap (size). Defaults to series[0].dataKey.
    valueKey: str | None = None
    # gauge target / threshold tick.
    target: float | None = None
    # gauge upper bound, histogram explicit domain top.
    max: float | None = None
    series: list[SeriesConfig]
    panels: list["ChartSpec"] | None = None


class ChartSpec(BaseModel):
    chartType: ChartType
    title: str
    description: str | None = None
    config: ChartConfig
    sql: str


ChartConfig.model_rebuild()


class QueryRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    conversation_id: str | None = None


class QueryMetadata(BaseModel):
    latency_ms: int
    token_cost: float
    sql_retries: int
    conversation_id: str
    request_id: str
    chart_id: str | None = None


class WidgetPayload(BaseModel):
    """One card on the canvas: spec + executed rows + identity."""
    chart_id: str
    spec: ChartSpec
    data: list[dict[str, Any]]
    panel_data: list[list[dict[str, Any]]] | None = None


class QueryResponse(BaseModel):
    spec: ChartSpec
    data: list[dict[str, Any]]
    explanation: str
    follow_up_hint: str | None = None
    clarification_question: str | None = None
    narrative_html: str | None = None
    metadata: QueryMetadata
    panel_data: list[list[dict[str, Any]]] | None = None
    widgets: list[WidgetPayload] | None = None


# ---------------------------------------------------------------------------
# Editorial (POST /api/editorial)
# ---------------------------------------------------------------------------


class EditorialRequest(BaseModel):
    conversation_id: str = Field(min_length=1)


class EditorialSection(BaseModel):
    number: int
    chart_id: str
    section_kicker: str
    headline: str
    kpi_value: str
    kpi_label: str
    lede: str
    body: str
    insight: str


class EditorialMetadata(BaseModel):
    request_id: str
    conversation_id: str
    chart_count: int
    latency_ms: int
    token_cost_usd: float
    input_tokens: int
    cache_creation_tokens: int
    cache_read_tokens: int
    output_tokens: int


class EditorialResponse(BaseModel):
    title: str
    dek: str
    kicker: str
    sections: list[EditorialSection]
    methodology_note: str
    colophon_stamp: str
    metadata: EditorialMetadata
