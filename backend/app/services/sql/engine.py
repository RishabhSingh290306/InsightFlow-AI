"""Deterministic SQL sandbox: validate (read-only, safe) and execute.

Queries run against the in-memory pandas DataFrame for one dataset version,
registered as a DuckDB relation named `dataset`. No live database, no network,
no filesystem. Validation is independent of execution so unsafe queries fail
fast with a clear message. This is the ONLY place SQL is executed.
"""
from __future__ import annotations

import concurrent.futures
import time

import duckdb
import sqlglot
from sqlglot import exp

from app.schemas.sql import SqlVisualization

# Commands that must never run in the sandbox.
_FORBIDDEN = {
    "DROP", "DELETE", "UPDATE", "ALTER", "TRUNCATE", "INSERT", "CREATE",
    "REPLACE", "ATTACH", "DETACH", "COPY", "GRANT", "REVOKE", "PRAGMA",
    "EXECUTE", "CALL", "MERGE", "VACUUM", "BEGIN", "COMMIT", "ROLLBACK", "SET",
}


def validate_sql(sql: str, allowed_columns: list[str]) -> tuple[bool, str | None]:
    """Return (ok, error). Rejects anything not a single read-only SELECT/WITH
    over the `dataset` table with only whitelisted columns."""
    try:
        statements = [s for s in sqlglot.parse(sql, dialect="duckdb") if s is not None]
    except Exception as e:  # parse error
        return False, f"SQL parse error: {e}"
    if len(statements) != 1:
        return False, "Only a single SQL statement is allowed."
    stmt = statements[0]
    if not isinstance(stmt, (exp.Select, exp.With)):
        return False, "Only read-only SELECT (or WITH) queries are allowed."
    for node in stmt.walk():
        if isinstance(node, exp.Command):
            name = (node.name or "").upper()
            if name in _FORBIDDEN:
                return False, f"Disallowed SQL command: {name}."
    for table in stmt.find_all(exp.Table):
        if (table.name or "").lower() != "dataset":
            return False, f"Only the 'dataset' table is queryable (got '{table.name}')."
    allowed = {c.lower() for c in allowed_columns}
    for col in stmt.find_all(exp.Column):
        cname = (col.name or "").lower()
        if cname and cname not in allowed:
            return False, f"Unknown column: {col.name}."
    return True, None


def execute_query(df, sql: str, timeout_s: float = 10.0, max_rows: int = 2000) -> dict:
    """Execute `sql` against `df` (registered as `dataset`) and return a
    JSON-safe result dict: {columns, rows, row_count, truncated, duration_ms}."""

    def _run():
        con = duckdb.connect()
        con.register("dataset", df)
        rel = con.execute(sql)
        cols = [d[0] for d in rel.description]
        return cols, rel.fetchall()

    start = time.perf_counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
        fut = ex.submit(_run)
        try:
            cols, all_rows = fut.result(timeout=timeout_s)
        except concurrent.futures.TimeoutError:
            raise ValueError(f"Query exceeded the {timeout_s}s timeout.")
    truncated = len(all_rows) > max_rows
    rows = all_rows[:max_rows]
    row_dicts = _json_safe([dict(zip(cols, r)) for r in rows])
    duration_ms = round((time.perf_counter() - start) * 1000, 2)
    return {
        "columns": cols,
        "rows": row_dicts,
        "row_count": len(all_rows),
        "truncated": truncated,
        "duration_ms": duration_ms,
    }


def suggest_chart(columns: list[str], sample_rows: list[dict]) -> SqlVisualization | None:
    """Deterministic chart suggestion from the actual result shape."""
    if not columns:
        return None
    numeric = [c for c in columns if _is_numeric(sample_rows, c)]
    categorical = [c for c in columns if c not in numeric]
    if len(numeric) >= 2:
        return SqlVisualization(
            chart_type="scatter", rationale="Two numeric columns — explore their relationship.",
            x=numeric[0], y=numeric[1],
        )
    if len(numeric) == 1 and categorical:
        return SqlVisualization(
            chart_type="bar", rationale="One categorical + one numeric — compare groups.",
            x=categorical[0], y=numeric[0],
        )
    if len(numeric) == 1:
        return SqlVisualization(
            chart_type="histogram", rationale="Single numeric column — show its distribution.",
            x=numeric[0], y=None,
        )
    if len(categorical) == 1:
        return SqlVisualization(
            chart_type="pie", rationale="Single categorical column — show proportions.",
            x=categorical[0], y=None,
        )
    return None


def _is_numeric(rows: list[dict], col: str) -> bool:
    for r in rows[:10]:
        v = r.get(col)
        if v is None:
            continue
        if isinstance(v, bool):
            return False
        if isinstance(v, (int, float)):
            return True
        if isinstance(v, str) and v.replace(".", "", 1).lstrip("-").isdigit():
            return True
        return False
    return False


def _json_safe(rows: list[dict]) -> list[dict]:
    """Convert pandas/numpy/date scalars to JSON-safe primitives."""
    out = []
    for row in rows:
        clean = {}
        for k, v in row.items():
            if hasattr(v, "isoformat"):  # datetime/date
                v = v.isoformat()
            elif hasattr(v, "item"):  # numpy scalar
                v = v.item()
            elif isinstance(v, bytes):
                v = v.decode("utf-8", "replace")
            clean[k] = v
        out.append(clean)
    return out
