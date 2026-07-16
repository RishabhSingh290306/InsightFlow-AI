# Conversational Investigation / Follow-up Questions (SQL) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the SQL Question→SQL loop into a multi-turn conversational investigation: after each result the AI suggests chain-aware follow-up questions; the panel presents a chat-style thread; each turn links to its parent in history via `parent_query_id`.

**Architecture:** Additive on the shipped SQL Generation milestone. Backend: a single combined best-effort `interpret_result(...) → (insights, followup_questions, ai_available)` replaces `generate_insights`; `generate_sql` gains an optional `chain` context; `SqlResult` gains `followup_questions`; `sql_queries` gains a nullable `parent_query_id` (new migration). Frontend: `sql-panel` becomes a thread of turns; clicking a follow-up chip proactively generates the next turn's SQL (never auto-executes). One SQL engine stays the only place SQL is generated or run.

**Tech Stack:** FastAPI + SQLModel + Alembic (Python 3.11), DuckDB (read-only sandbox), OpenRouter `complete_json` (best-effort), pytest. Frontend: Next.js 15 App Router, React 18, TypeScript, Tailwind v3, Recharts.

## Global Constraints

- **Best-effort AI:** every LLM step has a deterministic fallback and never returns a 5xx; surface an `ai_available` / `followups_ai_available` flag.
- **HITL preserved:** follow-up chips auto-generate the next SQL but **never** auto-execute it; the human always reviews/edits/executes.
- **Read-only sandbox:** SQL runs only against the in-memory pandas DataFrame (DuckDB relation `dataset`); never a live DB.
- **Single SQL engine:** all SQL generation/execution stays in `app/services/sql/`; the future AI Chat reuses it.
- **AI sees facts not data:** the LLM receives the `DatasetProfile` + chain's question/SQL/result-summary only — never raw rows.
- **Owner-guarded:** `parent_query_id`, when supplied, must reference a query owned by the same user (422 otherwise).
- **Migrations:** schema changes go through Alembic; migrations run on startup via `run_migrations()` — never `create_all`.
- **Repo rules:** do **not** run `git push` (maintainer pushes). Commit each task. Backend venv: `./.venv/Scripts/python.exe`.
- **Frontend checks:** `tsc --noEmit`, `next lint`, `next build` must pass.

---

### Task 1: Schemas — chain, follow-up, and parent-query fields

**Files:**
- Modify: `backend/app/schemas/sql.py` (add `SqlChainTurn`; add `chain` to `SqlGenerateRequest`; add `parent_query_id` to `SqlRunRequest`; add `followup_questions` + `followups_ai_available` to `SqlResult`; add `parent_query_id` to `SqlQueryRecord`)
- Test: `backend/tests/test_sql_schemas.py` (new)

**Interfaces:**
- Consumes: nothing new.
- Produces: `SqlChainTurn` (used by `generate_sql`, `interpret_result`, frontend `sqlApi.generate`); `SqlGenerateRequest.chain`, `SqlRunRequest.parent_query_id`, `SqlResult.followup_questions`/`followups_ai_available`, `SqlQueryRecord.parent_query_id` (used by routes + frontend).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_sql_schemas.py
from datetime import datetime

from app.schemas.sql import (
    SqlChainTurn,
    SqlGenerateRequest,
    SqlQueryRecord,
    SqlResult,
    SqlRunRequest,
)


def test_chain_turn_constructs():
    t = SqlChainTurn(business_question="q", sql="SELECT 1", result_summary="1 row")
    assert t.business_question == "q"


def test_generate_request_accepts_chain():
    req = SqlGenerateRequest(
        dataset_id=1,
        question="q",
        chain=[SqlChainTurn(business_question="q", sql="SELECT 1", result_summary="1 row")],
    )
    assert req.chain is not None and len(req.chain) == 1


def test_run_request_accepts_parent():
    req = SqlRunRequest(dataset_id=1, sql="SELECT 1", parent_query_id=5)
    assert req.parent_query_id == 5


def test_result_has_followups():
    r = SqlResult(
        columns=[], rows=[], row_count=0, truncated=False, duration_ms=1.0,
        followup_questions=["why?"], followups_ai_available=True,
    )
    assert r.followup_questions == ["why?"]
    assert r.followups_ai_available is True


def test_record_has_parent():
    rec = SqlQueryRecord(
        id=1, project_id=1, dataset_id=1, owner_id=1,
        business_question="q", sql="SELECT 1", edited=False, explanation="",
        insights=[], columns=[], executed_at=datetime(2026, 7, 17),
        parent_query_id=2,
    )
    assert rec.parent_query_id == 2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./.venv/Scripts/python.exe -m pytest backend/tests/test_sql_schemas.py -v`
Expected: FAIL — `ImportError` (modules/attributes don't exist yet).

- [ ] **Step 3: Write minimal implementation**

In `backend/app/schemas/sql.py`, add `SqlChainTurn` before `SqlGenerateRequest` and extend the four models:

```python
class SqlChainTurn(BaseModel):
    """One prior turn of an investigation, sent as context for chain-aware generation."""

    business_question: str
    sql: str
    result_summary: str  # 1-line summary of that turn's result


class SqlGenerateRequest(BaseModel):
    """Body for POST /sql/generate."""

    dataset_id: int
    question: str
    chain: list[SqlChainTurn] | None = None


