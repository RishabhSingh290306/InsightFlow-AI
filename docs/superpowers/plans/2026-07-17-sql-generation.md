# SQL Generation (Question → SQL) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Question→SQL loop: the user asks a business question, the AI generates + explains SQL, the user reviews/edits it, a deterministic sandbox validates and executes it read-only against the dataset's in-memory DataFrame, results + execution time display, a visualization is suggested, and AI insights are produced — every executed query persists to a searchable project history. This is the **single SQL engine** the future AI Chat reuses.

**Architecture:** A single backend package `app/services/sql/` owns all SQL work (`engine.py` validates + executes read-only over the in-memory pandas frame via DuckDB; `proposer.py` generates SQL best-effort from the profile; `insights.py` writes best-effort prose on the result). Routes under `/api/v1/sql` generate/run/list/delete queries and persist a `sql_queries` history table. The frontend `sql-panel` drives the ask→edit→execute→results→history flow and reuses `ChartRenderer` for the suggested visualization.

**Tech Stack:** FastAPI, SQLModel, Alembic (backend); DuckDB + sqlglot for the sandbox (backend); Next.js 15, React 18, TypeScript, Tailwind v3 (frontend); pytest (unit tests).

## Global Constraints

- One SQL engine: all SQL generation and execution flows through `app/services/sql/`. No other module generates or runs SQL.
- Deterministic execution, best-effort AI: SQL generation and insight prose are best-effort (deterministic fallback, never a 5xx). SQL validation + execution is fully deterministic.
- Read-only sandbox: every query runs against the in-memory pandas DataFrame, never a live database. Only read-only statements allowed.
- AI sees facts, not data: the LLM receives the `DatasetProfile` + the user's question — never raw rows.
- HITL = review + edit + execute: the human always sees and can edit the SQL before it runs.
- All API routes are versioned under `/api/v1` (`settings.API_V1_PREFIX`).
- Auth token is read from `localStorage` key `insightflow_token`; `/api/*` → backend via Next.js rewrites.
- Do NOT run `git push`. The maintainer pushes manually. Commit per task.
- Secrets (`backend/.env`, `backend/.venv`) and `data/` are gitignored — never commit them.
- Backend venv Python: `backend/.venv/Scripts/python.exe`. Invoke as `./.venv/Scripts/python.exe`.

---

### Task 1: Backend deps + SQL schemas

**Files:**
- Create: `backend/app/schemas/sql.py`
- Modify: `backend/requirements.txt` (add `duckdb`, `sqlglot`)

**Interfaces:**
- Produces: `SqlVisualization`, `SqlGenerateRequest`, `SqlProposal`, `SqlRunRequest`, `SqlResult`, `SqlQueryRecord` (imported by engine, proposer, insights, routes, frontend types).

- [ ] **Step 1: Install DuckDB + sqlglot in the venv**

Run: `cd backend && ./.venv/Scripts/python.exe -m pip install "duckdb>=1.0" "sqlglot>=25.0"`

Expected: both packages install successfully.

- [ ] **Step 2: Add deps to requirements.txt**

Append to `backend/requirements.txt`:

```text

# SQL Generation sandbox (read-only query execution over the in-memory frame)
duckdb==1.1.1
sqlglot==25.26.1
```

- [ ] **Step 3: Write the schemas**

`backend/app/schemas/sql.py`:

```python
"""Wire contracts for the SQL Generation (Question → SQL) workflow.

A single read-only query loop: the user asks a question, the AI returns SQL +
explanation + a suggested visualization, the human edits and executes it, the
deterministic engine runs it safely, and the result + AI insights come back.
Every executed query is persisted as a `SqlQueryRecord` in project history.
"""
from __future__ import annotations

from pydantic import BaseModel


class SqlVisualization(BaseModel):
    """A suggested chart for the query result (reuses the EDA ChartSpec contract)."""

    chart_type: str  # "bar" | "line" | "scatter" | "histogram" | "pie" | "box" | "heatmap"
    rationale: str
    x: str | None = None
    y: str | None = None


class SqlGenerateRequest(BaseModel):
    """Body for POST /sql/generate."""

    dataset_id: int
    question: str


class SqlProposal(BaseModel):
    """AI response to a business question (best-effort)."""

    business_question: str
    sql: str
    explanation: str
    confidence: float  # 0-1
    suggested_visualization: SqlVisualization | None = None
    ai_available: bool = True


class SqlRunRequest(BaseModel):
    """Body for POST /sql/run — the (possibly edited) SQL to execute."""

    dataset_id: int
    sql: str
    edited: bool = False  # True if the user modified the AI-generated SQL
    business_question: str | None = None
    explanation: str | None = None
    suggested_visualization: SqlVisualization | None = None


class SqlResult(BaseModel):
    """Execution result returned to the frontend."""

    columns: list[str]
    rows: list[dict]
    row_count: int
    truncated: bool
    duration_ms: float
    insights: list[str] = []
    insights_ai_available: bool = True
    persisted_id: int | None = None


class SqlQueryRecord(BaseModel):
    """A persisted, executed query (project history)."""

    id: int
    project_id: int
    dataset_id: int
    owner_id: int
    business_question: str
    sql: str
    edited: bool
    explanation: str
    suggested_visualization: SqlVisualization | None = None
    insights: list[str] = []
    columns: list[str] = []
    row_count: int | None = None
    truncated: bool | None = None
    duration_ms: float | None = None
    executed_at: str
```

- [ ] **Step 4: Verify it imports and round-trips**

Run: `cd backend && ./.venv/Scripts/python.exe -c "from app.schemas.sql import SqlProposal, SqlRunRequest, SqlResult, SqlQueryRecord, SqlVisualization; p=SqlProposal(business_question='q', sql='SELECT 1', explanation='e', confidence=0.9, suggested_visualization=SqlVisualization(chart_type='bar', rationale='r', x='a')); print(p.model_dump(mode='json'))"`

