"""
NR2Dashboard — FastAPI application.
Natural-language → SQL → Chart pipeline for banking voicebot analytics.
"""

import logging
import time
import uuid
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.database import execute_query, validate_sql_safety, get_table_info
from app.llm import query_llm
from app.models import QueryRequest, QueryResponse, WidgetData, ChartSpec

# Load environment
load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- App setup -----------------------------------------------------------------

app = FastAPI(
    title="LARPGODS NR2 Dashboard",
    description="Natural-language to dashboard — ask your data anything.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files (frontend)
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


# --- Routes --------------------------------------------------------------------

@app.get("/")
async def serve_frontend():
    """Serve the main frontend HTML."""
    index_path = STATIC_DIR / "index.html"
    if not index_path.exists():
        raise HTTPException(status_code=404, detail="Frontend not found")
    return FileResponse(str(index_path))


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    try:
        tables = get_table_info()
        return {"status": "healthy", "tables": tables}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}


@app.get("/api/demo", response_model=QueryResponse)
async def demo_widgets():
    """
    Return pre-built widgets using direct SQL — no LLM needed.
    Useful for testing chart rendering and demoing without API key.
    """
    start_time = time.time()
    widgets = []

    demo_queries = [
        {
            "sql": "SELECT main_language AS language, COUNT(*) AS calls FROM v_conversations GROUP BY 1 ORDER BY 2 DESC",
            "chart": {"type": "pie", "title": "Calls by Language", "size": "1x1", "label_field": "language", "value_field": "calls"},
            "explanation": "Greek dominates at ~85% of call volume, with English making up the remaining ~15%.",
        },
        {
            "sql": "SELECT ROUND(AVG(csat_score), 2) AS avg_csat FROM v_conversations WHERE csat_score IS NOT NULL",
            "chart": {"type": "kpi", "title": "Average CSAT", "subtitle": "Customer Satisfaction Score", "size": "1x1", "value_field": "avg_csat"},
            "explanation": "Average CSAT across all surveyed calls.",
        },
        {
            "sql": "SELECT ROUND(COUNT(*) FILTER (WHERE call_successful = 'success') * 100.0 / COUNT(*), 1) AS containment_rate FROM v_conversations",
            "chart": {"type": "kpi", "title": "Containment Rate", "subtitle": "% resolved without escalation", "size": "1x1", "value_field": "containment_rate"},
            "explanation": "Share of calls fully resolved by the bot without human handoff.",
        },
        {
            "sql": "SELECT start_date, COUNT(*) AS calls FROM v_conversations GROUP BY 1 ORDER BY 1",
            "chart": {"type": "line", "title": "Daily Call Volume", "subtitle": "90-day trend", "size": "2x2", "x_field": "start_date", "y_field": "calls"},
            "explanation": "Daily inbound call volume showing weekday/weekend seasonality and overall trends.",
        },
        {
            "sql": """SELECT detected_intent AS intent, COUNT(*) AS calls
                      FROM v_turns WHERE role = 'user' AND detected_intent IS NOT NULL
                      GROUP BY 1 ORDER BY 2 DESC LIMIT 10""",
            "chart": {"type": "bar", "title": "Top 10 Intents", "size": "2x1", "x_field": "intent", "y_field": "calls"},
            "explanation": "Most common customer intents by call volume.",
        },
        {
            "sql": """SELECT segment, ROUND(AVG(csat_score), 2) AS avg_csat
                      FROM v_conversations WHERE csat_score IS NOT NULL
                      GROUP BY 1 ORDER BY 2 DESC""",
            "chart": {"type": "bar", "title": "CSAT by Segment", "size": "2x1", "x_field": "segment", "y_field": "avg_csat"},
            "explanation": "Premium customers show the highest satisfaction, while new customers score lowest.",
        },
    ]

    for dq in demo_queries:
        try:
            result = execute_query(dq["sql"])
            chart_raw = dq["chart"]
            widgets.append(WidgetData(
                id=str(uuid.uuid4())[:8],
                chart=ChartSpec(
                    type=chart_raw.get("type", "table"),
                    title=chart_raw.get("title", "Result"),
                    subtitle=chart_raw.get("subtitle"),
                    size=chart_raw.get("size", "2x1"),
                    x_field=chart_raw.get("x_field"),
                    y_field=chart_raw.get("y_field"),
                    series_field=chart_raw.get("series_field"),
                    label_field=chart_raw.get("label_field"),
                    value_field=chart_raw.get("value_field"),
                ),
                data=result["rows"],
                columns=result["columns"],
                sql=dq["sql"],
                explanation=dq["explanation"],
            ))
        except Exception as e:
            logger.error(f"Demo query failed: {e}")

    elapsed = int((time.time() - start_time) * 1000)
    for w in widgets:
        w.latency_ms = elapsed

    return QueryResponse(widgets=widgets, total_latency_ms=elapsed)