class SqlRunRequest(BaseModel):
    """Body for POST /sql/run — the (possibly edited) SQL to execute."""

    dataset_id: int
    sql: str
    edited: bool = False  # True if the user modified the AI-generated SQL
    business_question: str | None = None
    explanation: str | None = None
    suggested_visualization: SqlVisualization | None = None
    parent_query_id: int | None = None


class SqlResult(BaseModel):
    """Execution result returned to the frontend."""

    columns: list[str]
    rows: list[dict]
    row_count: int
    truncated: bool
    duration_ms: float
    insights: list[str] = []
    insights_ai_available: bool = True
    followup_questions: list[str] = []
    followups_ai_available: bool = True
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
    executed_at: datetime
    parent_query_id: int | None = None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./.venv/Scripts/python.exe -m pytest backend/tests/test_sql_schemas.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/sql.py backend/tests/test_sql_schemas.py
git commit -m "feat(sql): add chain, follow-up, and parent-query schema fields"
```

---

### Task 2: Service — `interpret_result` replaces `generate_insights`

**Files:**
- Modify: `backend/app/services/sql/insights.py` (replace `generate_insights` with `interpret_result`)
- Modify: `backend/app/services/sql/__init__.py` (export `interpret_result`, drop `generate_insights`)
- Test: `backend/tests/test_sql_interpret.py` (new)

**Interfaces:**
- Consumes: `SqlChainTurn` (Task 1), `DatasetProfile`, `complete_json` (from `app.services.llm`).
- Produces: `interpret_result(question, sql, result_summary, profile, chain=None) -> tuple[list[str], list[str], bool]` — used by the run route (Task 5).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_sql_interpret.py
import asyncio

from app.schemas.sql import SqlChainTurn
from app.schemas.understanding import DatasetProfile
from app.services.sql import insights


def _profile() -> DatasetProfile:
    return DatasetProfile(
        file_name="t.csv", file_size=1, row_count=3, column_count=3,
        column_names=["age", "region", "score"],
        inferred_types={"age": "numeric", "region": "categorical", "score": "numeric"},
        numeric_columns=["age", "score"], categorical_columns=["region"],
        date_columns=[], missing_values={}, duplicate_row_count=0, null_percentage=0.0,
        unique_values={}, basic_statistics={}, potential_target_column=None,
        data_quality_issues=[], preview=[],
    )


def test_interpret_success(monkeypatch):
    async def fake(_s, _u, model=None):
        return {"insights": ["i1", "i2"], "followup_questions": ["f1", "f2"]}

    monkeypatch.setattr(insights, "complete_json", fake)
    ins, fups, avail = asyncio.run(
        insights.interpret_result("q", "SELECT 1", "row_count=3", _profile())
    )
    assert avail is True
    assert ins == ["i1", "i2"]
    assert fups == ["f1", "f2"]


def test_interpret_fallback_on_error(monkeypatch):
    async def boom(*a, **k):
        raise RuntimeError("no key")

    monkeypatch.setattr(insights, "complete_json", boom)
    ins, fups, avail = asyncio.run(
        insights.interpret_result("q", "SELECT 1", "row_count=3", _profile())
    )
    assert avail is False
    assert fups == []
    assert ins  # deterministic templated fallback


def test_interpret_uses_chain(monkeypatch):
    captured = {}

    async def fake(_s, u, model=None):
        captured["u"] = u
        return {"insights": ["i1"], "followup_questions": ["f1"]}

    monkeypatch.setattr(insights, "complete_json", fake)
    chain = [SqlChainTurn(business_question="q0", sql="SELECT 1", result_summary="1 row")]
    asyncio.run(insights.interpret_result("q", "SELECT 2", "row_count=2", _profile(), chain=chain))
    assert "chain" in captured["u"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./.venv/Scripts/python.exe -m pytest backend/tests/test_sql_interpret.py -v`
Expected: FAIL — `AttributeError: module 'app.services.sql.insights' has no attribute 'interpret_result'`.

- [ ] **Step 3: Write minimal implementation**

Replace the body of `backend/app/services/sql/insights.py`:

```python
"""Stage 2 — AI result interpretation (best-effort).

Sends a compact result summary (row count, columns, a few sample rows) plus the
prior investigation chain to the LLM, and returns BOTH business insights AND
concrete follow-up questions that extend the investigation. On any failure,
returns a deterministic fallback (templated insight + empty followups). Never
raises because of the LLM.
"""
from __future__ import annotations

import json

from app.schemas.sql import SqlChainTurn
from app.schemas.understanding import DatasetProfile
from app.services.llm import complete_json

_SYSTEM = (
    "You are a data analyst. Given a business question, the SQL used, a summary "
    "of the query result, and (optionally) the prior turns of an investigation "
    "chain, write 2-4 concise business insights AND 2-4 concrete, answerable "
    "follow-up questions that extend the investigation. Respond with JSON only: "
    "{\"insights\": [str, ...], \"followup_questions\": [str, ...]}."
)


def _fallback(summary: str) -> tuple[list[str], list[str], bool]:
    return [f"Query returned results. Summary: {summary}."], [], False


async def interpret_result(
    question: str,
    sql: str,
    result_summary: str,
    profile: DatasetProfile,
    chain: list[SqlChainTurn] | None = None,
) -> tuple[list[str], list[str], bool]:
    user_prompt: dict = {
        "question": question,
        "sql": sql,
        "result_summary": result_summary,
        "columns": profile.column_names,
    }
    if chain:
        user_prompt["chain"] = [
            {
                "business_question": t.business_question,
                "sql": t.sql,
                "result_summary": t.result_summary,
            }
            for t in chain
        ]
    try:
        data = await complete_json(_SYSTEM, json.dumps(user_prompt, indent=2))
        if not isinstance(data, dict):
            return _fallback(result_summary)
        insights = [str(i) for i in data.get("insights", [])][:5]
        followups = [str(i) for i in data.get("followup_questions", [])][:5]
        if not insights:
            insights, _, _ = _fallback(result_summary)
        return insights, followups, True
    except Exception:
        return _fallback(result_summary)
```

