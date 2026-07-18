"""Deterministic SQL sandbox: validate (read-only, safe) and execute.

Queries run against the in-memory pandas DataFrame for one dataset version,
registered as a DuckDB relation named `dataset`. No live database, no network,
no filesystem. Validation is independent of execution so unsafe queries fail
fast with a clear message. This is the ONLY place SQL is executed.
"""
from __future__ import annotations

import multiprocessing
import time

import duckdb
import sqlglot
from sqlglot import exp

from app.schemas.sql import SqlVisualization

# Subprocess resource ceilings — the only hard guarantee against a runaway query
# OOM-ing the host (a thread can't be truly cancelled, but a process can be).
_DUCKDB_MEMORY_LIMIT = "512MB"
_DUCKDB_THREADS = 2
_MAX_QUERY_CHARS = 2000
_MAX_JOINS = 8
_MAX_UNIONS = 10

# Commands that must never run in the sandbox.
_FORBIDDEN = {
    "DROP", "DELETE", "UPDATE", "ALTER", "TRUNCATE", "INSERT", "CREATE",
    "REPLACE", "ATTACH", "DETACH", "COPY", "GRANT", "REVOKE", "PRAGMA",
    "EXECUTE", "CALL", "MERGE", "VACUUM", "BEGIN", "COMMIT", "ROLLBACK", "SET",
}


def validate_sql(sql: str, allowed_columns: list[str]) -> tuple[bool, str | None]:
    """Return (ok, error). Rejects anything not a single read-only SELECT/WITH
    over the `dataset` table with only whitelisted columns, plus a set of
    complexity guards that bound fan-out (recursive CTEs, cross joins, deep
    unions) so a malicious query can't blow up the sandbox."""
    if len(sql) > _MAX_QUERY_CHARS:
        return False, f"Query too long (max {_MAX_QUERY_CHARS} characters)."
    try:
        statements = [s for s in sqlglot.parse(sql, dialect="duckdb") if s is not None]
    except Exception as e:  # parse error
        return False, f"SQL parse error: {e}"
    if len(statements) != 1:
        return False, "Only a single SQL statement is allowed."
    stmt = statements[0]
    if not isinstance(stmt, (exp.Select, exp.With)):
        return False, "Only read-only SELECT (or WITH) queries are allowed."

    # Block recursive CTEs: a self-referencing CTE with no termination guard
    # can recurse without bound and hang/OOM the engine.
    if isinstance(stmt, exp.With) and stmt.args.get("recursive"):
        return False, "Recursive CTEs (WITH RECURSIVE) are not allowed."

    # A SELECT-with-WITH (or a bare WITH) may define CTEs. Extract them so CTE
    # aliases are permitted in the final SELECT, while still forbidding any
    # reference to a table other than `dataset` (or a CTE alias). The CTE bodies
    # themselves may only read `dataset`.
    with_node = (
        stmt
        if isinstance(stmt, exp.With)
        else stmt.args.get("with_")
    )
    ctes = list(with_node.expressions) if with_node is not None else []
    final = stmt.this if isinstance(stmt, exp.With) else stmt
    cte_aliases = {w.alias for w in ctes}

    for node in stmt.walk():
        if isinstance(node, exp.Command):
            name = (node.name or "").upper()
            if name in _FORBIDDEN:
                return False, f"Disallowed SQL command: {name}."

    # Cross joins against a single table produce a Cartesian product; on a large
    # dataset that's an O(n^2) blow-up. Explicit CROSS JOIN is always disallowed.
    for join in stmt.find_all(exp.Join):
        if (join.args.get("kind") or "").upper() == "CROSS":
            return False, "CROSS JOIN is not allowed."

    # Cap the number of joins and unions so a pathological query (many-way join
    # or a large union stack) is rejected before execution rather than after a
    # multi-second hang.
    join_count = sum(1 for _ in stmt.find_all(exp.Join))
    if join_count > _MAX_JOINS:
        return False, f"Too many joins (max {_MAX_JOINS})."
    union_count = sum(1 for _ in stmt.find_all(exp.Union))
    if union_count > _MAX_UNIONS:
        return False, f"Too many UNION clauses (max {_MAX_UNIONS})."

    for table in final.find_all(exp.Table):
        name = (table.name or "").lower()
        if name != "dataset" and name not in cte_aliases:
            return False, f"Only the 'dataset' table (or a CTE alias) is queryable (got '{table.name}')."
    # The CTE bodies themselves may only read `dataset` (not a foreign table).
    for w in ctes:
        for table in w.this.find_all(exp.Table):
            if (table.name or "").lower() != "dataset":
                return False, f"Only the 'dataset' table is queryable in a CTE (got '{table.name}')."
    allowed = {c.lower() for c in allowed_columns}
    for col in stmt.find_all(exp.Column):
        cname = (col.name or "").lower()
        if cname and cname not in allowed:
            return False, f"Unknown column: {col.name}."
    return True, None


def _run_in_process(df, sql: str, q: "multiprocessing.Queue") -> None:
    """Top-level target for the sandbox subprocess. Runs the query with bounded
    memory/threads and returns (columns, json_safe_rows) via the queue, or a
    (None, exc) sentinel on failure. Kept module-level so it pickles cleanly."""
    try:
        con = duckdb.connect()
        con.execute(f"PRAGMA memory_limit='{_DUCKDB_MEMORY_LIMIT}'")
        con.execute(f"PRAGMA threads={_DUCKDB_THREADS}")
        con.register("dataset", df)
        rel = con.execute(sql)
        cols = [d[0] for d in rel.description]
        rows = _json_safe([dict(zip(cols, r)) for r in rel.fetchall()])
        q.put((cols, rows))
    except Exception as exc:  # relay to parent as a clear error
        q.put((None, f"{type(exc).__name__}: {exc}"))


def execute_query(df, sql: str, timeout_s: float = 10.0, max_rows: int = 2000) -> dict:
    """Execute `sql` against `df` (registered as `dataset`) and return a
    JSON-safe result dict: {columns, rows, row_count, truncated, duration_ms}.

    Runs in a separate process so a runaway query can be hard-terminated on
    timeout (a thread can't be cancelled mid-native-call). Memory and thread
    counts are capped via DuckDB pragmas so a valid-but-heavy query can't OOM
    the host even if it approaches the timeout.
    """
    start = time.perf_counter()
    q: "multiprocessing.Queue" = multiprocessing.Queue()
    proc = multiprocessing.Process(target=_run_in_process, args=(df, sql, q))
    proc.start()
    proc.join(timeout_s)
    if proc.is_alive():
        # Hard kill: stop the DuckDB native call and free its memory.
        proc.kill()
        proc.join()
        raise ValueError(f"Query exceeded the {timeout_s}s timeout.")
    if q.empty():
        raise ValueError("Query failed with no result.")
    cols, payload = q.get()
    if cols is None:  # sentinel: (None, error_string)
        raise ValueError(f"Query failed: {payload}")
    all_rows = payload  # already json-safe
    truncated = len(all_rows) > max_rows
    rows = all_rows[:max_rows]
    duration_ms = round((time.perf_counter() - start) * 1000, 2)
    return {
        "columns": cols,
        "rows": rows,
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