@app.post("/api/query", response_model=QueryResponse)
async def handle_query(request: QueryRequest):
    """
    Main pipeline: question → LLM → SQL → DuckDB → chart spec + data.
    Includes retry logic (up to 3 attempts on SQL errors).
    """
    start_time = time.time()
    widgets = []
    max_retries = 3
    retry_context = None

    try:
        # Step 1: Call LLM to get SQL + chart spec
        for attempt in range(max_retries):
            try:
                llm_response = await query_llm(
                    question=request.question,
                    conversation_history=request.conversation_history,
                    retry_context=retry_context,
                )

                # Handle the response — could be single panel or multi-panel
                panels = llm_response.get("panels", [llm_response])

                # If panels is empty, wrap the response as a single panel
                if not panels:
                    panels = [llm_response]

                for panel in panels:
                    sql = panel.get("sql")
                    chart_raw = panel.get("chart", {})
                    explanation = panel.get("explanation", "")

                    if not sql:
                        # LLM says it can't answer — return explanation only
                        widgets.append(WidgetData(
                            id=str(uuid.uuid4())[:8],
                            chart=ChartSpec(
                                type="kpi",
                                title="Info",
                                size="2x1",
                            ),
                            data=[{"message": explanation}],
                            columns=["message"],
                            sql="",
                            explanation=explanation,
                            follow_up=panel.get("follow_up"),
                        ))
                        continue

                    # Step 2: Validate + execute SQL
                    is_safe, reason = validate_sql_safety(sql)
                    if not is_safe:
                        raise ValueError(f"SQL safety check failed: {reason}")

                    result = execute_query(sql)

                    # Step 3: Build widget
                    chart_spec = ChartSpec(
                        type=chart_raw.get("type", "table"),
                        title=chart_raw.get("title", "Result"),
                        subtitle=chart_raw.get("subtitle"),
                        size=chart_raw.get("size", "2x1"),
                        x_field=chart_raw.get("x_field"),
                        y_field=chart_raw.get("y_field"),
                        series_field=chart_raw.get("series_field"),
                        label_field=chart_raw.get("label_field"),
                        value_field=chart_raw.get("value_field"),
                        sort_direction=chart_raw.get("sort_direction"),
                        show_trend=chart_raw.get("show_trend"),
                        color_scheme=chart_raw.get("color_scheme"),
                    )

                    widgets.append(WidgetData(
                        id=str(uuid.uuid4())[:8],
                        chart=chart_spec,
                        data=result["rows"],
                        columns=result["columns"],
                        sql=sql,
                        explanation=explanation,
                        follow_up=panel.get("follow_up") or llm_response.get("follow_up"),
                    ))

                # If we got here, all panels succeeded
                break

            except ValueError as e:
                # SQL error — retry with error context
                retry_context = str(e)
                logger.warning(f"Attempt {attempt + 1} failed: {e}")
                if attempt == max_retries - 1:
                    raise
                widgets.clear()  # Clear partial results before retry

    except Exception as e:
        logger.error(f"Pipeline error: {e}")
        elapsed = int((time.time() - start_time) * 1000)
        return QueryResponse(
            widgets=[],
            total_latency_ms=elapsed,
            error=str(e),
        )

    elapsed = int((time.time() - start_time) * 1000)

    # Set latency on each widget
    for w in widgets:
        w.latency_ms = elapsed

    return QueryResponse(
        widgets=widgets,
        total_latency_ms=elapsed,
    )


# --- Dev entry point -----------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
