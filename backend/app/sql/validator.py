"""SQL validation: sqlglot AST parse → DuckDB EXPLAIN dry-run → execute."""

from __future__ import annotations

from dataclasses import dataclass

import duckdb
import sqlglot
from sqlglot import exp

from app.db import get_db
from app.logger import get_logger

log = get_logger("sql.validator")

_FORBIDDEN_EXPRESSIONS = (
    exp.Insert,
    exp.Update,
    exp.Delete,
    exp.Drop,
    exp.Create,
    exp.Alter,
    exp.TruncateTable,
    exp.Merge,
)


class SQLValidationError(Exception):
    """Raised when SQL fails AST or EXPLAIN validation."""


def validate_sql_ast(sql: str) -> None:
    """Parse SQL via sqlglot, reject DML/DDL/PRAGMA/ATTACH.

    Raises SQLValidationError on any forbidden statement or parse failure.
    """
    if not sql or not sql.strip():
        raise SQLValidationError("SQL is empty")

    sql_upper = sql.strip().upper()
    if not (sql_upper.startswith("SELECT") or sql_upper.startswith("WITH")):
        raise SQLValidationError("SQL must start with SELECT or WITH")
    for banned in ("PRAGMA", "ATTACH", "DETACH", "LOAD", "INSTALL"):
        if banned in sql_upper:
            raise SQLValidationError(f"SQL contains forbidden keyword: {banned}")

    try:
        parsed = sqlglot.parse(sql, read="duckdb")
    except Exception as e:
        raise SQLValidationError(f"sqlglot parse failed: {e}") from e

    for stmt in parsed:
        if stmt is None:
            continue
        if isinstance(stmt, _FORBIDDEN_EXPRESSIONS):
            raise SQLValidationError(f"Forbidden statement type: {type(stmt).__name__}")
        for forbidden in _FORBIDDEN_EXPRESSIONS:
            if stmt.find(forbidden) is not None:
                raise SQLValidationError(f"Forbidden expression embedded: {forbidden.__name__}")


def explain_sql(sql: str) -> None:
    """DuckDB EXPLAIN dry-run. Catches hallucinated columns/tables/functions
    before we actually execute."""
    conn = get_db()
    try:
        conn.execute(f"EXPLAIN {sql}").fetchall()
    except duckdb.Error as e:
        raise SQLValidationError(f"DuckDB EXPLAIN failed: {e}") from e


@dataclass
class ExecutionResult:
    rows: list[dict[str, object]]
    columns: list[str]
    row_count: int


def execute_sql(sql: str, max_rows: int = 10_000) -> ExecutionResult:
    """Execute validated SQL against the DuckDB read-only connection.

    Caller is expected to have called validate_sql_ast + explain_sql first.
    """
    conn = get_db()
    cursor = conn.execute(sql)
    columns = [d[0] for d in cursor.description]
    raw_rows = cursor.fetchmany(max_rows)
    rows = [dict(zip(columns, r, strict=False)) for r in raw_rows]
    return ExecutionResult(rows=rows, columns=columns, row_count=len(rows))


def validate_and_execute(sql: str, request_id: str) -> ExecutionResult:
    """Full pipeline: AST validate → EXPLAIN → execute. Errors bubble up as
    SQLValidationError (caller decides whether to retry)."""
    log.debug("Validating SQL", extra={"request_id": request_id, "sql_chars": len(sql)})
    validate_sql_ast(sql)
    explain_sql(sql)
    log.debug("SQL passed validation, executing", extra={"request_id": request_id})
    result = execute_sql(sql)
    log.info(
        "SQL executed",
        extra={
            "request_id": request_id,
            "row_count": result.row_count,
            "columns": result.columns,
        },
    )
    return result