Update `backend/app/services/sql/__init__.py`:

```python
"""Single SQL engine for InsightFlow: generate, validate, execute, interpret.

This is the ONLY place SQL is generated or executed. The future AI Chat module
reuses exactly this package — there is no second SQL system.
"""
from app.services.sql.engine import execute_query, suggest_chart, validate_sql
from app.services.sql.insights import interpret_result
from app.services.sql.proposer import generate_sql

__all__ = ["generate_sql", "validate_sql", "execute_query", "suggest_chart", "interpret_result"]
```

> Note: between this commit and Task 5, `app/api/routes/sql.py` still imports the removed `generate_insights`, so the app will not start. That import is fixed in Task 5. The committed unit tests here do not import the route, so `pytest` passes.

- [ ] **Step 4: Run test to verify it passes**

Run: `./.venv/Scripts/python.exe -m pytest backend/tests/test_sql_interpret.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/sql/insights.py backend/app/services/sql/__init__.py backend/tests/test_sql_interpret.py
git commit -m "feat(sql): replace generate_insights with combined interpret_result"
```

---

### Task 3: Service — `generate_sql` gains `chain` context

**Files:**
- Modify: `backend/app/services/sql/proposer.py` (add `chain` param; inject chain into prompt)
- Modify: `backend/tests/test_sql_proposer.py` (add chain test)