Expected: prints a dict with `business_question='q'`, `sql='SELECT 1'`, `ai_available=True`, and a nested `suggested_visualization`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/sql.py backend/requirements.txt
git commit -m "feat: SQL Generation schemas (proposal/run/result/history)"
```

---

### Task 2: SqlQuery history model + migration

**Files:**
- Create: `backend/app/models/sql_query.py`
- Modify: `backend/app/models/__init__.py` (import `SqlQuery`)
- Create: `backend/alembic/versions/e6f7a8b9c0d1_add_sql_queries_table.py`

**Interfaces:**
- Produces: `SqlQuery` SQLModel table; migration `e6f7a8b9c0d1` revising `d5e6f7a8b9c0`.

- [ ] **Step 1: Write the model**

`backend/app/models/sql_query.py`:

```python
"""SqlQuery — one persisted, executed SQL query (project history).

Read-only analysis of an existing dataset version. No new dataset version is
created. Stored result *metadata* only (not full result rows) so history stays
lean and searchable.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, Float, ForeignKey, Integer, JSON, Text
from sqlmodel import Field, SQLModel


def _now() -> datetime:
    return datetime.now(timezone.utc)


class SqlQuery(SQLModel, table=True):
    __tablename__ = "sql_queries"

    id: int | None = Field(default=None, primary_key=True)
    project_id: int = Field(index=True, foreign_key="projects.id")
    dataset_id: int = Field(index=True, foreign_key="datasets.id")
    owner_id: int = Field(index=True, foreign_key="users.id")
    business_question: str = Field(sa_column=Column(Text))
    sql: str = Field(sa_column=Column(Text))
    edited: bool = False
    explanation: str = Field(sa_column=Column(Text))
    suggested_visualization: dict | None = Field(default=None, sa_column=Column(JSON))
    insights: list | None = Field(default=None, sa_column=Column(JSON))
    columns: list | None = Field(default=None, sa_column=Column(JSON))
    row_count: int | None = None
    truncated: bool | None = None
    duration_ms: float | None = None
    executed_at: datetime = Field(default_factory=_now)
```

- [ ] **Step 2: Register the model**

In `backend/app/models/__init__.py` change the imports/__all__ to:

```python
from app.models.dataset import Dataset
from app.models.project import Project
from app.models.sql_query import SqlQuery
from app.models.user import User

__all__ = ["User", "Project", "Dataset", "SqlQuery"]
```

- [ ] **Step 3: Write the migration**

`backend/alembic/versions/e6f7a8b9c0d1_add_sql_queries_table.py`:

```python
"""add sql_queries table

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-07-17 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel  # provides AutoString used by SQLModel columns


revision: str = 'e6f7a8b9c0d1'
down_revision: Union[str, None] = 'd5e6f7a8b9c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'sql_queries',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('dataset_id', sa.Integer(), nullable=False),
        sa.Column('owner_id', sa.Integer(), nullable=False),
        sa.Column('business_question', sa.Text(), nullable=False),
        sa.Column('sql', sa.Text(), nullable=False),
        sa.Column('edited', sa.Boolean(), nullable=False),
        sa.Column('explanation', sa.Text(), nullable=False),
        sa.Column('suggested_visualization', sa.JSON(), nullable=True),
        sa.Column('insights', sa.JSON(), nullable=True),
        sa.Column('columns', sa.JSON(), nullable=True),
        sa.Column('row_count', sa.Integer(), nullable=True),
        sa.Column('truncated', sa.Boolean(), nullable=True),
        sa.Column('duration_ms', sa.Float(), nullable=True),
        sa.Column('executed_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id']),
        sa.ForeignKeyConstraint(['dataset_id'], ['datasets.id']),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_sql_queries_project_id', 'sql_queries', ['project_id'])
    op.create_index('ix_sql_queries_dataset_id', 'sql_queries', ['dataset_id'])
    op.create_index('ix_sql_queries_owner_id', 'sql_queries', ['owner_id'])


def downgrade() -> None:
    op.drop_index('ix_sql_queries_owner_id', table_name='sql_queries')
    op.drop_index('ix_sql_queries_dataset_id', table_name='sql_queries')
    op.drop_index('ix_sql_queries_project_id', table_name='sql_queries')
    op.drop_table('sql_queries')
```

- [ ] **Step 4: Verify migration applies and the table exists**

Run: `cd backend && ./.venv/Scripts/python.exe -c "from app.core.database import run_migrations; run_migrations()" && ./.venv/Scripts/python.exe -c "from app.core.database import engine; from sqlalchemy import inspect; cols=[c['name'] for c in inspect(engine).get_columns('sql_queries')]; assert 'sql_queries' in [t['name'] for t in inspect(engine).get_table_names()], 'table missing'; print('sql_queries columns:', cols)"`

Expected: prints the `sql_queries` column list (id, project_id, dataset_id, owner_id, business_question, sql, edited, explanation, suggested_visualization, insights, columns, row_count, truncated, duration_ms, executed_at).

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/sql_query.py backend/app/models/__init__.py backend/alembic/versions/e6f7a8b9c0d1_add_sql_queries_table.py
git commit -m "feat: sql_queries history table + migration"
```

---

### Task 3: SQL engine (validate + execute + suggest) — TDD

**Files:**
- Create: `backend/app/services/sql/__init__.py`
- Create: `backend/app/services/sql/engine.py`
- Create: `backend/tests/test_sql_engine.py`

**Interfaces:**
- Consumes: `pandas.DataFrame`, `duckdb`, `sqlglot`.
- Produces: `validate_sql(sql, allowed_columns) -> (bool, str|None)`, `execute_query(df, sql, timeout_s=10, max_rows=2000) -> dict`, `suggest_chart(columns, sample_rows) -> SqlVisualization | None` (used by routes + proposer).

- [ ] **Step 1: Write the failing test**

`backend/tests/test_sql_engine.py`:

