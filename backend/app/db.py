from pathlib import Path

import duckdb

from app.logger import get_logger
from app.settings import settings

log = get_logger("db")

_connection: duckdb.DuckDBPyConnection | None = None


def get_db() -> duckdb.DuckDBPyConnection:
    """Return the singleton DuckDB connection."""
    global _connection
    if _connection is None:
        path = settings.DUCKDB_PATH
        if not Path(path).exists():
            log.error("DuckDB file not found", extra={"path": str(path)})
            raise FileNotFoundError(f"DuckDB file missing: {path}")
        _connection = duckdb.connect(str(path), read_only=True)
        log.info("DuckDB connection opened", extra={"path": str(path)})
    return _connection


def verify_connection() -> None:
    """Run at startup. Confirms the 5 flat views exist."""
    conn = get_db()
    expected_views = {
        "v_conversations",
        "v_turns",
        "v_evaluations",
        "v_data_collection",
        "v_tool_calls",
    }
    rows = conn.execute("SHOW ALL TABLES").fetchall()
    found = {row[2] for row in rows}
    missing = expected_views - found
    if missing:
        log.error("Required views missing", extra={"missing": sorted(missing)})
        raise RuntimeError(f"DuckDB missing expected views: {missing}")
    log.info(
        "DuckDB verification passed",
        extra={"views": sorted(found & expected_views)},
    )