**Interfaces:**
- Consumes: `SqlChainTurn` (Task 1), `DatasetProfile`, `DatasetUnderstanding`, `validate_sql`.
- Produces: `generate_sql(question, profile, understanding=None, chain=None) -> SqlProposal` — used by the generate route (Task 5).

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_sql_proposer.py` (add the `SqlChainTurn` import at the top):

```python
from app.schemas.sql import SqlChainTurn
```

```python
def test_generate_uses_chain(monkeypatch):
    captured = {}

    async def fake(_s, u, model=None):
        captured["u"] = u
        return {"sql": "SELECT age FROM dataset", "explanation": "e", "confidence": 0.9}

    monkeypatch.setattr(proposer, "complete_json", fake)
    chain = [SqlChainTurn(business_question="q0", sql="SELECT 1", result_summary="1 row")]
    p = asyncio.run(proposer.generate_sql("q", _profile(), chain=chain))
    assert p.ai_available is True
    assert "chain" in captured["u"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./.venv/Scripts/python.exe -m pytest backend/tests/test_sql_proposer.py::test_generate_uses_chain -v`
Expected: FAIL — `TypeError` (`generate_sql()` got an unexpected keyword argument `chain`).

- [ ] **Step 3: Write minimal implementation**

In `backend/app/services/sql/proposer.py`:
- Change the import line to also bring in `SqlChainTurn`:
  ```python
  from app.schemas.sql import SqlProposal, SqlVisualization, SqlChainTurn
  ```
- Change the signature:
  ```python
  async def generate_sql(
      question: str,
      profile: DatasetProfile,
      understanding: DatasetUnderstanding | None = None,
      chain: list[SqlChainTurn] | None = None,
  ) -> SqlProposal:
  ```
- Build the prompt dict and inject the chain before dumping:
  ```python
      profile_json = profile.model_dump(mode="json")
      profile_json.pop("preview", None)  # never send raw-looking rows
      user_prompt: dict = {"question": question, "profile": profile_json}
      if chain:
          user_prompt["chain"] = [
              {
                  "business_question": t.business_question,
                  "sql": t.sql,
                  "result_summary": t.result_summary,
              }
              for t in chain
          ]
      user_prompt = json.dumps(user_prompt, indent=2)
  ```

- [ ] **Step 4: Run test to verify it passes**

Run: `./.venv/Scripts/python.exe -m pytest backend/tests/test_sql_proposer.py -v`
Expected: PASS (5 tests total).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/sql/proposer.py backend/tests/test_sql_proposer.py
git commit -m "feat(sql): pass investigation chain into generate_sql"
```

---

### Task 4: Model + migration — `parent_query_id` on `sql_queries`

**Files:**
- Modify: `backend/app/models/sql_query.py` (add nullable `parent_query_id`)
- Create: `backend/alembic/versions/f7a8b9c0d1e2_add_parent_query_id.py` (new migration)

**Interfaces:**
- Consumes: nothing new.
- Produces: `SqlQuery.parent_query_id` column + `ix_sql_queries_parent_query_id` index; the run route (Task 5) persists it.

- [ ] **Step 1: Add the field to the model**

In `backend/app/models/sql_query.py`, add after the `owner_id` line:

```python
    owner_id: int = Field(index=True, foreign_key="users.id")
    parent_query_id: int | None = Field(default=None, foreign_key="sql_queries.id", index=True)
```

- [ ] **Step 2: Create the migration**

Create `backend/alembic/versions/f7a8b9c0d1e2_add_parent_query_id.py`:

```python
"""add parent_query_id to sql_queries

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-07-17 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel  # provides AutoString used by SQLModel columns


revision: str = 'f7a8b9c0d1e2'
down_revision: Union[str, Sequence[str], None] = 'e6f7a8b9c0d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sql_queries', sa.Column('parent_query_id', sa.Integer(), nullable=True))
    op.create_index('ix_sql_queries_parent_query_id', 'sql_queries', ['parent_query_id'])
    op.create_foreign_key(
        'fk_sql_queries_parent_query_id', 'sql_queries', 'sql_queries',
        ['parent_query_id'], ['id'],
    )


def downgrade() -> None:
    op.drop_constraint('fk_sql_queries_parent_query_id', 'sql_queries', type_='foreignkey')
    op.drop_index('ix_sql_queries_parent_query_id', table_name='sql_queries')
    op.drop_column('sql_queries', 'parent_query_id')
```

- [ ] **Step 3: Verify it compiles and the field exists**

Run: `./.venv/Scripts/python.exe -m py_compile backend/app/models/sql_query.py backend/alembic/versions/f7a8b9c0d1e2_add_parent_query_id.py && ./.venv/Scripts/python.exe -c "from app.models.sql_query import SqlQuery; assert 'parent_query_id' in SqlQuery.model_fields"`
Expected: no output / exit 0, and the assertion passes.

> The migration is applied automatically on app startup via `run_migrations()` and is fully exercised by the e2e in Task 5.

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/sql_query.py backend/alembic/versions/f7a8b9c0d1e2_add_parent_query_id.py
git commit -m "feat(sql): add parent_query_id to sql_queries for investigation chains"
```

---

### Task 5: Routes — wire chain, interpretation, and parent linkage

**Files:**
- Modify: `backend/app/api/routes/sql.py` (generate passes `chain`; run uses `interpret_result`, persists `parent_query_id`, returns followups; parent-ownership check)

**Interfaces:**
- Consumes: `generate_sql(chain=)` (Task 3), `interpret_result` (Task 2), `SqlResult.followup_questions`/`followups_ai_available` + `SqlRunRequest.parent_query_id` + `SqlQueryRecord.parent_query_id` (Task 1), `SqlQuery.parent_query_id` (Task 4).
- Produces: endpoints returning followups and persisting `parent_query_id`; verified by e2e (Step 3).

- [ ] **Step 1: Update imports and the generate route**

In `backend/app/api/routes/sql.py`:
- Change the import block at the top to drop `generate_insights` and add `interpret_result` + `SqlChainTurn`:
  ```python
  from app.schemas.sql import (
      SqlChainTurn,
      SqlGenerateRequest,
      SqlProposal,
      SqlQueryRecord,
      SqlResult,
      SqlRunRequest,
  )
  from app.services.sql.insights import interpret_result
  ```
- In `generate`, pass the chain through:
  ```python
      return await generate_sql(body.question, profile, understanding, chain=body.chain)
  ```

- [ ] **Step 2: Update the run route**

Replace the `generate_insights(...)` call and the persistence/return so it uses `interpret_result`, stores `parent_query_id`, and returns followups. Replace this block:

```python
    insight_items, insights_avail = await generate_insights(
        body.business_question or "", body.sql, summary, profile
    )

    record = SqlQuery(
        project_id=ds.project_id, dataset_id=ds.id, owner_id=current_user.id,
        business_question=body.business_question or "", sql=body.sql, edited=body.edited,
        explanation=body.explanation or "", suggested_visualization=viz, insights=insight_items,
        columns=res["columns"], row_count=res["row_count"], truncated=res["truncated"],
        duration_ms=res["duration_ms"],
    )
    session.add(record)
    session.commit()
    session.refresh(record)

    return SqlResult(
        columns=res["columns"], rows=res["rows"], row_count=res["row_count"],
        truncated=res["truncated"], duration_ms=res["duration_ms"], insights=insight_items,
        insights_ai_available=insights_avail, persisted_id=record.id,
    )
```

with:

```python
    # Optional parent linkage — must belong to the same owner (owner-guarded).
    parent_id = None
    if body.parent_query_id is not None:
        parent = session.get(SqlQuery, body.parent_query_id)
        if parent is None or parent.owner_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="parent_query_id is invalid or not owned by you.",
            )
        parent_id = parent.id

    chain = None
    if parent_id is not None:
        chain = [SqlChainTurn(business_question=parent.business_question, sql=parent.sql,
                              result_summary=f"row_count={parent.row_count}")]

    insight_items, followups, insights_avail = await interpret_result(
        body.business_question or "", body.sql, summary, profile, chain=chain
    )

    record = SqlQuery(
        project_id=ds.project_id, dataset_id=ds.id, owner_id=current_user.id,
        business_question=body.business_question or "", sql=body.sql, edited=body.edited,
        explanation=body.explanation or "", suggested_visualization=viz, insights=insight_items,
        columns=res["columns"], row_count=res["row_count"], truncated=res["truncated"],
        duration_ms=res["duration_ms"], parent_query_id=parent_id,
    )
    session.add(record)
    session.commit()
    session.refresh(record)

    return SqlResult(
        columns=res["columns"], rows=res["rows"], row_count=res["row_count"],
        truncated=res["truncated"], duration_ms=res["duration_ms"], insights=insight_items,
        insights_ai_available=insights_avail, followup_questions=followups,
        followups_ai_available=insights_avail, persisted_id=record.id,
    )
