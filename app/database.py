"""
DuckDB connection manager — singleton, read-only.
Loads the pre-built conversations.duckdb on first access.
"""

from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import duckdb

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "conversations.duckdb"

_connection: Optional[duckdb.DuckDBPyConnection] = None


def get_connection() -> duckdb.DuckDBPyConnection:
    """Return a shared read-only DuckDB connection (lazy singleton)."""
    global _connection
    if _connection is None:
        if not DB_PATH.exists():
            raise FileNotFoundError(
                f"DuckDB file not found at {DB_PATH}. "
                "Make sure data/conversations.duckdb is present."
            )
        _connection = duckdb.connect(str(DB_PATH), read_only=True)
    return _connection


# --- SQL safety ----------------------------------------------------------------

FORBIDDEN_KEYWORDS = [
    "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE",
    "TRUNCATE", "REPLACE", "MERGE", "ATTACH", "DETACH",
    "COPY", "EXPORT", "IMPORT", "LOAD", "INSTALL",
]


def validate_sql_safety(sql: str) -> Tuple[bool, str]:
    """Check that SQL is read-only. Returns (is_safe, reason)."""
    upper = sql.upper().strip()

    # Must start with SELECT or WITH (CTE)
    if not (upper.startswith("SELECT") or upper.startswith("WITH")):
        return False, "SQL must start with SELECT or WITH (CTE)."

    for kw in FORBIDDEN_KEYWORDS:
        # Look for keyword as a standalone word
        if f" {kw} " in f" {upper} ":
            return False, f"Forbidden keyword detected: {kw}"

    return True, "OK"


# --- Query execution -----------------------------------------------------------

def execute_query(sql: str) -> Dict[str, Any]:
    """
    Execute a read-only SQL query on DuckDB.
    Returns {"columns": [...], "rows": [...], "row_count": int}.
    Raises ValueError on unsafe SQL or execution errors.
    """
    is_safe, reason = validate_sql_safety(sql)
    if not is_safe:
        raise ValueError(f"Unsafe SQL rejected: {reason}")

    con = get_connection()
    try:
        result = con.execute(sql)
        columns = [desc[0] for desc in result.description]
        rows = result.fetchall()

        # Convert to list of dicts for JSON serialization
        data = []
        for row in rows:
            record = {}
            for i, col in enumerate(columns):
                val = row[i]
                # Handle non-JSON-serializable types
                if hasattr(val, "isoformat"):
                    val = val.isoformat()
                elif isinstance(val, (bytes, bytearray)):
                    val = val.decode("utf-8", errors="replace")
                record[col] = val
            data.append(record)

        return {
            "columns": columns,
            "rows": data,
            "row_count": len(data),
        }
    except Exception as e:
        raise ValueError(f"SQL execution error: {str(e)}")


def get_table_info() -> str:
    """Return a summary of available views for debugging."""
    con = get_connection()
    tables = con.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'"
    ).fetchall()
    return ", ".join(t[0] for t in tables)