```python
import pandas as pd

from app.services.sql.engine import validate_sql, execute_query, suggest_chart

COLS = ["age", "region", "score"]


def test_rejects_drop():
    ok, err = validate_sql("DROP TABLE dataset", COLS)
    assert not ok and err


def test_rejects_dml():
    for sql in ["DELETE FROM dataset", "UPDATE dataset SET age=1", "INSERT INTO dataset VALUES (1)", "CREATE TABLE x (a INT)"]:
        ok, _ = validate_sql(sql, COLS)
        assert not ok, sql


def test_rejects_other_table():
    ok, _ = validate_sql("SELECT * FROM other", COLS)
    assert not ok


def test_rejects_unknown_column():
    ok, err = validate_sql("SELECT missing FROM dataset", COLS)
    assert not ok and "missing" in err


def test_rejects_multi_statement():
    ok, _ = validate_sql("SELECT 1; SELECT 2", COLS)
    assert not ok


def test_allows_valid_select():
    ok, err = validate_sql("SELECT age, region FROM dataset WHERE age > 10", COLS)
    assert ok, err


def test_allows_subquery():
    ok, err = validate_sql(
        "SELECT * FROM (SELECT * FROM dataset) sub WHERE sub.age > 1", COLS
    )
    assert ok, err


def test_execute_returns_rows_and_columns():
    df = pd.DataFrame({"age": [10, 20, 30], "region": ["n", "s", "n"]})
    res = execute_query(df, "SELECT region, COUNT(*) AS c FROM dataset GROUP BY region")
    assert res["columns"] == ["region", "c"]
    assert res["row_count"] == 2
    assert res["truncated"] is False
    assert res["duration_ms"] >= 0


def test_execute_truncates():
    df = pd.DataFrame({"x": list(range(50))})
    res = execute_query(df, "SELECT x FROM dataset", max_rows=10)
    assert res["row_count"] == 50
    assert res["truncated"] is True
    assert len(res["rows"]) == 10


def test_suggest_chart_two_numeric():
    v = suggest_chart(["a", "b"], [{"a": 1, "b": 2}])
    assert v is not None and v.chart_type == "scatter"


def test_suggest_chart_one_numeric_one_cat():
    v = suggest_chart(["region", "score"], [{"region": "n", "score": 1}])
    assert v is not None and v.chart_type == "bar"


def test_suggest_chart_single_numeric():
    v = suggest_chart(["age"], [{"age": 1}])
    assert v is not None and v.chart_type == "histogram"
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_sql_engine.py -q`

Expected: FAIL (`ModuleNotFoundError: No module named 'app.services.sql'`).

- [ ] **Step 3: Write the engine**

`backend/app/services/sql/__init__.py`:

```python
"""Single SQL engine for InsightFlow: generate, validate, execute, insights."""
from app.services.sql.engine import execute_query, suggest_chart, validate_sql
from app.services.sql.insights import generate_insights
from app.services.sql.proposer import generate_sql

__all__ = ["generate_sql", "validate_sql", "execute_query", "suggest_chart", "generate_insights"]
```

`backend/app/services/sql/engine.py`:

```python
"""Deterministic SQL sandbox: validate (read-only, safe) and execute.

Queries run against the in-memory pandas DataFrame for one dataset version,
registered as a DuckDB relation named `dataset`. No live database, no network,
no filesystem. Validation is independent of execution so unsafe queries fail
fast with a clear message. This is the ONLY place SQL is executed.
"""
from __future__ import annotations

import concurrent.futures
import json
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
    row_dicts = [_json_safe(dict(zip(cols, r))) for r in rows]
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
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_sql_engine.py -q`