```

- [ ] **Step 3: Run the manual e2e (local Postgres required)**

Run an in-process TestClient round-trip (register → project → upload a CSV with a `region`/`score` column → analyze → generate → run → assert followups + parent linkage → cleanup). Save the script to `backend/tests/manual_sql_followups_e2e.py` (marked `# not collected by pytest` — it needs a live DB) and run it:

```bash
./.venv/Scripts/python.exe backend/tests/manual_sql_followups_e2e.py
```

Expected behavior the script asserts:
- `POST /sql/generate` with a `chain` returns a `SqlProposal`.
- `POST /sql/run` with valid SQL returns `SqlResult` with `followup_questions` (possibly `[]` on LLM fallback) and `followups_ai_available`.
- The persisted `SqlQueryRecord` (via `GET /sql/history`) carries `parent_query_id` when a parent was supplied, and `None` when not.
- `POST /sql/run` with a `parent_query_id` owned by a *different* user → 422; a valid parent → 200 and the child row shows `parent_query_id`.

A minimal skeleton (fill in the setup helpers from the SQL milestone's manual e2e):

```python
# backend/tests/manual_sql_followups_e2e.py
# Manual e2e — requires a live Postgres (DATABASE_URL). Not collected by pytest.
import io

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)  # runs migrations on startup


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_followups_and_parent():
    # 1. register + login + create project
    email = "followup_e2e@example.com"
    client.post("/api/v1/auth/register", json={"email": email, "password": "pw"})
    tok = client.post("/api/v1/auth/login", data={"username": email, "password": "pw"}).json()["access_token"]
    h = _auth_headers(tok)
    proj = client.post("/api/v1/projects", json={"name": "p", "description": "d"}, headers=h).json()
    pid = proj["id"]

    # 2. upload a tiny CSV
    csv_bytes = b"region,score\nnorth,10\nsouth,20\nwest,5\n"
    up = client.post(
        f"/api/v1/datasets/projects/{pid}",
        headers=h, files={"file": ("t.csv", io.BytesIO(csv_bytes), "text/csv")},
    ).json()
    did = up["id"]

    # 3. analyze (profile) then generate + run
    client.post(f"/api/v1/datasets/{did}/understand", headers=h).json()
    gen = client.post("/api/v1/sql/generate", json={"dataset_id": did, "question": "top region by score"}, headers=h).json()
    assert "sql" in gen
    run1 = client.post("/api/v1/sql/run", json={"dataset_id": did, "sql": gen["sql"], "business_question": "top region by score"}, headers=h).json()
    assert run1["persisted_id"] is not None
    # followup_questions present (may be empty on LLM fallback)
    assert isinstance(run1["followup_questions"], list)

    # 4. follow-up run linked to parent #1
    run2 = client.post("/api/v1/sql/run", json={"dataset_id": did, "sql": "SELECT * FROM dataset", "business_question": "details for south", "parent_query_id": run1["persisted_id"]}, headers=h).json()
    hist = client.get(f"/api/v1/sql/history?project_id={pid}", headers=h).json()
    by_id = {r["id"]: r for r in hist}
    assert by_id[run2["persisted_id"]]["parent_query_id"] == run1["persisted_id"]
    assert by_id[run1["persisted_id"]]["parent_query_id"] is None

    # 5. invalid parent (foreign id) -> 422
    bad = client.post("/api/v1/sql/run", json={"dataset_id": did, "sql": "SELECT 1", "parent_query_id": 999999}, headers=h)
    assert bad.status_code == 422

    print("OK: followups + parent linkage verified")


if __name__ == "__main__":
    test_followups_and_parent()
```

> If the OpenRouter key is unset, `followup_questions` will be `[]` with `followups_ai_available=False` — that is the intended best-effort fallback, and the test still passes.

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/routes/sql.py backend/tests/manual_sql_followups_e2e.py
git commit -m "feat(sql): wire chain into generate, interpret_result + parent_query_id into run"
```

---

### Task 6: Frontend — types and API client

**Files:**
- Modify: `frontend/lib/types.ts` (add `SqlChainTurn`; extend `SqlGenerateRequest`, `SqlRunRequest`, `SqlResult`, `SqlQueryRecord`)
- Modify: `frontend/lib/api.ts` (`sqlApi.generate(req)` typed; `run` already takes `SqlRunRequest`)

**Interfaces:**
- Consumes: backend schemas from Tasks 1–5.
- Produces: `SqlChainTurn` type + updated `sqlApi.generate` signature, consumed by `sql-panel.tsx` (Task 7).

- [ ] **Step 1: Add types in `frontend/lib/types.ts`**

After the `SqlVisualization` interface (around line 180), add:

```ts
export interface SqlChainTurn {
  business_question: string;
  sql: string;
  result_summary: string;
}
```

Update `SqlGenerateRequest` (currently `dataset_id: number; question: string;`):

```ts
export interface SqlGenerateRequest {
  dataset_id: number;
  question: string;
  chain?: SqlChainTurn[] | null;
}
```

Update `SqlRunRequest` (add the parent id):

```ts
export interface SqlRunRequest {
  dataset_id: number;
  sql: string;
  edited?: boolean;
  business_question?: string | null;
  explanation?: string | null;
  suggested_visualization?: SqlVisualization | null;
  parent_query_id?: number | null;
}
```

Update `SqlResult` (add follow-ups):

```ts
export interface SqlResult {
  columns: string[];
  rows: Record<string, unknown>[];
  row_count: number;
  truncated: boolean;
  duration_ms: number;
  insights: string[];
  insights_ai_available: boolean;
  followup_questions: string[];
  followups_ai_available: boolean;
  persisted_id: number | null;
}
```

Update `SqlQueryRecord` (add parent id):

```ts
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
  parent_query_id: number | null;
}
```

- [ ] **Step 2: Update `frontend/lib/api.ts`**

Change the `sqlApi.generate` signature to accept the typed request (the panel now passes `chain`):

```ts
  generate(req: SqlGenerateRequest): Promise<SqlProposal> {
    return request<SqlProposal>("/api/v1/sql/generate", {
      method: "POST",
      body: JSON.stringify(req),
    });
  },
