"""
Working end-to-end example. Hardcoded routing — no LLM. Demonstrates:
    - connecting to the DuckDB
    - running a query
    - shaping data for a few different chart types
    - returning a chart spec as a Python dict

This is intentionally dumb — a starting point you can crib from, replace, or
ignore entirely. Build whatever shape you want.

Run:
    python starter/demo.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import duckdb

REPO_ROOT = Path(__file__).resolve().parent.parent
DB_PATH = REPO_ROOT / "data" / "conversations.duckdb"


# ---------- a few hand-written handlers ----------

def language_split_pie(db: duckdb.DuckDBPyConnection) -> dict:
    rows = db.execute("""
        SELECT main_language AS label, COUNT(*) AS value
        FROM v_conversations
        GROUP BY 1
        ORDER BY 2 DESC
    """).fetchall()
    return {
        "chart_type": "pie",
        "title": "Calls by main language",
        "explanation": "Pie chart of the share of calls in each language. The data is two categorical buckets — a pie or donut is the natural choice.",
        "data": [{"label": l, "value": v} for l, v in rows],
        "sql": "SELECT main_language, COUNT(*) FROM v_conversations GROUP BY 1",
    }


def top_intents_bar(db: duckdb.DuckDBPyConnection, n: int = 10) -> dict:
    rows = db.execute(f"""
        SELECT detected_intent AS label, COUNT(*) AS value
        FROM v_turns
        WHERE role = 'user' AND detected_intent IS NOT NULL
        GROUP BY 1
        ORDER BY value DESC
        LIMIT {n}
    """).fetchall()
    return {
        "chart_type": "bar",
        "title": f"Top {n} intents by call volume",
        "explanation": "Bar chart, sorted descending, for a ranking of many categorical values. Pie would be unreadable with this many slices.",
        "data": [{"label": l, "value": v} for l, v in rows],
    }


def daily_volume_line(db: duckdb.DuckDBPyConnection) -> dict:
    rows = db.execute("""
        SELECT start_date AS x, COUNT(*) AS y
        FROM v_conversations
        GROUP BY 1
        ORDER BY 1
    """).fetchall()
    return {
        "chart_type": "line",
        "title": "Daily call volume",
        "explanation": "Line chart because the x-axis is continuous time. A bar chart would also work but line emphasizes trend.",
        "data": [{"x": str(d), "y": v} for d, v in rows],
    }


def csat_kpi(db: duckdb.DuckDBPyConnection) -> dict:
    row = db.execute("""
        SELECT
            ROUND(AVG(csat_score), 2) AS avg_csat,
            COUNT(csat_score) AS responses,
            COUNT(*) AS total_calls
        FROM v_conversations
    """).fetchone()
    avg, resp, total = row
    return {
        "chart_type": "kpi",
        "title": "Average CSAT",
        "explanation": f"Single-value KPI. CSAT is collected on ~{round(100*resp/total)}% of calls — nulls excluded from the average.",
        "data": {"value": avg, "responses": resp, "total_calls": total},
    }


# ---------- toy dispatcher (REPLACE with your LLM logic) ----------

def hardcoded_dispatch(query: str) -> str:
    q = query.lower()
    if "greek" in q or "english" in q or "language" in q or "ελλην" in q.lower():
        return "language"
    if "top" in q and "intent" in q:
        return "top_intents"
    if "daily" in q and ("volume" in q or "call" in q):
        return "daily_volume"
    if "csat" in q:
        return "csat"
    return "unknown"


def generate_dashboard(query: str, db_path: str) -> dict:
    """Hardcoded version. Replace with LLM-driven routing in starter.py."""
    con = duckdb.connect(db_path, read_only=True)
    action = hardcoded_dispatch(query)
    if action == "language":
        return language_split_pie(con)
    if action == "top_intents":
        return top_intents_bar(con)
    if action == "daily_volume":
        return daily_volume_line(con)
    if action == "csat":
        return csat_kpi(con)
    # Fallback — return a generic table
    rows = con.execute("SELECT main_language, COUNT(*) FROM v_conversations GROUP BY 1").fetchall()
    return {
        "chart_type": "table",
        "title": "Fallback",
        "explanation": "Couldn't classify the query. Returning a generic summary table.",
        "data": [{"label": l, "value": v} for l, v in rows],
    }


# ---------- demo run ----------

def main():
    if not DB_PATH.exists():
        sys.stderr.write(
            f"DuckDB not found at {DB_PATH}. "
            f"The dataset is pre-built — make sure data/conversations.duckdb is present in the repo.\n"
        )
        sys.exit(1)

    test_queries = [
        "Show me a pie chart of Greek vs English callers",
        "Top 10 intents by volume",
        "Daily call volume",
        "What is our average CSAT?",
        "Something I didn't write a handler for",
    ]

    for q in test_queries:
        print(f"\n>>> {q}")
        out = generate_dashboard(q, str(DB_PATH))
        print(f"    chart_type: {out['chart_type']}")
        print(f"    title:      {out.get('title', '')}")
        print(f"    rows/data:  {len(out['data']) if hasattr(out['data'], '__len__') else out['data']}")
        if "explanation" in out:
            print(f"    why:        {out['explanation']}")


if __name__ == "__main__":
    main()