Expected: PASS (11 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/sql/__init__.py backend/app/services/sql/engine.py backend/tests/test_sql_engine.py
git commit -m "feat: deterministic SQL sandbox (validate + DuckDB execute + chart suggest)"
```

---

### Task 4: SQL proposer + insights (best-effort) — TDD

**Files:**
- Create: `backend/app/services/sql/proposer.py`
- Create: `backend/app/services/sql/insights.py`
- Create: `backend/tests/test_sql_proposer.py`

**Interfaces:**
- Consumes: `validate_sql` (engine), `complete_json` (from `app.services.llm`), `DatasetProfile`, optional `DatasetUnderstanding`.
- Produces: `generate_sql(question, profile, understanding) -> SqlProposal`, `generate_insights(question, sql, result_summary, profile) -> tuple[list[str], bool]` (re-exported by `__init__`).

- [ ] **Step 1: Write the failing test (monkeypatch `complete_json`)**

`backend/tests/test_sql_proposer.py`:

```python
import asyncio

from app.schemas.sql import SqlProposal, SqlVisualization
from app.schemas.understanding import DatasetProfile
from app.services.sql import insights, proposer


def _profile():
    return DatasetProfile(
        file_name="t.csv", file_size=1, row_count=3, column_count=3,
        column_names=["age", "region", "score"],
        inferred_types={"age": "numeric", "region": "categorical", "score": "numeric"},
        numeric_columns=["age", "score"], categorical_columns=["region"],
        date_columns=[], missing_values={}, duplicate_row_count=0, null_percentage=0.0,
        unique_values={}, basic_statistics={}, potential_target_column=None,
        data_quality_issues=[], preview=[],
    )


def test_success_fills_sql(monkeypatch):
    async def fake(_s, _u, model=None):
        return {
            "business_question": "q", "sql": "SELECT age FROM dataset",
            "explanation": "shows age", "confidence": 0.9,
            "suggested_visualization": {"chart_type": "histogram", "rationale": "r", "x": "age", "y": None},
        }
    monkeypatch.setattr(proposer, "complete_json", fake)
    p = asyncio.run(proposer.generate_sql("q", _profile()))
    assert p.ai_available is True
    assert p.sql == "SELECT age FROM dataset"
    assert p.suggested_visualization.chart_type == "histogram"


def test_fallback_on_error(monkeypatch):
    async def boom(*a, **k):
        raise RuntimeError("no key")
    monkeypatch.setattr(proposer, "complete_json", boom)
    p = asyncio.run(proposer.generate_sql("q", _profile()))
    assert p.ai_available is False
    assert p.sql == ""


def test_fallback_on_invalid_sql(monkeypatch):
    async def fake(_s, _u, model=None):
        return {"sql": "SELECT nope FROM dataset"}  # unknown column
    monkeypatch.setattr(proposer, "complete_json", fake)
    p = asyncio.run(proposer.generate_sql("q", _profile()))
    assert p.ai_available is False
    assert p.sql == ""


def test_insights_fallback_on_error(monkeypatch):
    async def boom(*a, **k):
        raise RuntimeError("no key")
    monkeypatch.setattr(insights, "complete_json", boom)
    items, avail = asyncio.run(insights.generate_insights("q", "SELECT 1", "row_count=3", _profile()))
    assert avail is False
    assert items  # deterministic templated fallback
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_sql_proposer.py -q`

Expected: FAIL (`ModuleNotFoundError: No module named 'app.services.sql.proposer'`).

- [ ] **Step 3: Write the proposer**

`backend/app/services/sql/proposer.py`:

```python
"""Stage 1 — AI SQL generation (best-effort).

Sends the structured profile + the user's business question to the LLM and asks
for a single read-only SQL query (against the `dataset` table) plus explanation,
confidence, and a suggested visualization. The returned SQL is validated; if it
is unsafe or empty, we return an empty `sql` with `ai_available=False` so the
user can write their own. Never raises because of the LLM.
"""
from __future__ import annotations

import json

from app.schemas.sql import SqlProposal, SqlVisualization
from app.schemas.understanding import DatasetProfile, DatasetUnderstanding
from app.services.llm import complete_json
from app.services.sql.engine import validate_sql

_SYSTEM = (
    "You are a SQL expert for a data-analyst tool. You are given the STRUCTURED "
    "profile of a dataset (never the raw rows) and a user's business question. "
    "Write a SINGLE, read-only SQL query that answers it. The data is registered "
    "as a table named 'dataset' with the given columns. Respond with JSON only: "
    "{\"business_question\": str, \"sql\": str, \"explanation\": str, \"confidence\": "
    "number 0-1, \"suggested_visualization\": {\"chart_type\": str, \"rationale\": "
    "str, \"x\": str|null, \"y\": str|null}}."
)


def _viz(raw) -> SqlVisualization | None:
    if not isinstance(raw, dict):
        return None
    return SqlVisualization(
        chart_type=str(raw.get("chart_type", "bar")),
        rationale=str(raw.get("rationale", "")),
        x=raw.get("x"), y=raw.get("y"),
    )


async def generate_sql(
    question: str,
    profile: DatasetProfile,
    understanding: DatasetUnderstanding | None = None,
) -> SqlProposal:
    profile_json = profile.model_dump(mode="json")
    profile_json.pop("preview", None)  # never send raw-looking rows
    user_prompt = json.dumps(
        {"question": question, "profile": profile_json}, indent=2
    )
    try:
        data = await complete_json(_SYSTEM, user_prompt)
        sql = str(data.get("sql", "")).strip()
        ok, _ = validate_sql(sql, profile.column_names)
        if not ok or not sql:
            return SqlProposal(
                business_question=question, sql="",
                explanation="AI could not produce a safe query. Write your own SQL below.",
                confidence=0.0, suggested_visualization=None, ai_available=False,
            )
        return SqlProposal(
            business_question=question, sql=sql,
            explanation=str(data.get("explanation", "")),
            confidence=float(data.get("confidence", 0.7)),
            suggested_visualization=_viz(data.get("suggested_visualization")),
            ai_available=True,
        )
    except Exception:
        return SqlProposal(
            business_question=question, sql="",
            explanation="AI unavailable — write your own SQL below.",
            confidence=0.0, suggested_visualization=None, ai_available=False,
        )
```

- [ ] **Step 4: Write insights**

`backend/app/services/sql/insights.py`:

```python
"""Stage 2 — AI business insights on a query result (best-effort).

Sends a compact result summary (row count, columns, a few sample rows) to the
LLM for 2-4 insight bullets. On any failure, returns deterministic templated
bullets. Never raises because of the LLM.
"""
from __future__ import annotations

import json

from app.schemas.understanding import DatasetProfile
from app.services.llm import complete_json

_SYSTEM = (
    "You are a data analyst. Given a business question, the SQL used, and a "
    "summary of the query result, write 2-4 concise, plain-English business "
    "insights. Respond with JSON only: {\"insights\": [str, ...]}."
)


def _fallback(summary: str) -> list[str]:
    return [f"Query returned results. Summary: {summary}."]


async def generate_insights(
    question: str, sql: str, result_summary: str, profile: DatasetProfile
) -> tuple[list[str], bool]:
    user_prompt = json.dumps(
        {"question": question, "sql": sql, "result_summary": result_summary}, indent=2
    )
    try:
        data = await complete_json(_SYSTEM, user_prompt)
        items = data.get("insights", []) if isinstance(data, dict) else []
        if not items:
            return _fallback(result_summary), False
        return [str(i) for i in items][:5], True
    except Exception:
        return _fallback(result_summary), False
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_sql_proposer.py -q`

Expected: PASS (4 passed).

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/sql/proposer.py backend/app/services/sql/insights.py backend/tests/test_sql_proposer.py
git commit -m "feat: best-effort SQL proposer + result insights"
```

---

### Task 5: SQL routes + mounting + e2e

**Files:**
- Create: `backend/app/api/routes/sql.py`
- Modify: `backend/app/api/routes/__init__.py` (import `sql`)
- Modify: `backend/app/main.py` (include `sql.router`)

**Interfaces:**
- Consumes: `generate_sql`, `validate_sql`, `execute_query`, `suggest_chart`, `generate_insights`, `load_dataframe` (from `app.services.cleaning.engine`), `DatasetProfile`/`DatasetUnderstanding`, `SqlQuery` model.
- Produces: `POST /api/v1/sql/generate`, `POST /api/v1/sql/run`, `GET /api/v1/sql/history`, `DELETE /api/v1/sql/history/{id}`.

- [ ] **Step 1: Write the routes**

`backend/app/api/routes/sql.py`:

```python
"""SQL Generation routes — generate, run (validate+execute), history.

- `POST /sql/generate` — AI proposes SQL + explanation + suggested viz from a
  business question + profile (409 if unprofiled; best-effort).
- `POST /sql/run` — validate (422 on unsafe/invalid), execute read-only over the
  in-memory frame, generate insights, persist a history row, return results.
- `GET /sql/history` — owner-guarded, per-project list (optional dataset/q filter).
- `DELETE /sql/history/{id}` — owner-guarded delete of a history row.

SQL is read-only analysis: it never creates a new dataset version.
"""
from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import CurrentUser, SessionDep
from app.core.storage import get_storage
from app.models.dataset import Dataset
from app.models.sql_query import SqlQuery
from app.schemas.sql import (
    SqlGenerateRequest,
    SqlProposal,
    SqlQueryRecord,
    SqlResult,
    SqlRunRequest,
)
from app.schemas.understanding import DatasetProfile, DatasetUnderstanding
from app.services.cleaning.engine import load_dataframe
from app.services.sql.engine import execute_query, suggest_chart, validate_sql
from app.services.sql.insights import generate_insights
from app.services.sql.proposer import generate_sql
from sqlmodel import select

router = APIRouter(tags=["sql"])


def _owned_dataset(dataset_id: int, session: SessionDep, user: CurrentUser) -> Dataset:
    ds = session.get(Dataset, dataset_id)
    if ds is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    if ds.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your dataset")
    return ds


@router.post("/sql/generate", response_model=SqlProposal)
async def generate(body: SqlGenerateRequest, session: SessionDep, current_user: CurrentUser) -> SqlProposal:
    ds = _owned_dataset(body.dataset_id, session, current_user)
    if ds.profile is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Dataset is not analyzed yet. Run Analyze first.",
        )
    profile = DatasetProfile.model_validate(ds.profile)
    understanding = (
        DatasetUnderstanding.model_validate(ds.understanding) if ds.understanding else None
    )
    return await generate_sql(body.question, profile, understanding)


@router.post("/sql/run", response_model=SqlResult)
async def run(body: SqlRunRequest, session: SessionDep, current_user: CurrentUser) -> SqlResult:
    ds = _owned_dataset(body.dataset_id, session, current_user)
    if ds.profile is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Dataset is not analyzed yet. Run Analyze first.",
        )
    profile = DatasetProfile.model_validate(ds.profile)
    ok, err = validate_sql(body.sql, profile.column_names)
    if not ok:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=err or "Invalid SQL.")
    storage = get_storage()
    df = load_dataframe(storage, ds.storage_path, ds.file_format)
    try:
        res = execute_query(df, body.sql)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    viz = body.suggested_visualization
    if viz is None and res["columns"]:
        suggested = suggest_chart(res["columns"], res["rows"][:5])
        viz = suggested.model_dump() if suggested else None

    summary = (
        f"row_count={res['row_count']}, columns={res['columns']}, "
        f"sample={json.dumps(res['rows'][:3], default=str)}"
    )
    insights, insights_avail = await generate_insights(
        body.business_question or "", body.sql, summary, profile
    )

    record = SqlQuery(
        project_id=ds.project_id, dataset_id=ds.id, owner_id=current_user.id,
        business_question=body.business_question or "", sql=body.sql, edited=body.edited,
        explanation=body.explanation or "", suggested_visualization=viz, insights=insights,
        columns=res["columns"], row_count=res["row_count"], truncated=res["truncated"],
        duration_ms=res["duration_ms"],
    )
    session.add(record)
    session.commit()
    session.refresh(record)

    return SqlResult(
        columns=res["columns"], rows=res["rows"], row_count=res["row_count"],
        truncated=res["truncated"], duration_ms=res["duration_ms"], insights=insights,
        insights_ai_available=insights_avail, persisted_id=record.id,
    )


@router.get("/sql/history", response_model=list[SqlQueryRecord])
def history(
    project_id: int = Query(...),
    dataset_id: int | None = None,
    q: str | None = None,
    session: SessionDep,
    current_user: CurrentUser,
) -> list[SqlQueryRecord]:
    stmt = select(SqlQuery).where(
        SqlQuery.project_id == project_id, SqlQuery.owner_id == current_user.id
    )
    if dataset_id is not None:
        stmt = stmt.where(SqlQuery.dataset_id == dataset_id)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            (SqlQuery.business_question.ilike(like)) | (SqlQuery.sql.ilike(like))
        )
    stmt = stmt.order_by(SqlQuery.executed_at.desc())
    return session.exec(stmt).all()


@router.delete("/sql/history/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_history(record_id: int, session: SessionDep, current_user: CurrentUser) -> None:
    rec = session.get(SqlQuery, record_id)
    if rec is None or rec.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    session.delete(rec)
    session.commit()
```

- [ ] **Step 2: Mount the router**

In `backend/app/api/routes/__init__.py` change line 2 + `__all__` to:

```python
from app.api.routes import auth, cleaning, datasets, eda, projects, sql, users

__all__ = ["auth", "users", "projects", "datasets", "cleaning", "eda", "sql"]
```

In `backend/app/main.py` add `sql` to the import line and add before the last `include_router`:

```python
from app.api.routes import auth, cleaning, datasets, eda, projects, sql, users
...
app.include_router(sql.router, prefix=API_PREFIX)
```

- [ ] **Step 3: Verify the app boots and routes are registered**

Run: `cd backend && ./.venv/Scripts/python.exe -c "from app.main import app; paths=sorted({r.path for r in app.routes if '/sql' in r.path}); print(paths)"`

Expected: prints paths including `/api/v1/sql/generate`, `/api/v1/sql/run`, `/api/v1/sql/history`, `/api/v1/sql/history/{record_id}`.

- [ ] **Step 4: End-to-end check (manual, against dev DB) — write, run, then delete**

Write `backend/_sql_e2e.py`:

```python
import uuid
from fastapi.testclient import TestClient
from app.main import app

c = TestClient(app)
email = f"sql_{uuid.uuid4().hex[:8]}@test.dev"
c.post("/api/v1/auth/register", json={"email": email, "password": "password123", "full_name": "E"})
tok = c.post("/api/v1/auth/login", data={"username": email, "password": "password123"}).json()["access_token"]
h = {"Authorization": f"Bearer {tok}"}
proj = c.post("/api/v1/projects", json={"name": "E", "description": "x"}, headers=h).json()
pid = proj["id"]

CSV = b"age,region,score\n30,north,10\n25,south,20\n25,south,20\n40,north,30\n45,,15\n"
ds = c.post(f"/api/v1/datasets/projects/{pid}", files={"file": ("d.csv", CSV, "text/csv")}, headers=h).json()
did = ds["id"]

# 409 before profiling
r = c.post("/api/v1/sql/generate", json={"dataset_id": did, "question": "mean score?"}, headers=h)
assert r.status_code == 409, r.status_code
print("PASS 409 before profile")

c.post(f"/api/v1/datasets/{did}/understand", json={}, headers=h)

# generate
gen = c.post("/api/v1/sql/generate", json={"dataset_id": did, "question": "mean score by region"}, headers=h).json()
assert "sql" in gen
print("PASS generate:", gen.get("ai_available"), repr(gen["sql"][:40]))

# destructive -> 422, no history row
bad = c.post("/api/v1/sql/run", json={"dataset_id": did, "sql": "DROP TABLE dataset"}, headers=h)
assert bad.status_code == 422, bad.status_code
print("PASS destructive rejected (422)")

# valid run
ok = c.post("/api/v1/sql/run", json={"dataset_id": did, "sql": "SELECT region, AVG(score) AS avg_score FROM dataset GROUP BY region", "business_question": "mean score by region"}, headers=h).json()
assert ok["row_count"] >= 1 and ok["persisted_id"], ok
print("PASS run:", ok["row_count"], "rows,", ok["duration_ms"], "ms")

# history lists it
hist = c.get(f"/api/v1/sql/history?project_id={pid}", headers=h).json()
assert any(rec["id"] == ok["persisted_id"] for rec in hist), hist
assert any("region" in rec["sql"] for rec in hist), "search should find it"
print("PASS history lists + search works")

# delete
c.delete(f"/api/v1/sql/history/{ok['persisted_id']}", headers=h)
assert c.get(f"/api/v1/sql/history?project_id={pid}", headers=h).json() == [] or all(rec["id"] != ok["persisted_id"] for rec in c.get(f"/api/v1/sql/history?project_id={pid}", headers=h).json())
print("PASS delete history")

# cleanup
from app.core.database import engine
from app.models.dataset import Dataset
from sqlmodel import Session, select
with Session(engine) as s:
    ids = sorted((d.id for d in s.exec(select(Dataset).where(Dataset.project_id == pid)).all()), reverse=True)
for i in ids:
    c.delete(f"/api/v1/datasets/{i}", headers=h)
c.delete(f"/api/v1/projects/{pid}", headers=h)
print("CLEANUP done")
```

Run: `cd backend && ./.venv/Scripts/python.exe _sql_e2e.py 2>/dev/null | grep -E "PASS|CLEANUP"`

Expected: prints the five PASS lines + CLEANUP done (no assertion errors).

Then delete the temp file: `rm backend/_sql_e2e.py`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/sql.py backend/app/api/routes/__init__.py backend/app/main.py
git commit -m "feat: SQL routes (generate/run/history/delete) + mount"
```

---

### Task 6: Frontend types + API client

**Files:**
- Modify: `frontend/lib/types.ts` (add SQL types)
- Modify: `frontend/lib/api.ts` (add `sqlApi`)

**Interfaces:**
- Produces: `SqlVisualization`, `SqlProposal`, `SqlRunRequest`, `SqlResult`, `SqlQueryRecord`; `sqlApi.generate/run/history/remove`.

- [ ] **Step 1: Add the types**

In `frontend/lib/types.ts`, after the `EdaAcceptRequest` interface, add:

```typescript
// --- SQL Generation (Question -> SQL) ------------------------------------

export interface SqlVisualization {
  chart_type: ChartType;
  rationale: string;
  x?: string | null;
  y?: string | null;
}

export interface SqlProposal {
  business_question: string;
  sql: string;
  explanation: string;
  confidence: number;
  suggested_visualization: SqlVisualization | null;
  ai_available: boolean;
}

export interface SqlRunRequest {
  dataset_id: number;
  sql: string;
  edited?: boolean;
  business_question?: string | null;
  explanation?: string | null;
  suggested_visualization?: SqlVisualization | null;
}

export interface SqlResult {
  columns: string[];
  rows: Record<string, unknown>[];
  row_count: number;
  truncated: boolean;
  duration_ms: number;
  insights: string[];
  insights_ai_available: boolean;
  persisted_id: number | null;
}

export interface SqlQueryRecord {
  id: number;
  project_id: number;
  dataset_id: number;
  owner_id: number;
  business_question: string;
  sql: string;
  edited: boolean;
  explanation: string;
  suggested_visualization: SqlVisualization | null;
  insights: string[];
  columns: string[];
  row_count: number | null;
  truncated: boolean | null;
  duration_ms: number | null;
  executed_at: string;
}
```

- [ ] **Step 2: Add the API client**

In `frontend/lib/api.ts`, update the type import to include the new types and add `sqlApi`
after `edaApi`:

```typescript
import type {
  ChartSpec,
  CleaningOperation,
  CleaningPlan,
  DatasetRead,
  EdaAcceptRequest,
  EdaResult,
  ProjectCreate,
  ProjectRead,
  SqlProposal,
  SqlQueryRecord,
  SqlResult,
  SqlRunRequest,
  SqlVisualization,
  Token,
  UserRead,
} from "@/lib/types";
```

```typescript
export const sqlApi = {
  generate(datasetId: number, question: string): Promise<SqlProposal> {
    return request<SqlProposal>("/api/v1/sql/generate", {
      method: "POST",
      body: JSON.stringify({ dataset_id: datasetId, question }),
    });
  },
  run(req: SqlRunRequest): Promise<SqlResult> {
    return request<SqlResult>("/api/v1/sql/run", {
      method: "POST",
      body: JSON.stringify(req),
    });
  },
  history(params: { projectId: number; datasetId?: number; q?: string }): Promise<SqlQueryRecord[]> {
    const qs = new URLSearchParams({ project_id: String(params.projectId) });
    if (params.datasetId) qs.set("dataset_id", String(params.datasetId));
    if (params.q) qs.set("q", params.q);
    return request<SqlQueryRecord[]>(`/api/v1/sql/history?${qs.toString()}`);
  },
  remove(id: number): Promise<void> {
    return request<void>(`/api/v1/sql/history/${id}`, { method: "DELETE" });
  },
};
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/types.ts frontend/lib/api.ts
git commit -m "feat: frontend SQL types + sqlApi client"
```

---

### Task 7: SQL panel component

**Files:**
- Create: `frontend/components/sql-panel.tsx`

**Interfaces:**
- Consumes: `sqlApi`, `ChartRenderer`, `DatasetRead`, `SqlProposal`, `SqlResult`, `SqlVisualization`, `ChartSpec`, `SqlQueryRecord`.
- Produces: `<SqlPanel dataset={...} onClose={...} />` (used by project page).

- [ ] **Step 1: Write the component**

`frontend/components/sql-panel.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  Check,
  Loader2,
  Play,
  Sparkles,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";

import { sqlApi } from "@/lib/api";
import { ChartRenderer } from "@/components/chart-renderer";
import type {
  ChartSpec,
  DatasetRead,
  SqlProposal,
  SqlQueryRecord,
  SqlResult,
  SqlVisualization,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const cls = pct >= 80 ? "bg-primary/15 text-primary" : pct >= 50 ? "bg-secondary text-secondary-foreground" : "bg-destructive/15 text-destructive";
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{pct}% conf.</span>;
}

// Adapt a query result into a ChartSpec so the existing ChartRenderer can draw it.
function buildChartSpec(viz: SqlVisualization, result: SqlResult): ChartSpec | null {
  const cols = result.columns;
  const x = viz.x ?? cols[0];
  if (!x || !cols.includes(x)) return null;
  const data = result.rows
    .slice(0, 200)
    .map((r) => {
      if (viz.chart_type === "scatter" || viz.chart_type === "line") {
        const y = viz.y ?? cols.find((c) => c !== x);
        if (!y || !cols.includes(y)) return null;
        return { x: r[x], y: r[y] };
      }
      if (viz.chart_type === "pie") {
        const y = viz.y ?? cols.find((c) => c !== x);
        return { category: r[x], value: y ? Number(r[y]) || 1 : 1 };
      }
      const y = viz.y ?? cols.find((c) => c !== x);
      return { category: r[x], count: y ? Number(r[y]) || 1 : 1 };
    })
    .filter(Boolean) as Record<string, unknown>[];
  return {
    id: "sql-viz",
    chart_type: viz.chart_type,
    title: viz.rationale || "Suggested visualization",
    subtitle: null,
    business_question: "",
    explanation: "",
    recommended_reason: "",
    confidence: 1,
    axis_config: {},
    data,
    metadata: { columns: viz.y ? [x, viz.y] : [x] },
    accepted: false,
  };
}

export function SqlPanel({ dataset, onClose }: { dataset: DatasetRead; onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [proposal, setProposal] = useState<SqlProposal | null>(null);
  const [sqlText, setSqlText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SqlResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<SqlQueryRecord[]>([]);
  const [historyQ, setHistoryQ] = useState("");

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await sqlApi.history({ projectId: dataset.project_id, datasetId: dataset.id }));
    } catch {
      /* non-fatal */
    }
  }, [dataset.project_id, dataset.id]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  async function onGenerate() {
    if (!question.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const p = await sqlApi.generate(dataset.id, question);
      setProposal(p);
      setSqlText(p.sql);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function onRun() {
    if (!sqlText.trim()) return;
    setRunning(true);
    setError(null);
    try {
      const r = await sqlApi.run({
        dataset_id: dataset.id,
        sql: sqlText,
        edited: proposal ? sqlText !== proposal.sql : true,
        business_question: proposal?.business_question ?? question,
        explanation: proposal?.explanation ?? "",
        suggested_visualization: proposal?.suggested_visualization ?? null,
      });
      setResult(r);
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Execution failed");
    } finally {
      setRunning(false);
    }
  }

  async function onDelete(id: number) {
    try {
      await sqlApi.remove(id);
      setHistory((h) => h.filter((r) => r.id !== id));
    } catch {
      /* non-fatal */
    }
  }

  const filteredHistory = history.filter(
    (h) =>
      !historyQ ||
      h.business_question.toLowerCase().includes(historyQ.toLowerCase()) ||
      h.sql.toLowerCase().includes(historyQ.toLowerCase()),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-10">
      <Card className="w-full max-w-3xl">
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div className="flex flex-col gap-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="h-4 w-4" /> SQL · {dataset.original_filename}
            </CardTitle>
            <p className="text-sm text-muted-foreground">Ask a question; review, edit, and run SQL.</p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <TriangleAlert className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. What is the average score by region?"
                className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                onKeyDown={(e) => e.key === "Enter" && onGenerate()}
              />
              <Button onClick={onGenerate} disabled={generating || !question.trim()}>
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate
              </Button>
            </div>
          </div>

          {proposal && !proposal.ai_available && !sqlText && (
            <div className="flex items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4 shrink-0" />
              AI suggestions unavailable — write your own SQL below.
            </div>
          )}
          {proposal && proposal.explanation && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">AI:</span> {proposal.explanation}{" "}
              <ConfidenceBadge value={proposal.confidence} />
            </p>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">SQL (editable)</label>
            <textarea
              value={sqlText}
              onChange={(e) => setSqlText(e.target.value)}
              rows={5}
              spellCheck={false}
              className="w-full rounded-md border bg-muted/30 p-2 font-mono text-xs"
              placeholder="SELECT * FROM dataset LIMIT 10"
            />
            <Button onClick={onRun} disabled={running || !sqlText.trim()} className="self-start">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Execute
            </Button>
          </div>

          {result && (
            <div className="flex flex-col gap-3 rounded-md border p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {result.row_count} rows · {result.duration_ms} ms
                  {result.truncated ? " · truncated" : ""}
                </span>
              </div>
              <div className="max-h-64 overflow-auto rounded border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted text-muted-foreground">
                    <tr>
                      {result.columns.map((c) => (
                        <th key={c} className="px-2 py-1 font-medium">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr key={i} className="border-t">
                        {result.columns.map((c) => (
                          <td key={c} className="px-2 py-1">
                            {String(row[c] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {(() => {
                const viz = proposal?.suggested_visualization;
                if (!viz) return null;
                const spec = buildChartSpec(viz, result);
                if (!spec) return null;
                return (
                  <div className="rounded-md border bg-muted/30 p-2">
                    <ChartRenderer spec={spec} />
                  </div>
                );
              })()}

              {result.insights.length > 0 && (
                <div className="flex flex-col gap-1">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Insights {!result.insights_ai_available ? "(auto)" : ""}
                  </h4>
                  <ul className="flex flex-col gap-1">
                    {result.insights.map((ins, i) => (
                      <li key={i} className="text-sm">
                        • {ins}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">History</h3>
              <input
                value={historyQ}
                onChange={(e) => setHistoryQ(e.target.value)}
                placeholder="Search…"
                className="w-40 rounded-md border bg-background px-2 py-1 text-xs"
              />
            </div>
            <div className="flex flex-col gap-1">
              {filteredHistory.length === 0 && (
                <p className="text-xs text-muted-foreground">No queries yet.</p>
              )}
              {filteredHistory.map((rec) => (
                <div key={rec.id} className="flex items-start justify-between gap-2 rounded-md border p-2 text-xs">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">{rec.business_question || "(no question)"}</span>
                    <code className="block truncate font-mono text-[10px] text-muted-foreground">{rec.sql}</code>
                    <span className="text-muted-foreground">
                      {rec.row_count} rows · {rec.edited ? "edited" : "as-generated"}
                    </span>
                  </div>
                  <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => onDelete(rec.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/sql-panel.tsx
git commit -m "feat: SQL panel (ask -> edit -> execute -> results -> history)"
```

---

### Task 8: Wire SQL button into the project page

**Files:**
- Modify: `frontend/app/projects/[id]/page.tsx`

**Interfaces:**
- Consumes: `sqlApi`, `SqlPanel`, `DatasetRead`.

- [ ] **Step 1: Import and add state**

Add to the imports block (after the `EdaPanel` import):

```typescript
import { SqlPanel } from "@/components/sql-panel";
```

In the component body, near the `edaId` state, add:

```typescript
  const [sqlId, setSqlId] = useState<number | null>(null);
```

- [ ] **Step 2: Add the SQL button**

After the EDA button block (added in the EDA milestone), add:

```tsx
                      {d.profile && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSqlId(d.id)}
                        >
                          <BarChart3 className="h-4 w-4" />
                          SQL
                        </Button>
                      )}
```

(`BarChart3` is already imported from lucide-react for the EDA button.)

- [ ] **Step 3: Render the panel**

After the `edaId` panel block, add:

```tsx
      {sqlId !== null && (
        <SqlPanel
          dataset={datasets.find((d) => d.id === sqlId)!}
          onClose={() => setSqlId(null)}
        />
      )}
```

- [ ] **Step 4: Type-check, lint, build**

Run: `cd frontend && npx tsc --noEmit && npx next lint && rm -rf .next && npm run build 2>&1 | tail -n 12`

Expected: `tsc` clean, `next lint` no errors/warnings, `next build` succeeds (routes list printed).

- [ ] **Step 5: Commit**

```bash
git add "frontend/app/projects/[id]/page.tsx"
git commit -m "feat: wire SQL button + panel into project workspace"
```

---

### Task 9: Full verification + docs + milestone commit

**Files:**
- Modify: `PROJECT_PROGRESS.md` (tick Sprint 2 M2, resolve SQL sandbox known issue), `DEVELOPMENT_LOG.md` (add entry).

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Backend compile + unit tests**

Run: `cd backend && ./.venv/Scripts/python.exe -m compileall -q app && ./.venv/Scripts/python.exe -m pytest tests/ -q`

Expected: compile clean; `tests/` PASS (engine 11 + proposer/insights 4 = 15 passed).

- [ ] **Step 2: Frontend lint + build**

Run: `cd frontend && npx tsc --noEmit && npx next lint && rm -rf .next && npm run build 2>&1 | tail -n 12`

Expected: clean compile, lint, successful build.

- [ ] **Step 3: Tick Sprint 2 M2 in PROJECT_PROGRESS.md**

In `PROJECT_PROGRESS.md`, in the "Current Sprint" Sprint 2 block, add the milestone line and check it:

```markdown
- [x] **M2 — SQL Generation:** Question→SQL loop; `app/services/sql/` single engine (DuckDB read-only sandbox + sqlglot validation, best-effort `generate_sql`/`generate_insights`), `POST/GET/DELETE /sql/{generate,run,history}`, `sql_queries` history table, `sql-panel` (ask→edit→execute→results→history) reusing `ChartRenderer`
```

Also update the milestone timeline row `| SQL Generation | 2026-08-27 | Pending |` → `| SQL Generation | 2026-08-27 | ✅ Complete |`.

In the **Known Issues** section, remove the line `- SQL sandbox security considerations pending` (resolved by the read-only DuckDB sandbox + validation).

- [ ] **Step 4: Add a DEVELOPMENT_LOG.md entry**

Append after the most recent EDA (M1) entry:

```markdown
## 2026-07-17 — Sprint 2, M2: SQL Generation (Question → SQL) (shipped)

Read-only analysis workflow completing the "collaborate with an AI Data Analyst"
vision: ask a business question → AI generates + explains SQL → human reviews/edits
→ deterministic sandbox validates + executes → results + execution time + suggested
visualization + AI insights → every executed query persisted to searchable history.

- **`app/services/sql/engine.py`** — `validate_sql` (sqlglot: single statement, SELECT/WITH
  only, no DDL/DML, only the `dataset` table, column whitelist) and `execute_query`
  (DuckDB over the in-memory pandas frame registered as `dataset`; threaded timeout +
  row cap; JSON-safe rows). `suggest_chart` deterministically picks a chart type from the
  result shape. This is the ONLY place SQL executes.
- **`app/services/sql/proposer.py`** — `generate_sql(question, profile, understanding)`
  sends the profile (preview stripped) + question to `complete_json` for SQL +
  explanation + confidence + suggested viz; validates the SQL and falls back to an empty
  `sql` with `ai_available=False` if unsafe/unavailable (user writes their own).
- **`app/services/sql/insights.py`** — `generate_insights(...)` best-effort prose on a
  compact result summary; deterministic templated fallback.
- **`app/schemas/sql.py`** — `SqlProposal` / `SqlRunRequest` / `SqlResult` /
  `SqlQueryRecord` / `SqlVisualization` contracts.
- **`app/models/sql_query.py`** + migration `e6f7a8b9c0d1` — `sql_queries` history table
  (project/dataset/owner FKs + indexes; stores question/SQL/edited/explanation/viz/
  insights/result-metadata, not full rows).
- **`app/api/routes/sql.py`** — `POST /sql/generate` (409 if unprofiled), `POST /sql/run`
  (validate → 422 on unsafe; execute; persist; return results), `GET /sql/history`
  (owner-guarded, per-project, `q` ILIKE search), `DELETE /sql/history/{id}`.
- **Frontend** — `lib/types.ts` / `lib/api.ts` (`sqlApi`), `components/sql-panel.tsx`
  (ask→edit→execute→results→history, reuses `ChartRenderer` for the suggested viz), and a
  **SQL** button per profiled dataset in `app/projects/[id]/page.tsx`.

Resolves the "SQL sandbox security considerations pending" known issue: SQL runs only
against the in-memory frame, never a live DB. Verified: `py_compile`, `pytest` (engine +
proposer/insights), `tsc`/`next lint`/`next build` all pass; manual TestClient e2e confirms
409-before-profile, generation, destructive-SQL 422 (no history row), valid run + persist,
history list + search, delete. The `app/services/sql/` package is the single SQL engine the
future AI Chat reuses.

## Future Log Entries
```

- [ ] **Step 5: Commit (no push)**

```bash
git add PROJECT_PROGRESS.md DEVELOPMENT_LOG.md
git commit -m "docs: tick Sprint 2 M2 (SQL Generation); resolve SQL sandbox known issue"
```

- [ ] **Step 6: Final summary to maintainer**

Report: milestone complete, all tasks committed, no push performed (maintainer pushes).
List the verification results.