```

Add `SqlGenerateRequest` to the type import at the top of `frontend/lib/api.ts`:

```ts
import type {
  ChartSpec,
  CleaningOperation,
  CleaningPlan,
  DatasetRead,
  EdaAcceptRequest,
  EdaResult,
  ProjectCreate,
  ProjectRead,
  SqlGenerateRequest,
  SqlProposal,
  SqlQueryRecord,
  SqlResult,
  SqlRunRequest,
  Token,
  UserRead,
} from "@/lib/types";
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/types.ts frontend/lib/api.ts
git commit -m "feat(sql): frontend types + api for chain and parent linkage"
```

---

### Task 7: Frontend — `sql-panel` becomes a chat-style thread

**Files:**
- Modify: `frontend/components/sql-panel.tsx` (full rework into a thread of turns)

**Interfaces:**
- Consumes: `sqlApi.generate(req)` (Task 6) with `chain`; `sqlApi.run(req)` with `parent_query_id`; `SqlProposal`/`SqlResult`/`SqlChainTurn` types (Task 6); `ChartRenderer` + `buildChartSpec` (unchanged from the existing panel).
- Produces: a multi-turn investigation UI; clicking a follow-up chip appends a reviewed (not auto-executed) turn.

- [ ] **Step 1: Replace `frontend/components/sql-panel.tsx` with the thread version**

Keep `ConfidenceBadge` and `buildChartSpec` from the existing panel; replace the `SqlPanel` component body with a thread. Full file:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
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
  SqlChainTurn,
  SqlProposal,
  SqlQueryRecord,
  SqlResult,
  SqlVisualization,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const cls =
    pct >= 80
      ? "bg-primary/15 text-primary"
      : pct >= 50
        ? "bg-secondary text-secondary-foreground"
        : "bg-destructive/15 text-destructive";
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{pct}% conf.</span>
  );
}

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
    chart_type: viz.chart_type as ChartSpec["chart_type"],
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

interface Turn {
  id: number;
  question: string;
  proposal: SqlProposal | null;
  sqlText: string;
  generating: boolean;
  running: boolean;
  result: SqlResult | null;
  error: string | null;
  parentQueryId: number | null; // persisted id of the turn this followed up
  persistedId: number | null;
}

let TURN_SEQ = 0;

export function SqlPanel({ dataset, onClose }: { dataset: DatasetRead; onClose: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [generating, setGenerating] = useState(false);
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

  // Build chain context from all prior turns that have a result.
  function buildChain(): SqlChainTurn[] {
    return turns
      .filter((t) => t.result)
      .map((t) => ({
        business_question: t.question,
        sql: t.sqlText,
        result_summary: `row_count=${t.result!.row_count}`,
      }));
  }

  async function generateNext(q: string, parentPersistedId: number | null) {
    if (!q.trim()) return;
    const turnId = ++TURN_SEQ;
    const newTurn: Turn = {
      id: turnId,
      question: q,
      proposal: null,
      sqlText: "",
      generating: true,
      running: false,
      result: null,
      error: null,
      parentQueryId: parentPersistedId,
      persistedId: null,
    };
    setTurns((prev) => [...prev, newTurn]);
    setError(null);
    try {
      const chain = buildChain();
      const p = await sqlApi.generate({
        dataset_id: dataset.id,
        question: q,
        chain: chain.length ? chain : null,
      });
      setTurns((prev) =>
        prev.map((t) =>
          t.id === turnId ? { ...t, proposal: p, sqlText: p.sql, generating: false } : t,
        ),
      );
    } catch (err) {
      setTurns((prev) =>
        prev.map((t) =>
          t.id === turnId
            ? { ...t, generating: false, error: err instanceof Error ? err.message : "Generation failed" }
            : t,
        ),
      );
    }
  }

  async function executeTurn(turnId: number) {
    setTurns((prev) =>
      prev.map((t) => (t.id === turnId ? { ...t, running: true, error: null } : t)),
    );
    const turn = turns.find((t) => t.id === turnId);
    if (!turn) return;
    try {
      const r = await sqlApi.run({
        dataset_id: dataset.id,
        sql: turn.sqlText,
        edited: turn.proposal ? turn.sqlText !== turn.proposal.sql : true,
        business_question: turn.question,
        explanation: turn.proposal?.explanation ?? "",
        suggested_visualization: turn.proposal?.suggested_visualization ?? null,
        parent_query_id: turn.parentQueryId,
      });
      setTurns((prev) =>
        prev.map((t) =>
          t.id === turnId ? { ...t, running: false, result: r, persistedId: r.persisted_id } : t,
        ),
      );
      await loadHistory();
    } catch (err) {
      setTurns((prev) =>
        prev.map((t) =>
          t.id === turnId
            ? { ...t, running: false, error: err instanceof Error ? err.message : "Execution failed" }
            : t,
        ),
      );
    }
  }

  // Clicking a follow-up chip proactively generates the next turn (does NOT execute it).
  async function onFollowup(turnId: number, q: string) {
    const parent = turns.find((t) => t.id === turnId);
    await generateNext(q, parent?.persistedId ?? null);
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
            <p className="text-sm text-muted-foreground">
              Ask a question; review, edit, and run SQL. Follow-ups continue the investigation.
            </p>
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

          {/* Ask box (starts a new investigation turn) */}
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. What is the average score by region?"
                className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                onKeyDown={(e) => e.key === "Enter" && !generating && (void generateNext(question, null))}
              />
              <Button onClick={() => generateNext(question, null)} disabled={generating || !question.trim()}>
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate
              </Button>
            </div>
          </div>

          {/* Thread of turns */}
          <div className="flex flex-col gap-4">
            {turns.map((t) => (
              <div key={t.id} className="flex flex-col gap-2 rounded-md border p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="h-4 w-4 text-primary" />
                  {t.question}
                  {t.parentQueryId !== null && (
                    <span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">
                      follow-up
                    </span>
                  )}
                </div>

                {t.generating && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Generating SQL…
                  </div>
                )}
                {t.error && !t.generating && (
                  <div className="flex items-center gap-2 text-xs text-destructive">
                    <TriangleAlert className="h-3 w-3" /> {t.error}
                  </div>
                )}

                {t.proposal && !t.generating && (
                  <>
                    {t.proposal.explanation && (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium">AI:</span> {t.proposal.explanation}{" "}
                        <ConfidenceBadge value={t.proposal.confidence} />
                      </p>
                    )}
                    <textarea
                      value={t.sqlText}
                      onChange={(e) =>
                        setTurns((prev) =>
                          prev.map((p) => (p.id === t.id ? { ...p, sqlText: e.target.value } : p)),
                        )
                      }
                      rows={5}
                      spellCheck={false}
                      className="w-full rounded-md border bg-muted/30 p-2 font-mono text-xs"
                      placeholder="SELECT * FROM dataset LIMIT 10"
                    />
                    <Button
                      onClick={() => executeTurn(t.id)}
                      disabled={t.running || !t.sqlText.trim()}
                      className="self-start"
                    >
                      {t.running ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                      Execute
                    </Button>
                  </>
                )}

                {t.result && (
                  <div className="flex flex-col gap-3 rounded-md border p-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {t.result.row_count} rows · {t.result.duration_ms} ms
                        {t.result.truncated ? " · truncated" : ""}
                      </span>
                    </div>
                    <div className="max-h-64 overflow-auto rounded border">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-muted text-muted-foreground">
                          <tr>
                            {t.result.columns.map((c) => (
                              <th key={c} className="px-2 py-1 font-medium">
                                {c}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {t.result.rows.map((row, i) => (
                            <tr key={i} className="border-t">
                              {t.result!.columns.map((c) => (
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
                      const viz = t.proposal?.suggested_visualization;
                      if (!viz) return null;
                      const spec = buildChartSpec(viz, t.result!);
                      if (!spec) return null;
                      return (
                        <div className="rounded-md border bg-muted/30 p-2">
                          <ChartRenderer spec={spec} />
                        </div>
                      );
                    })()}

                    {t.result.insights.length > 0 && (
                      <div className="flex flex-col gap-1">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Insights {!t.result.insights_ai_available ? "(auto)" : ""}
                        </h4>
                        <ul className="flex flex-col gap-1">
                          {t.result.insights.map((ins, i) => (
                            <li key={i} className="text-sm">
                              • {ins}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Follow-up chips — click to continue the investigation (proactive generate, no auto-run) */}
                    {t.result.followup_questions.length > 0 && (
                      <div className="flex flex-col gap-1">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Suggested follow-ups
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {t.result.followup_questions.map((q, i) => (
                            <button
                              key={i}
                              onClick={() => onFollowup(t.id, q)}
                              className="rounded-full border px-3 py-1 text-xs hover:bg-secondary"
                            >
                              {q}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* History (threaded via parent_query_id) */}
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
                <div
                  key={rec.id}
                  className={`flex items-start justify-between gap-2 rounded-md border p-2 text-xs ${
                    rec.parent_query_id !== null ? "ml-4 border-dashed" : ""
                  }`}
                >
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

- [ ] **Step 2: Lint and type-check**

Run: `cd frontend && npx next lint && npx tsc --noEmit`
Expected: no lint or type errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/sql-panel.tsx
git commit -m "feat(sql): rework sql-panel into a multi-turn investigation thread"
```

