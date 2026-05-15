"""
Pydantic models for API request/response types.
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# --- Request -------------------------------------------------------------------

class QueryRequest(BaseModel):
    """Incoming user query."""
    question: str = Field(..., min_length=1, max_length=2000)
    conversation_history: List[Dict[str, str]] = Field(default_factory=list)


# --- Chart spec (what the LLM returns) -----------------------------------------

class ChartSpec(BaseModel):
    """Chart specification emitted by the LLM."""
    type: str = Field(..., description="bar|line|area|pie|kpi|table")
    title: str
    subtitle: Optional[str] = None
    size: str = Field(default="2x1", description="Bento tile size: 1x1|2x1|1x2|2x2")
    x_field: Optional[str] = None
    y_field: Optional[str] = None
    series_field: Optional[str] = None
    label_field: Optional[str] = None
    value_field: Optional[str] = None
    sort_direction: Optional[str] = None
    show_trend: Optional[bool] = None
    color_scheme: Optional[str] = None


# --- LLM response (parsed from JSON) ------------------------------------------

class LLMResponse(BaseModel):
    """Parsed response from the LLM."""
    sql: Optional[str] = None
    chart: ChartSpec
    explanation: str
    follow_up: Optional[str] = None
    clarification: Optional[str] = None


class MultiPanelResponse(BaseModel):
    """For open-ended queries that need multiple widgets."""
    panels: List[LLMResponse]
    explanation: str
    follow_up: Optional[str] = None


# --- API response (sent to frontend) ------------------------------------------

class WidgetData(BaseModel):
    """A single widget to render on the Bento grid."""
    id: str
    chart: ChartSpec
    data: List[Dict[str, Any]]
    columns: List[str]
    sql: str
    explanation: str
    follow_up: Optional[str] = None
    latency_ms: int = 0


class QueryResponse(BaseModel):
    """Full API response with one or more widgets."""
    widgets: List[WidgetData]
    total_latency_ms: int = 0
    error: Optional[str] = None