---

### Task 8: Docs + full verification

**Files:**
- Modify: `PROJECT_PROGRESS.md` (add the new milestone line; extend the milestone timeline)
- Modify: `DEVELOPMENT_LOG.md` (add a shipped entry)

**Interfaces:**
- Consumes: all prior tasks.
- Produces: updated progress/docs; final green verification.

- [ ] **Step 1: Backend tests + compile**

Run: `./.venv/Scripts/python.exe -m pytest backend/tests/test_sql_schemas.py backend/tests/test_sql_interpret.py backend/tests/test_sql_proposer.py backend/tests/test_sql_engine.py -v`
Expected: all PASS (no import errors — routes were fixed in Task 5).

- [ ] **Step 2: Re-run the manual e2e**

Run: `./.venv/Scripts/python.exe backend/tests/manual_sql_followups_e2e.py`
Expected: prints `OK: followups + parent linkage verified`.

- [ ] **Step 3: Frontend build**

Run: `cd frontend && npx next build`
Expected: build succeeds.

- [ ] **Step 4: Update `PROJECT_PROGRESS.md`**

Add a milestone block under the "Current Sprint" section (e.g. **Sprint 2 — Conversational Investigation**), ticking a single line:

```
- [x] **M1 — Conversational investigation (follow-up questions):** multi-turn chain + chat-style
      thread UI + `parent_query_id`-linked history; combined `interpret_result` (insights +
      follow-ups); HITL preserved (follow-ups auto-generate, never auto-execute)
```

Extend the milestone timeline table with:

```
| Conversational Investigation | 2026-07-24 | ✅ Complete |
```

- [ ] **Step 5: Update `DEVELOPMENT_LOG.md`**

Add a dated entry:

```
## 2026-07-17 — Sprint 2, M3: Conversational Investigation (follow-up questions) (shipped)

Additive milestone on the SQL Generation engine. Turns isolated queries into a multi-turn
investigation: after each result the AI suggests chain-aware follow-up questions; the panel is a
chat-style thread; each turn links to its parent in history.

- **`app/schemas/sql.py`** — `SqlChainTurn`; `SqlGenerateRequest.chain`; `SqlRunRequest.parent_query_id`;
  `SqlResult.followup_questions`/`followups_ai_available`; `SqlQueryRecord.parent_query_id`.
- **`app/services/sql/insights.py`** — `interpret_result(question, sql, result_summary, profile, chain=None)`
  replaces `generate_insights`: one best-effort `complete_json` call returns `(insights,
  followup_questions, ai_available)`. On failure → templated insight + empty followups.
- **`app/services/sql/proposer.py`** — `generate_sql` gains `chain` (prior turns injected into the
  prompt) so follow-up SQL is informed by the investigation so far.
- **`app/models/sql_query.py`** + migration `f7a8b9c0d1e2` — nullable `parent_query_id`
  (self-FK + index) links each turn to the one it followed up.
- **`app/api/routes/sql.py`** — `generate` forwards `chain`; `run` calls `interpret_result`,
  persists `parent_query_id` (owner-guarded: foreign/invalid parent → 422), returns
  `followup_questions`.
- **Frontend** — `lib/types.ts` (`SqlChainTurn` + extended contracts), `lib/api.ts`
  (`sqlApi.generate(req)`), `components/sql-panel.tsx` reworked into a thread: each turn shows the
  question, editable SQL, result table, chart, insights, and follow-up chips; clicking a chip
  proactively generates the next turn's SQL (**never auto-executes** — HITL preserved); history
  renders the chain (indented under the parent).

Verified: `pytest` (schemas + interpreter + proposer + engine), `tsc`/`next lint`/`next build` all
pass; manual TestClient e2e confirms generate-with-chain, run returns followups, persisted row
carries `parent_query_id`, invalid parent → 422.
```

- [ ] **Step 6: Commit**

```bash
git add PROJECT_PROGRESS.md DEVELOPMENT_LOG.md
git commit -m "docs: conversational investigation milestone shipped"
```

---

## Self-review notes

- **Spec coverage:** chain context (Tasks 1–3, 5, 7), combined `interpret_result` (Task 2, 5), `followup_questions` on `SqlResult` (Task 1, 5), `parent_query_id` model + migration + persistence + history linkage (Tasks 1, 4, 5, 7), chat-style thread UI (Task 7), HITL preserved / no auto-execute (Task 7), owner-guarded parent (Task 5), verification (Tasks 1–3, 5, 8). All spec sections map to a task.
- **No placeholders:** every step has runnable code or a concrete command.
- **Type consistency:** `interpret_result(question, sql, result_summary, profile, chain=None)` matches its tests and the route call; `generate_sql(..., chain=None)` matches; `SqlChainTurn` is identical across schema/tests/route/frontend; `followup_questions`/`followups_ai_available` and `parent_query_id` are named identically in schemas, routes, and frontend types.
