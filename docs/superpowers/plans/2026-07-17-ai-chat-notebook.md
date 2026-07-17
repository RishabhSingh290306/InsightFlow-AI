# AI Chat & Notebook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a chat-first conversational analyst that streams its answer live (SSE), orchestrates the existing SQL/EDA/cleaning/dashboard/report engines, and persists the conversation as a shareable notebook.

**Architecture:** A notebook is a saved chat session (`notebooks` row, `turns` JSON). Each user message triggers a two-call AI turn — an intent call (`complete_json`) selects proposed artifacts, then a narrative call (`complete_stream`, the new primitive) streams prose over SSE; the backend deterministically runs each proposed artifact through existing engines and emits it as an `artifact` event. All AI steps are best-effort with a deterministic fallback; HITL means artifacts are proposals until the human executes them via existing guarded endpoints.

**Tech Stack:** FastAPI + SQLModel + Alembic (Postgres); `httpx` streaming; Next.js 15 App Router + TypeScript + Tailwind + Recharts (`ChartRenderer`); SSE consumed via `fetch` + `ReadableStream` (EventSource can't POST).

## Global Constraints

- All API routes are versioned under `/api/v1` (`settings.API_V1_PREFIX`); Next.js rewrites `/api/*` → backend. (CLAUDE.md)
- Deterministic code computes facts; the LLM only interprets structured facts (never raw data) and proposes from a fixed catalog; every AI step is best-effort with a deterministic fallback; no workflow returns a 5xx because the LLM was unavailable. (CLAUDE.md / spec §2)
- Existing engines (sql, eda, cleaning, dashboard, reporting) are **called, never modified**. (spec §4.2)
- DB schema changes go through Alembic migrations run on startup (`run_migrations`); never `create_all`. (CLAUDE.md)
- Model IDs are **integers** (`id: int | None` PK; FKs `project_id`/`owner_id`/`dataset_id` are `int`), matching `Dataset`/`Dashboard`/`Report`. (verified in `app/models/dashboard.py`, `app/models/dataset.py`)
- JSON columns are declared `dict | None = Field(default=None, sa_column=Column(JSON))` (bare `sa_column=JSON` raises at import). (verified in `app/models/dashboard.py:30`)
- Owner guard convention: return **403** if the row exists but belongs to another user, **404** if absent. (verified in `app/api/routes/dashboards.py:_owned`)
- Share tokens generated with `secrets.token_urlsafe(32)`; public share routes take **no auth dependency** and return only safe fields. (verified in `app/api/routes/reports.py:92,155`)
- Tests live in `backend/tests/*.py`, use `TestClient(app)` (runs migrations on startup), register+login a user, then exercise endpoints; pure functions get unit tests. Live-Postgres e2e tests are not in unit CI. (verified in `backend/tests/manual_dashboard_e2e.py`)
- Frontend `lib/api.ts` `request<T>` wrapper sets JSON + Bearer; `BASE` is same-origin in dev. (verified)
- Frontend type convention: `XxxRead`/`XxxRequest` mirror backend Pydantic names. (verified in `frontend/lib/types.ts`)

---

## File Structure

**New backend**
- `backend/app/services/llm.py` (modify) — add `complete_stream` async generator.
- `backend/app/services/chat/__init__.py` (new, empty) — package marker.
- `backend/app/services/chat/context.py` (new) — `build_chat_context(...)` → `ChatContext`.
- `backend/app/services/chat/orchestrator.py` (new) — `plan_turn`, `stream_narrative`, `_fallback_turn`.
- `backend/app/services/chat/executor.py` (new) — `run_action` per action type.
- `backend/app/schemas/chat.py` (new) — `ChatContext`, `ChatAction`, `ChatArtifact`, `ChatTurn`, `Notebook*`, `ChatMessageRequest`, `SSEEvent`.
- `backend/app/models/notebook.py` (new) — `Notebook` SQLModel table.
- `backend/app/models/__init__.py` (modify) — register `Notebook`.
- `backend/app/api/routes/chat.py` (new) — SSE `/chat/message` + notebooks CRUD + share; mount in `main.py`.
- `backend/alembic/versions/i0j1k2l3m4n5_add_notebooks_table.py` (new) — migration.
- `backend/tests/test_chat_llm.py`, `test_chat_orchestrator.py`, `test_chat_executor.py`, `manual_chat_e2e.py` (new).

**Modified backend**
- `backend/app/main.py` — import `chat` router, `include_router`.

**New frontend**
- `frontend/lib/types.ts` (modify) — add `Chat*`/`Notebook*` types.
- `frontend/lib/api.ts` (modify) — add `chatApi` (SSE consumer) + `notebooksApi`.
- `frontend/components/chat-panel.tsx` (new) — core chat UI + artifact cards.
- `frontend/components/notebook-share.tsx` (new) — read-only share renderer.
- `frontend/app/notebooks/[id]/page.tsx` (new) — owner notebook page.
- `frontend/app/notebooks/share/[token]/page.tsx` (new) — public share page.

**Modified frontend**
- `frontend/app/projects/[id]/page.tsx` — add Chat entry points (dataset + project header).

---

## Milestone 1 — Chat foundation + streaming + SQL (vertical slice)

### Task 1: Streaming LLM primitive

**Files:**
- Modify: `backend/app/services/llm.py`
- Test: `backend/tests/test_chat_llm.py`

**Interfaces:**
- Produces: `async def complete_stream(system_prompt: str, user_prompt: str, model: str | None = None) -> AsyncGenerator[str, None]` — yields text deltas; raises on missing key / connection error.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_chat_llm.py
import asyncio
import os

import pytest

from app.services.llm import complete_stream


def test_complete_stream_yields_text(monkeypatch):
    # Stub httpx.AsyncClient to return an SSE stream without touching the network.
    class _Resp:
        def __init__(self): self.status_code = 200
        def raise_for_status(self): pass
        async def aiter_lines(self):
            yield 'data: {"choices":[{"delta":{"content":"Hello"}}]}'
            yield 'data: {"choices":[{"delta":{"content":" world"}}]}'
            yield "data: [DONE]"

    class _Client:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def post(self, *a, **k): return _Resp()

    monkeypatch.setattr("app.services.llm.httpx.AsyncClient", _Client)
    monkeypatch.setattr("app.services.llm.settings.OPENROUTER_API_KEY", "x")

    async def run():
        out = "".join([t async for t in complete_stream("s", "u")])
        return out
    assert asyncio.run(run()) == "Hello world"


def test_complete_stream_raises_without_key(monkeypatch):
    monkeypatch.setattr("app.services.llm.settings.OPENROUTER_API_KEY", "")
    with pytest.raises(RuntimeError):
        async def run():
            async for _ in complete_stream("s", "u"):
                pass
        asyncio.run(run())
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_chat_llm.py -v`
Expected: FAIL (`complete_stream` not defined / ImportError).

- [ ] **Step 3: Implement the primitive**

Append to `backend/app/services/llm.py` (keep the existing `complete_json` untouched):

```python
from collections.abc import AsyncGenerator  # add to the imports at top

import httpx  # already imported


async def complete_stream(
    system_prompt: str, user_prompt: str, model: str | None = None
) -> AsyncGenerator[str, None]:
    """Yield text deltas from OpenRouter's streaming chat completion.

    Raises on a missing key or any API error so callers can fall back to a
    deterministic, non-streamed answer. Never returns raw data.
    """
    if not settings.OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY is not configured")
    model = model or settings.OPENROUTER_MODEL
    async with httpx.AsyncClient(timeout=90.0) as client:
        async with client.stream(
            "POST",
            f"{settings.OPENROUTER_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://insightflow.ai",
                "X-Title": "InsightFlow AI",
            },
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "stream": True,
                "temperature": 0.2,
            },
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line or not line.startswith("data:"):
                    continue
                payload = line[len("data:"):].strip()
                if payload == "[DONE]":
                    break
                try:
                    data = json.loads(payload)
                except json.JSONDecodeError:
                    continue
                delta = data.get("choices", [{}])[0].get("delta", {})
                content = delta.get("content")
                if content:
                    yield content
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_chat_llm.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/llm.py backend/tests/test_chat_llm.py
git commit -m "feat(chat): streaming LLM primitive complete_stream"
```

---

### Task 2: `notebooks` table — model, migration, registration

**Files:**
- Create: `backend/app/models/notebook.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/alembic/versions/i0j1k2l3m4n5_add_notebooks_table.py`

**Interfaces:**
- Produces: `Notebook` SQLModel (table `notebooks`) used by Task 7 routes.

- [ ] **Step 1: Create the model** (`backend/app/models/notebook.py`)

```python
"""Notebook — a saved chat session (conversational analyst transcript).

Stores the *turns* (ordered ChatTurn list: user/assistant messages + proposed
artifacts) as JSON — never raw rows or rendered data. Mirrors the `reports` /
`dashboards` persistence pattern: a dedicated table so a project holds multiple
notebooks + history, and future analytics columns slot in cleanly.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Notebook(SQLModel, table=True):
    __tablename__ = "notebooks"

    id: int | None = Field(default=None, primary_key=True)
    project_id: int = Field(index=True, foreign_key="projects.id")
    owner_id: int = Field(index=True, foreign_key="users.id")
    scope: str = "dataset"  # "dataset" | "project"
    dataset_id: int | None = Field(default=None, index=True, foreign_key="datasets.id")
    title: str
    turns: dict | None = Field(default=None, sa_column=Column(JSON))
    share_token: str = Field(index=True, unique=True)
    ai_available: bool = True  # True only if every persisted turn used AI
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
    generated_at: datetime | None = Field(default=None)  # set on first assistant turn
```

- [ ] **Step 2: Register the model** — add to `backend/app/models/__init__.py`:

```python
from app.models.dashboard import Dashboard
from app.models.dataset import Dataset
from app.models.notebook import Notebook   # <-- add
from app.models.project import Project
from app.models.sql_query import SqlQuery
from app.models.user import User

__all__ = ["User", "Project", "Dataset", "SqlQuery", "Dashboard", "Notebook"]  # <-- add
```

- [ ] **Step 3: Create the migration** (`backend/alembic/versions/i0j1k2l3m4n5_add_notebooks_table.py`).
  Mirror `h9i0j1k2l3m4_add_dashboards_table.py`; `down_revision = "h9i0j1k2l3m4"`, new `revision = "i0j1k2l3m4n5"`.

```python
"""add notebooks table

Revision ID: i0j1k2l3m4n5
Revises: h9i0j1k2l3m4
Create Date: 2026-07-17 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "i0j1k2l3m4n5"
down_revision: Union[str, Sequence[str], None] = "h9i0j1k2l3m4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "notebooks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("scope", sa.String(), nullable=False),
        sa.Column("dataset_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("turns", sa.JSON(), nullable=True),
        sa.Column("share_token", sa.String(), nullable=False),
        sa.Column("ai_available", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("generated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["dataset_id"], ["datasets.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notebooks_project_id", "notebooks", ["project_id"])
    op.create_index("ix_notebooks_owner_id", "notebooks", ["owner_id"])
    op.create_index("ix_notebooks_dataset_id", "notebooks", ["dataset_id"])
    op.create_index("ix_notebooks_share_token", "notebooks", ["share_token"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_notebooks_share_token", table_name="notebooks")
    op.drop_index("ix_notebooks_dataset_id", table_name="notebooks")
    op.drop_index("ix_notebooks_owner_id", table_name="notebooks")
    op.drop_index("ix_notebooks_project_id", table_name="notebooks")
    op.drop_table("notebooks")
```

- [ ] **Step 4: Verify the migration applies** (requires a live Postgres via `DATABASE_URL`):

```bash
cd backend && alembic upgrade head
```

Expected: `notebooks` table created (no error). Then `python -c "from app.models import Notebook; print('ok')"` imports cleanly.

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/notebook.py backend/app/models/__init__.py backend/alembic/versions/i0j1k2l3m4n5_add_notebooks_table.py
git commit -m "feat(chat): notebooks table + migration + model registration"
```

---

### Task 3: Chat schemas

**Files:**
- Create: `backend/app/schemas/chat.py`

**Interfaces:**
- Produces: `ChatContext`, `ChatAction`, `ChatArtifact`, `ChatTurn`, `NotebookRead`, `NotebookDetailRead`, `NotebookShareRead`, `NotebookPatchRequest`, `NotebookCreate`, `ChatMessageRequest`. These are consumed by Tasks 4–7 and the frontend (Task 8).

- [ ] **Step 1: Write the schemas** (`backend/app/schemas/chat.py`)

```python
"""Wire contracts for the AI Chat & Notebook workflow.

A `Notebook` stores an ordered `turns` list (ChatTurn). Each assistant turn
carries `actions` (proposed artifacts) as `ChatArtifact`. Artifact payloads are
stored as plain dicts (`proposal`/`specs`/`catalog`/`result`) so the schema never
imports the other engines and the `turns` JSON stays stable.
"""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class ChatContext(BaseModel):
    """Structured facts sent to the LLM (never raw rows)."""
    scope: str  # "dataset" | "project"
    project_id: int
    dataset_id: int | None = None
    profile: dict | None = None
    understanding: dict | None = None
    eda: dict | None = None
    project_summary: dict | None = None  # lightweight aggregates for project scope


class ChatAction(BaseModel):
    """One proposed action from the intent call."""
    type: str  # "sql" | "chart" | "cleaning" | "dashboard" | "report"
    question: str | None = None
    dataset_id: int | None = None
    hints: list[str] | None = None
    scope: str | None = None


class ChatArtifact(BaseModel):
    """A proposed/executed artifact attached to an assistant turn."""
    type: str
    dataset_id: int | None = None
    proposal: dict | None = None   # e.g. SqlProposal.model_dump()
    specs: list[dict] | None = None  # chart ChartSpec.model_dump() list
    catalog: list[dict] | None = None  # dashboard CatalogEntry.model_dump() list
    status: str = "proposed"   # proposed|executed|accepted|rejected|opened|error
    error: str | None = None
    result: dict | None = None  # executed result (e.g. SqlResult) — persisted in M2


class ChatTurn(BaseModel):
    """One message in a notebook."""
    id: str
    role: str  # "user" | "assistant"
    content: str
    actions: list[ChatArtifact] = []
    parent_id: str | None = None
    created_at: str


class NotebookCreate(BaseModel):
    scope: str
    project_id: int
    dataset_id: int | None = None
    title: str | None = None


class NotebookRead(BaseModel):
    id: int
    project_id: int
    owner_id: int
    scope: str
    dataset_id: int | None
    title: str
    share_token: str
    ai_available: bool
    created_at: datetime
    updated_at: datetime
    generated_at: datetime | None


class NotebookDetailRead(NotebookRead):
    turns: list[ChatTurn] = []


class NotebookShareRead(BaseModel):
    """Public, read-only projection — no owner/project linkage, no row ids."""
    title: str
    scope: str
    turns: list[ChatTurn]
    ai_available: bool
    generated_at: datetime | None


class NotebookPatchRequest(BaseModel):
    title: str | None = None


class ChatMessageRequest(BaseModel):
    """Body for POST /chat/message (SSE)."""
    notebook_id: int | None = None
    project_id: int
    dataset_id: int | None = None
    content: str
    parent_message_id: str | None = None
```

- [ ] **Step 2: Sanity import**

```bash
cd backend && python -c "import app.schemas.chat as c; print(c.ChatTurn.model_fields.keys())"
```

Expected: prints `dict_keys(['id', 'role', 'content', 'actions', 'parent_id', 'created_at'])`.

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/chat.py
git commit -m "feat(chat): chat + notebook schemas"
```

---

### Task 4: Chat context builder

**Files:**
- Create: `backend/app/services/chat/__init__.py` (empty)
- Create: `backend/app/services/chat/context.py`

**Interfaces:**
- Consumes: `SessionDep`, `Project`, `Dataset`, `DatasetProfile`/`DatasetUnderstanding` (from `app.schemas.understanding`), `dashboard.assemble_context` (Task 7 uses for project scope; for M1 dataset scope only).
- Produces: `build_chat_context(session, project, dataset, user) -> ChatContext`.

- [ ] **Step 1: Write the builder** (`backend/app/services/chat/context.py`)

```python
"""Build the structured chat context (facts only, never raw data)."""
from __future__ import annotations

from sqlmodel import Session

from app.models.dataset import Dataset
from app.models.project import Project
from app.models.user import User
from app.schemas.chat import ChatContext
from app.schemas.understanding import DatasetProfile, DatasetUnderstanding


def build_chat_context(
    session: Session, project: Project, dataset: Dataset | None, user: User
) -> ChatContext:
    profile = DatasetProfile.model_validate(dataset.profile) if dataset and dataset.profile else None
    understanding = (
        DatasetUnderstanding.model_validate(dataset.understanding)
        if dataset and dataset.understanding
        else None
    )
    return ChatContext(
        scope="dataset" if dataset else "project",
        project_id=project.id,
        dataset_id=dataset.id if dataset else None,
        profile=profile.model_dump(mode="json") if profile else None,
        understanding=understanding.model_dump(mode="json") if understanding else None,
        eda=dataset.eda if dataset else None,
        project_summary=None,  # populated for project scope in M3 routing
    )
```

- [ ] **Step 2: Create the package marker** (`backend/app/services/chat/__init__.py`) — empty file.

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/chat/__init__.py backend/app/services/chat/context.py
git commit -m "feat(chat): chat context builder"
```

---

### Task 5: Orchestrator (intent + narrative + fallback)

**Files:**
- Create: `backend/app/services/chat/orchestrator.py`
- Test: `backend/tests/test_chat_orchestrator.py`

**Interfaces:**
- Consumes: `ChatContext` (Task 3), `complete_json` + `complete_stream` (Task 1), `app.services.llm`.
- Produces: `plan_turn(ctx, question, history, available_actions) -> tuple[list[ChatAction], str, bool]`, `stream_narrative(ctx, question, actions, summary) -> AsyncGenerator[str, None]`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_chat_orchestrator.py
import asyncio

from app.schemas.chat import ChatAction, ChatContext
from app.services.chat.orchestrator import _fallback_turn, plan_turn, stream_narrative


def _ctx(with_frame: bool = True) -> ChatContext:
    return ChatContext(
        scope="dataset", project_id=1, dataset_id=5 if with_frame else None,
        profile={"column_names": ["a", "b"]} if with_frame else None,
    )


def test_fallback_with_frame_returns_sql_action():
    actions, summary, avail = _fallback_turn(_ctx(with_frame=True), "why did revenue drop?")
    assert avail is False
    assert len(actions) == 1 and actions[0].type == "sql"
    assert actions[0].dataset_id == 5


def test_fallback_without_frame_is_text_only():
    actions, summary, avail = _fallback_turn(_ctx(with_frame=False), "hello")
    assert avail is False
    assert actions == []


def test_plan_turn_validates_unknown_action_type(monkeypatch):
    # LLM returns an action type not in the catalog -> dropped.
    async def fake_complete_json(system, user):
        return {"summary": "ok", "actions": [{"type": "teleport", "question": "x"}]}
    monkeypatch.setattr("app.services.chat.orchestrator.complete_json", fake_complete_json)
    monkeypatch.setattr("app.services.chat.orchestrator.settings.OPENROUTER_API_KEY", "x")
    actions, summary, avail = asyncio.run(
        plan_turn(_ctx(), "q", [], available_actions=["sql"])
    )
    assert avail is True
    assert actions == []  # "teleport" not in catalog -> dropped


def test_stream_narrative_yields_text(monkeypatch):
    async def fake_stream(system, user, model=None):
        for t in ["Hi ", "there"]:
            yield t
    monkeypatch.setattr("app.services.chat.orchestrator.complete_stream", fake_stream)
    monkeypatch.setattr("app.services.chat.orchestrator.settings.OPENROUTER_API_KEY", "x")
    out = asyncio.run(
        stream_narrative(_ctx(), "q", [ChatAction(type="sql", question="q")], "I'll run SQL.")
    )
    assert "".join(out) == "Hi there"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_chat_orchestrator.py -v`
Expected: FAIL (module/function not defined).

- [ ] **Step 3: Implement the orchestrator** (`backend/app/services/chat/orchestrator.py`)

```python
"""Chat orchestrator: intent selection + live narrative streaming.

CALL A (plan_turn) uses complete_json to pick proposed actions from a fixed
catalog (HITL — the human executes them later). CALL B (stream_narrative) uses
the new complete_stream primitive to stream the prose answer live. Both are
best-effort: any LLM failure falls back to a deterministic plan.
"""
from __future__ import annotations

import json
from collections.abc import AsyncGenerator

from app.schemas.chat import ChatAction, ChatContext
from app.services.llm import complete_json, complete_stream

_CATALOG_DESCRIPTIONS = {
    "sql": "Run a read-only SQL query against the dataset to answer the question.",
    "chart": "Show recommended charts (histogram, bar, correlation, etc.).",
    "cleaning": "Propose data-cleaning operations (missing values, duplicates).",
    "dashboard": "Recommend or open a dashboard for this dataset/project.",
    "report": "Generate or open an insights report for this dataset/project.",
}

_SYSTEM_INTENT = (
    "You are a senior data analyst inside a chat. Given the STRUCTURED facts about "
    "a dataset/project (never raw rows) and the user's question, decide which of "
    "the AVAILABLE ACTIONS to propose. Keep it to the most useful 1-3 actions. "
    "Respond with JSON only: {\"summary\": str (1-2 sentence plan), \"actions\": "
    "[{\"type\": one of AVAILABLE, \"question\": str|null, \"dataset_id\": int|null, "
    "\"hints\": [str]|null, \"scope\": \"dataset\"|\"project\"|null}]}."
)

_SYSTEM_NARRATIVE = (
    "You are a friendly data analyst answering the user in a chat. Write a concise, "
    "plain-English answer to their question using the structured facts. Mention the "
    "actions you are about to take (e.g. 'I'll run a SQL query…'). No raw data, no code fences."
)


def _user_intent(ctx: ChatContext, question: str, history, available_actions: list[str]) -> str:
    catalog = {k: _CATALOG_DESCRIPTIONS[k] for k in available_actions}
    return json.dumps(
        {
            "available_actions": catalog,
            "question": question,
            "facts": ctx.model_dump(mode="json"),
            "prior_turns": [h.model_dump(mode="json") for h in (history or [])],
        },
        indent=2,
    )


def _fallback_turn(ctx: ChatContext, question: str) -> tuple[list[ChatAction], str, bool]:
    if ctx.dataset_id is not None and ctx.profile is not None:
        actions = [ChatAction(type="sql", question=question, dataset_id=ctx.dataset_id)]
        summary = "I can help by running a SQL query against this dataset. Here's a starting point."
    else:
        actions = []
        summary = "Tell me more about what you'd like to explore, or open a specific dataset to run analysis."
    return actions, summary, False


async def plan_turn(
    ctx: ChatContext, question: str, history, available_actions: list[str]
) -> tuple[list[ChatAction], str, bool]:
    """CALL A — choose proposed actions. Returns (actions, summary, ai_available)."""
    try:
        data = await complete_json(_SYSTEM_INTENT, _user_intent(ctx, question, history, available_actions))
        raw_actions = data.get("actions", []) if isinstance(data, dict) else []
        known = set(available_actions)
        actions: list[ChatAction] = []
        for a in raw_actions or []:
            if not isinstance(a, dict):
                continue
            if a.get("type") not in known:
                continue  # drop actions outside the catalog
            actions.append(ChatAction(
                type=a["type"],
                question=a.get("question"),
                dataset_id=a.get("dataset_id"),
                hints=a.get("hints"),
                scope=a.get("scope"),
            ))
        summary = str(data.get("summary", "")) if isinstance(data, dict) else ""
        return actions, summary, True
    except Exception:
        return _fallback_turn(ctx, question)


async def stream_narrative(
    ctx: ChatContext, question: str, actions: list[ChatAction], summary: str
) -> AsyncGenerator[str, None]:
    """CALL B — stream the conversational answer live over SSE."""
    actions_desc = "; ".join(
        f"{a.type}" + (f" ({a.question})" if a.question else "") for a in actions
    ) or "none"
    user_prompt = json.dumps(
        {
            "question": question,
            "plan_summary": summary,
            "actions_i_will_take": actions_desc,
            "facts": ctx.model_dump(mode="json"),
        },
        indent=2,
    )
    try:
        async for token in complete_stream(_SYSTEM_NARRATIVE, user_prompt):
            yield token
    except Exception:
        # Graceful degradation: a single static line so the turn still completes.
        yield (
            "I'm having trouble generating a detailed answer right now, but I've "
            "prepared the analysis actions below for you to review."
        )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_chat_orchestrator.py -v`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/chat/orchestrator.py backend/tests/test_chat_orchestrator.py
git commit -m "feat(chat): orchestrator intent + narrative streaming + fallback"
```

---

### Task 6: Executor (SQL path, M1)

**Files:**
- Create: `backend/app/services/chat/executor.py`
- Test: `backend/tests/test_chat_executor.py`

**Interfaces:**
- Consumes: `ChatAction` (Task 3), `SessionDep`, `Dataset`, `DatasetProfile`/`DatasetUnderstanding`, `sql.proposer.generate_sql`, `cleaning.load_dataframe`/`get_storage` (M2), `eda.engine.build_candidates` (M2), `dashboard.proposer.propose_dashboard` + `assemble_context` (M2).
- Produces: `run_action(session, action, project, dataset, user) -> ChatArtifact`. **M1 implements only `sql`; other types return a `status="proposed"` placeholder** that M2 fills in.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_chat_executor.py
import asyncio

from sqlmodel import Session, create_engine

from app.models.dataset import Dataset
from app.schemas.chat import ChatAction, ChatArtifact
from app.services.chat.executor import run_action


def test_run_action_sql_calls_generate_sql(monkeypatch):
    async def fake_generate_sql(question, profile, understanding=None, chain=None):
        from app.schemas.sql import SqlProposal
        return SqlProposal(business_question=question, sql="SELECT 1", explanation="e",
                           confidence=0.7, suggested_visualization=None, ai_available=True)
    monkeypatch.setattr("app.services.chat.executor.generate_sql", fake_generate_sql)

    ds = Dataset(id=1, project_id=1, owner_id=1, filename="f", original_filename="f.csv",
                 name_stem="f", storage_path="1/f.csv", file_size=1, file_format="csv",
                 profile={"column_names": ["a"]})
    action = ChatAction(type="sql", question="q", dataset_id=1)
    art = asyncio.run(run_action(None, action, project=None, dataset=ds, user=None))
    assert isinstance(art, ChatArtifact)
    assert art.type == "sql"
    assert art.proposal["sql"] == "SELECT 1"
    assert art.status == "proposed"


def test_run_action_unknown_type_returns_proposed_placeholder():
    art = asyncio.run(run_action(None, ChatAction(type="dashboard", scope="project"),
                                 project=None, dataset=None, user=None))
    assert art.type == "dashboard"
    assert art.status == "proposed"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_chat_executor.py -v`
Expected: FAIL (`run_action` not defined).

- [ ] **Step 3: Implement the executor** (`backend/app/services/chat/executor.py`)

```python
"""Deterministic executor: turn a proposed ChatAction into a ChatArtifact.

Calls the existing engines (never modified) to compute each artifact's proposed
state. M1 implements `sql`; `chart`/`cleaning`/`dashboard`/`report` return a
`proposed` placeholder here and are fully implemented in M2.
"""
from __future__ import annotations

from sqlmodel import Session

from app.models.dataset import Dataset
from app.models.project import Project
from app.models.user import User
from app.schemas.chat import ChatAction, ChatArtifact
from app.schemas.understanding import DatasetProfile, DatasetUnderstanding


async def run_action(
    session: Session | None, action: ChatAction, project: Project | None,
    dataset: Dataset | None, user: User | None,
) -> ChatArtifact:
    if action.type == "sql":
        return await _run_sql(action, dataset)
    # M2 fills these in; for M1 they are inert proposals.
    return ChatArtifact(type=action.type, dataset_id=action.dataset_id, status="proposed")


async def _run_sql(action: ChatAction, dataset: Dataset | None) -> ChatArtifact:
    from app.services.sql.proposer import generate_sql

    if dataset is None or dataset.profile is None:
        return ChatArtifact(type="sql", dataset_id=action.dataset_id, status="error",
                            error="No analyzed dataset available for SQL.")
    profile = DatasetProfile.model_validate(dataset.profile)
    understanding = (
        DatasetUnderstanding.model_validate(dataset.understanding)
        if dataset.understanding else None
    )
    proposal = await generate_sql(action.question or "", profile, understanding)
    return ChatArtifact(
        type="sql",
        dataset_id=dataset.id,
        proposal=proposal.model_dump(mode="json"),
        status="proposed",
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_chat_executor.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/chat/executor.py backend/tests/test_chat_executor.py
git commit -m "feat(chat): executor SQL path (M1)"
```

---

### Task 7: Routes — SSE `/chat/message` + notebooks CRUD + share

**Files:**
- Create: `backend/app/api/routes/chat.py`
- Modify: `backend/app/main.py` (import + include router)

**Interfaces:**
- Consumes: `ChatMessageRequest`, `NotebookCreate`, `NotebookPatchRequest` (Task 3); `build_chat_context` (Task 4); `plan_turn`/`stream_narrative` (Task 5); `run_action` (Task 6); `Notebook` model (Task 2); `secrets` for share token; `Project`/`Dataset` owner-guards.
- Produces: SSE stream + `NotebookRead`/`NotebookDetailRead`/`NotebookShareRead` + 204.

- [ ] **Step 1: Write the routes** (`backend/app/api/routes/chat.py`)

```python
"""Chat & Notebook routes.

- `POST /chat/message` — SSE. Builds context, runs the two-call AI turn
  (intent + streamed narrative), deterministically executes proposed artifacts,
  emits `token`/`artifact`/`done`/`error` SSE events, and persists the user +
  assistant turns into the notebook's `turns`.
- `GET  /notebooks` — owner list.
- `POST /notebooks` — create.
- `GET  /notebooks/{id}` — owner fetch (turns attached).
- `PATCH /notebooks/{id}` — rename.
- `DELETE /notebooks/{id}` — owner delete.
- `GET /notebooks/share/{token}` — PUBLIC, read-only, safe fields only.

All AI steps are best-effort; the stream never 5xxes because the LLM was down.
"""
from __future__ import annotations

import json
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.models.dataset import Dataset
from app.models.notebook import Notebook
from app.models.project import Project
from app.schemas.chat import (
    ChatArtifact,
    ChatMessageRequest,
    ChatTurn,
    NotebookCreate,
    NotebookDetailRead,
    NotebookPatchRequest,
    NotebookRead,
    NotebookShareRead,
)
from app.services.chat.context import build_chat_context
from app.services.chat.executor import run_action
from app.services.chat.orchestrator import plan_turn, stream_narrative

router = APIRouter(prefix="/chat", tags=["chat"])

_AVAILABLE_ACTIONS_M1 = ["sql"]  # M2 extends to chart/cleaning/dashboard/report


def _owned(notebook_id: int, session: SessionDep, user: CurrentUser) -> Notebook:
    n = session.get(Notebook, notebook_id)
    if n is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notebook not found")
    if n.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your notebook")
    return n


def _resolve_scope(body, session, user):
    """Validate project/dataset ownership + analysis; return (project, dataset)."""
    project = session.get(Project, body.project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if project.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your project")
    dataset = None
    if body.dataset_id is not None:
        dataset = session.get(Dataset, body.dataset_id)
        if dataset is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
        if dataset.owner_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your dataset")
    return project, dataset


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


@router.post("/message")
async def chat_message(body: ChatMessageRequest, session: SessionDep, current_user: CurrentUser):
    project, dataset = _resolve_scope(body, session, current_user)
    notebook = session.get(Notebook, body.notebook_id) if body.notebook_id else None
    if notebook is None:
        notebook = Notebook(
            project_id=project.id, owner_id=current_user.id,
            scope="dataset" if dataset else "project",
            dataset_id=dataset.id if dataset else None,
            title=(body.content[:60] or "New chat"),
            turns=[], share_token=secrets.token_urlsafe(32), ai_available=True,
        )
        session.add(notebook)
        session.commit()
        session.refresh(notebook)

    ctx = build_chat_context(session, project, dataset, current_user)
    user_turn = ChatTurn(
        id=secrets.token_hex(8), role="user", content=body.content, actions=[],
        parent_id=body.parent_message_id, created_at=_iso(),
    )
    turns = list(notebook.turns or [])
    turns.append(user_turn.model_dump(mode="json"))

    async def generate():
        narrative: list[str] = []
        actions: list[ChatArtifact] = []
        ai_available = True
        try:
            proposed, summary, avail = await plan_turn(
                ctx, body.content, [], _AVAILABLE_ACTIONS_M1
            )
            ai_available = ai_available and avail
            async for token in stream_narrative(ctx, body.content, proposed, summary):
                narrative.append(token)
                yield _sse("token", {"text": token})
            for action in proposed:
                artifact = await run_action(session, action, project, dataset, current_user)
                actions.append(artifact)
                yield _sse("artifact", {"artifact": artifact.model_dump(mode="json")})
        except Exception as e:  # never 5xx the stream
            ai_available = False
            yield _sse("error", {"message": str(e), "ai_available": False})

        assistant_turn = ChatTurn(
            id=secrets.token_hex(8), role="assistant",
            content="".join(narrative), actions=actions,
            parent_id=None, created_at=_iso(),
        )
        turns.append(assistant_turn.model_dump(mode="json"))
        notebook.turns = turns
        if notebook.generated_at is None:
            notebook.generated_at = datetime.now(timezone.utc)
        notebook.ai_available = ai_available
        notebook.updated_at = datetime.now(timezone.utc)
        session.add(notebook)
        session.commit()
        yield _sse("done", {
            "notebook_id": notebook.id, "message_id": assistant_turn.id,
            "ai_available": ai_available, "title": notebook.title,
        })

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.get("/notebooks", response_model=list[NotebookRead])
def list_notebooks(session: SessionDep, current_user: CurrentUser, project_id: int = Query(...)) -> list[NotebookRead]:
    stmt = (
        select(Notebook)
        .where(Notebook.project_id == project_id, Notebook.owner_id == current_user.id)
        .order_by(Notebook.created_at.desc())
    )
    return list(session.exec(stmt).all())


@router.post("/notebooks", response_model=NotebookRead, status_code=status.HTTP_201_CREATED)
def create_notebook(body: NotebookCreate, session: SessionDep, current_user: CurrentUser) -> NotebookRead:
    project = session.get(Project, body.project_id)
    if project is None or project.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    dataset = None
    if body.dataset_id is not None:
        dataset = session.get(Dataset, body.dataset_id)
        if dataset is None or dataset.owner_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    nb = Notebook(
        project_id=project.id, owner_id=current_user.id, scope=body.scope,
        dataset_id=dataset.id if dataset else None,
        title=body.title or "New chat", turns=[], share_token=secrets.token_urlsafe(32),
    )
    session.add(nb)
    session.commit()
    session.refresh(nb)
    return nb


@router.get("/notebooks/{notebook_id}", response_model=NotebookDetailRead)
def get_notebook(notebook_id: int, session: SessionDep, current_user: CurrentUser) -> NotebookDetailRead:
    n = _owned(notebook_id, session, current_user)
    detail = {k: v for k, v in n.model_dump().items() if k != "turns"}
    return NotebookDetailRead(turns=[ChatTurn(**t) for t in (n.turns or [])], **detail)


@router.patch("/notebooks/{notebook_id}", response_model=NotebookRead)
def update_notebook(notebook_id: int, body: NotebookPatchRequest, session: SessionDep, current_user: CurrentUser) -> NotebookRead:
    n = _owned(notebook_id, session, current_user)
    if body.title is not None:
        n.title = body.title
    n.updated_at = datetime.now(timezone.utc)
    session.add(n)
    session.commit()
    session.refresh(n)
    return n


@router.delete("/notebooks/{notebook_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_notebook(notebook_id: int, session: SessionDep, current_user: CurrentUser):
    n = _owned(notebook_id, session, current_user)
    session.delete(n)
    session.commit()


@router.get("/notebooks/share/{token}", response_model=NotebookShareRead)
def share_notebook(token: str, session: SessionDep):
    n = session.exec(select(Notebook).where(Notebook.share_token == token)).first()
    if n is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notebook not found")
    return NotebookShareRead(
        title=n.title, scope=n.scope,
        turns=[ChatTurn(**t) for t in (n.turns or [])],
        ai_available=n.ai_available, generated_at=n.generated_at,
    )


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()
```

- [ ] **Step 2: Mount the router** — in `backend/app/main.py`, add `chat` to the import line and include it:

```python
from app.api.routes import auth, chat, cleaning, dashboards, datasets, eda, projects, reports, sql, users
...
app.include_router(chat.router, prefix=API_PREFIX)
```

- [ ] **Step 3: Verify the app imports and routes mount**

```bash
cd backend && python -c "from app.main import app; print([r.path for r in app.routes if getattr(r,'path','').startswith('/api/v1/chat')])"
```

Expected: prints the chat routes including `/api/v1/chat/message` and `/api/v1/chat/notebooks`.

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/routes/chat.py backend/app/main.py
git commit -m "feat(chat): SSE message route + notebooks CRUD + share"
```

---

### Task 8: Frontend types + API client (SSE consumer)

**Files:**
- Modify: `frontend/lib/types.ts`
- Modify: `frontend/lib/api.ts`

**Interfaces:**
- Produces: `ChatArtifact`, `ChatTurn`, `NotebookRead`, `NotebookDetailRead`, `NotebookShareRead`, `ChatMessageRequest` (types.ts); `chatApi.message()` (SSE consumer) + `notebooksApi` (types/api.ts). Consumed by Tasks 9–10.

- [ ] **Step 1: Append chat types** to `frontend/lib/types.ts` (after the Dashboard block):

```typescript
// --- AI Chat & Notebook ---------------------------------------------------

export type ChatArtifactType = "sql" | "chart" | "cleaning" | "dashboard" | "report";

export interface ChatArtifact {
  type: ChatArtifactType;
  dataset_id?: number | null;
  proposal?: Record<string, unknown> | null; // e.g. SqlProposal
  specs?: Record<string, unknown>[] | null;
  catalog?: Record<string, unknown>[] | null;
  status: string; // proposed|executed|accepted|rejected|opened|error
  error?: string | null;
  result?: Record<string, unknown> | null;
}

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions: ChatArtifact[];
  parent_id?: string | null;
  created_at: string;
  _streaming?: boolean; // transient UI flag (stripped before persistence; backend builds its own turns)
}

export interface ChatMessageRequest {
  notebook_id?: number | null;
  project_id: number;
  dataset_id?: number | null;
  content: string;
  parent_message_id?: string | null;
}

export interface NotebookRead {
  id: number;
  project_id: number;
  owner_id: number;
  scope: string;
  dataset_id: number | null;
  title: string;
  share_token: string;
  ai_available: boolean;
  created_at: string;
  updated_at: string;
  generated_at: string | null;
}

export interface NotebookDetailRead extends NotebookRead {
  turns: ChatTurn[];
}

export interface NotebookShareRead {
  title: string;
  scope: string;
  turns: ChatTurn[];
  ai_available: boolean;
  generated_at: string | null;
}
```

- [ ] **Step 2: Add API clients** to `frontend/lib/api.ts`. Append to the `import type { ... }` block the new types, then add these exports at the end of the file:

```typescript
export interface SSEEvent {
  event: string; // token | artifact | done | error
  data: Record<string, unknown>;
}

export const chatApi = {
  /** POST /chat/message as SSE. Calls onEvent for each server event, resolves on stream end. */
  async message(
    req: ChatMessageRequest,
    onEvent: (e: SSEEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const token = getToken();
    const res = await fetch(`${BASE}/api/v1/chat/message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(req),
      signal,
    });
    if (!res.ok || !res.body) {
      throw new ApiError(res.status, `Chat failed (${res.status})`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE frames are separated by a blank line.
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        let event = "message";
        const dataLines: string[] = [];
        for (const line of frame.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
        }
        try {
          onEvent({ event, data: JSON.parse(dataLines.join("")) });
        } catch {
          /* ignore malformed frame */
        }
      }
    }
  },
};

export const notebooksApi = {
  list(projectId: number): Promise<NotebookRead[]> {
    return request<NotebookRead[]>(`/api/v1/chat/notebooks?project_id=${projectId}`);
  },
  create(req: { scope: string; project_id: number; dataset_id?: number | null; title?: string | null }): Promise<NotebookRead> {
    return request<NotebookRead>("/api/v1/chat/notebooks", {
      method: "POST",
      body: JSON.stringify(req),
    });
  },
  get(id: number): Promise<NotebookDetailRead> {
    return request<NotebookDetailRead>(`/api/v1/chat/notebooks/${id}`);
  },
  update(id: number, body: { title?: string | null }): Promise<NotebookRead> {
    return request<NotebookRead>(`/api/v1/chat/notebooks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  remove(id: number): Promise<void> {
    return request<void>(`/api/v1/chat/notebooks/${id}`, { method: "DELETE" });
  },
  share(token: string): Promise<NotebookShareRead> {
    return request<NotebookShareRead>(`/api/v1/chat/notebooks/share/${token}`);
  },
};
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/types.ts frontend/lib/api.ts
git commit -m "feat(chat): frontend types + SSE chat/notebooks API client"
```

---

### Task 9: Chat panel UI (streaming + inline SQL Run)

**Files:**
- Create: `frontend/components/chat-panel.tsx`

**Interfaces:**
- Consumes: `chatApi.message` + `notebooksApi` (Task 8), `sqlApi.run` (existing, `frontend/lib/api.ts:227`), `ChartRenderer` (existing, `frontend/components/chart-renderer.tsx:101`), `SqlResult`/`SqlProposal` types (existing). Reuses `ChartRenderer` for the SQL result's suggested visualization.
- Produces: a self-contained chat panel rendered inside the projects workspace (Task 10).

- [ ] **Step 1: Write the component** (`frontend/components/chat-panel.tsx`)

```tsx
"use client";

import { useRef, useState } from "react";
import { Send, Sparkles, X } from "lucide-react";
import { chatApi, sqlApi, dashboardsApi, reportsApi, type ChatTurn, type ChatArtifact } from "@/lib/api";
import type { DatasetRead, SqlProposal, SqlResult, SqlVisualization } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ChartRenderer } from "@/components/chart-renderer";

interface Props {
  projectId: number;
  dataset?: DatasetRead | null;
  notebookId: number | null;
  onNotebookCreated: (id: number) => void;
  onClose: () => void;
}

export function ChatPanel({ projectId, dataset, notebookId, onNotebookCreated, onClose }: Props) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  function pushAssistantToken(text: string) {
    setTurns((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last && last.role === "assistant" && last._streaming) {
        next[next.length - 1] = { ...last, content: last.content + text };
      } else {
        next.push({ id: crypto.randomUUID(), role: "assistant", content: text, actions: [], _streaming: true } as ChatTurn);
      }
      return next;
    });
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }

  function attachArtifact(artifact: ChatArtifact) {
    setTurns((prev) => {
      const next = [...prev];
      const i = next.map(t => t.role).lastIndexOf("assistant");
      if (i >= 0) {
        const t = next[i] as ChatTurn & { _streaming?: boolean };
        next[i] = { ...t, _streaming: false, actions: [...(t.actions || []), artifact] };
      }
      return next;
    });
  }

  async function send() {
    const content = input.trim();
    if (!content || streaming) return;
    setInput("");
    setStreaming(true);
    setTurns((p) => [...p, { id: crypto.randomUUID(), role: "user", content, actions: [] }]);
    try {
      await chatApi.message(
        { notebook_id: notebookId, project_id: projectId, dataset_id: dataset?.id ?? null, content },
        (e) => {
          if (e.event === "token") pushAssistantToken(String(e.data.text ?? ""));
          else if (e.event === "artifact") attachArtifact(e.data.artifact as ChatArtifact);
          else if (e.event === "done") {
            if (e.data.notebook_id && !notebookId) onNotebookCreated(Number(e.data.notebook_id));
            setTurns((p) => p.map((t, i) => (i === p.length - 1 ? { ...t, _streaming: false } : t)));
          } else if (e.event === "error") {
            setTurns((p) => p.map((t, i) => (i === p.length - 1 ? { ...t, _streaming: false } : t)));
          }
        },
      );
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex h-[80vh] w-full max-w-2xl flex-col rounded-lg border bg-background shadow-xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b px-4 py-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4" /> Ask your data
            {dataset ? <span className="text-xs text-muted-foreground">· {dataset.original_filename}</span> : <span className="text-xs text-muted-foreground">· project</span>}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
        </header>
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
          {turns.length === 0 && <p className="text-sm text-muted-foreground">Ask a question about this {dataset ? "dataset" : "project"}.</p>}
          {turns.map((t) => (
            <div key={t.id} className={t.role === "user" ? "text-right" : "text-left"}>
              <div className={`inline-block max-w-[90%] rounded-lg px-3 py-2 text-sm ${t.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                {t.content || (t._streaming ? "…" : "")}
              </div>
              {t.actions?.map((a, i) => <ArtifactCard key={i} artifact={a} dataset={dataset} />)}
            </div>
          ))}
        </div>
        <form className="flex gap-2 border-t p-3" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <input
            className="flex-1 rounded-md border px-3 py-2 text-sm"
            placeholder="e.g. Why did revenue drop in Q3?"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={streaming}
          />
          <Button type="submit" disabled={streaming || !input.trim()}><Send className="h-4 w-4" /> Send</Button>
        </form>
      </div>
    </div>
  );
}

function ArtifactCard({ artifact, dataset }: { artifact: ChatArtifact; dataset?: DatasetRead | null }) {
  const [result, setResult] = useState<SqlResult | null>(null);
  const [running, setRunning] = useState(false);

  if (artifact.type === "sql") {
    const proposal = artifact.proposal as unknown as SqlProposal | undefined;
    const viz = proposal?.suggested_visualization as SqlVisualization | null;
    return (
      <div className="mt-2 rounded-md border bg-background p-3 text-left text-sm">
        <p className="font-medium">SQL query {artifact.status === "proposed" ? "(proposed)" : ""}</p>
        <pre className="my-1 overflow-x-auto rounded bg-muted p-2 text-xs">{proposal?.sql || "(no query proposed)"}</pre>
        {proposal?.explanation && <p className="text-muted-foreground">{proposal.explanation}</p>}
        {!result && (
          <Button size="sm" className="mt-2" disabled={running || !proposal?.sql} onClick={async () => {
            if (!proposal?.sql || !dataset) return;
            setRunning(true);
            try {
              const r = await sqlApi.run({ dataset_id: dataset.id, sql: proposal.sql, business_question: proposal.business_question });
              setResult(r);
            } finally { setRunning(false); }
          }}>{running ? "Running…" : "Run query"}</Button>
        )}
        {result && (
          <div className="mt-2">
            <p className="text-xs text-muted-foreground">{result.row_count} rows · {result.duration_ms} ms</p>
            <div className="max-h-48 overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted"><tr>{result.columns.map((c) => <th key={c} className="px-2 py-1">{c}</th>)}</tr></thead>
                <tbody>{result.rows.slice(0, 20).map((row, i) => (
                  <tr key={i} className="border-t">{result.columns.map((c) => <td key={c} className="px-2 py-1">{String(row[c] ?? "")}</td>)}</tr>
                ))}</tbody>
              </table>
            </div>
            {viz && result.rows.length > 0 && (
              <ChartRenderer spec={{
                id: "sql-viz", chart_type: viz.chart_type, title: proposal?.business_question || "Result",
                business_question: "", explanation: viz.rationale, recommended_reason: "", confidence: 0,
                axis_config: { x_label: viz.x ?? "", y_label: viz.y ?? "" },
                data: result.rows.slice(0, 200).map((r) => ({ x: r[viz.x ?? ""], y: r[viz.y ?? ""], category: r[viz.x ?? ""] })),
                metadata: {}, accepted: true,
              }} />
            )}
            {result.insights?.map((ins, i) => <p key={i} className="mt-1 text-xs">• {ins}</p>)}
          </div>
        )}
      </div>
    );
  }
  // M1: non-sql types are inert proposals (filled in M2).
  return (
    <div className="mt-2 rounded-md border bg-background p-3 text-left text-sm text-muted-foreground">
      {artifact.type} — coming soon.
    </div>
  );
}
```

> Note: `ChatTurn` is reused with a transient `_streaming` flag (not part of the backend schema; it's stripped before any persistence because the backend builds its own turns). If your TS linter disallows extra props, widen `ChatTurn` with `_streaming?: boolean` in `types.ts`.

- [ ] **Step 2: Typecheck + lint**

Run: `cd frontend && npx tsc --noEmit && npx next lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/chat-panel.tsx
git commit -m "feat(chat): chat panel with SSE streaming + inline SQL run"
```

---

### Task 10: Entry points, owner page, share page, e2e

**Files:**
- Modify: `frontend/app/projects/[id]/page.tsx` (add Chat buttons)
- Create: `frontend/app/notebooks/[id]/page.tsx`
- Create: `frontend/app/notebooks/share/[token]/page.tsx`
- Create: `frontend/components/notebook-share.tsx`
- Create: `backend/tests/manual_chat_e2e.py`

**Interfaces:**
- Consumes: `chatApi` + `notebooksApi` (Task 8), `ChatPanel` (Task 9), `NotebookShareRead` (Task 8). Mirrors the projects-page entry-point pattern (`frontend/app/projects/[id]/page.tsx:230-241`) and the dashboards owner page (`frontend/app/dashboards/[id]/page.tsx`) and reports share page (`frontend/app/reports/share/[token]/page.tsx`).

- [ ] **Step 1: Add Chat entry points** in `frontend/app/projects/[id]/page.tsx`:
  1. Add to the top imports: `import { ChatPanel } from "@/components/chat-panel";` and `import { notebooksApi } from "@/lib/api";` (add `notebooksApi` to the existing `import { dashboardsApi, datasetsApi, projectsApi, reportsApi } from "@/lib/api";` line).
  2. Add state: `const [chatId, setChatId] = useState<number | null>(null); const [chatDataset, setChatDataset] = useState<DatasetRead | null>(null);`
  3. In the project header (after the Dashboard button, ~line 234), add:
     ```tsx
     <Button size="sm" variant="outline" onClick={() => { setChatDataset(null); setChatId(null); }}>
       <Sparkles className="h-4 w-4" /> Chat
     </Button>
     ```
  4. In each dataset card (inside the `{d.profile && (...)}` group, after the Dashboard button, ~line 395), add:
     ```tsx
     {d.profile && (
       <Button size="sm" variant="ghost" onClick={() => { setChatDataset(d); setChatId(null); }}>
         <Sparkles className="h-4 w-4" /> Chat
       </Button>
     )}
     ```
  5. Before the closing `</main>` (after the `{sqlId !== null && ...}` block, ~line 458), add:
     ```tsx
     {chatId !== null || chatDataset !== null ? (
       <ChatPanel
         projectId={projectId}
         dataset={chatDataset}
         notebookId={chatId}
         onNotebookCreated={(id) => setChatId(id)}
         onClose={() => { setChatId(null); setChatDataset(null); }}
       />
     ) : null}
     ```

- [ ] **Step 2: Create the owner notebook page** (`frontend/app/notebooks/[id]/page.tsx`)

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notebooksApi } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { NotebookDetailRead } from "@/lib/types";
import { Button } from "@/components/ui/button";

export default function NotebookPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [nb, setNb] = useState<NotebookDetailRead | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try { setNb(await notebooksApi.get(id)); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to load notebook"); }
  }, [id]);

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    if (Number.isFinite(id)) void load();
  }, [router, id, load]);

  if (error) return <main className="container py-10"><p className="text-destructive">{error}</p></main>;
  if (!nb) return <main className="container py-10"><p className="text-muted-foreground">Loading…</p></main>;

  return (
    <main className="container flex min-h-screen flex-col gap-6 py-10">
      <header className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/projects/${nb.project_id}`}><ArrowLeft className="h-4 w-4" /> Project</Link>
        </Button>
        <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(`${location.origin}/notebooks/share/${nb.share_token}`)}>
          Copy share link
        </Button>
      </header>
      <h1 className="text-2xl font-bold tracking-tight">{nb.title}</h1>
      {!nb.ai_available && <p className="text-sm text-muted-foreground">AI unavailable for parts of this chat — rule-based fallback used.</p>}
      <div className="flex flex-col gap-4">
        {nb.turns.map((t) => (
          <div key={t.id} className={t.role === "user" ? "text-right" : "text-left"}>
            <div className={`inline-block max-w-[90%] rounded-lg px-3 py-2 text-sm ${t.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
              {t.content}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Create the share renderer** (`frontend/components/notebook-share.tsx`)

```tsx
"use client";

import type { NotebookShareRead } from "@/lib/types";

export function NotebookShare({ notebook }: { notebook: NotebookShareRead }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">{notebook.title}</h1>
      {!notebook.ai_available && (
        <p className="text-sm text-muted-foreground">AI unavailable for parts of this chat — rule-based fallback used.</p>
      )}
      {notebook.turns.map((t) => (
        <div key={t.id} className={t.role === "user" ? "text-right" : "text-left"}>
          <div className={`inline-block max-w-[90%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${t.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
            {t.content}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create the public share page** (`frontend/app/notebooks/share/[token]/page.tsx`)

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { notebooksApi } from "@/lib/api";
import type { NotebookShareRead } from "@/lib/types";
import { NotebookShare } from "@/components/notebook-share";

export default function ShareNotebookPage() {
  const params = useParams<{ token: string }>();
  const [nb, setNb] = useState<NotebookShareRead | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try { setNb(await notebooksApi.share(params.token)); }
    catch (err) { setError(err instanceof Error ? err.message : "Notebook not found"); }
  }, [params.token]);

  useEffect(() => { void load(); }, [load]);

  if (error) return <main className="container py-10"><p className="text-destructive">{error}</p></main>;
  if (!nb) return <main className="container py-10"><p className="text-muted-foreground">Loading…</p></main>;

  return (
    <main className="container flex min-h-screen flex-col gap-6 py-10">
      <NotebookShare notebook={nb} />
      <footer className="mt-8 border-t pt-4 text-center text-sm text-muted-foreground">
        Generated with InsightFlow AI ·{" "}
        <Link href="/" className="font-medium underline">Analyze your own dataset →</Link>
      </footer>
    </main>
  );
}
```

- [ ] **Step 5: Write the backend e2e test** (`backend/tests/manual_chat_e2e.py`)

```python
# Manual e2e — requires a live Postgres (DATABASE_URL). Not run in unit CI.
import io

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_chat_message_streams_and_persists():
    email = "chat_e2e@example.com"
    client.post("/api/v1/auth/register", json={"email": email, "password": "pw"})
    tok = client.post("/api/v1/auth/login", data={"username": email, "password": "pw"}).json()["access_token"]
    h = _auth(tok)
    pid = client.post("/api/v1/projects", json={"name": "p", "description": "d"}, headers=h).json()["id"]

    csv = b"region,score\nnorth,10\nsouth,20\nwest,5\n"
    did = client.post(
        f"/api/v1/datasets/projects/{pid}",
        headers=h, files={"file": ("t.csv", io.BytesIO(csv), "text/csv")},
    ).json()["id"]
    client.post(f"/api/v1/datasets/{did}/understand", headers=h)  # profile

    # Stream a chat message on the dataset.
    r = client.post(
        "/api/v1/chat/message",
        headers=h,
        json={"project_id": pid, "dataset_id": did, "content": "What is the top region by score?"},
    )
    assert r.status_code == 200
    body = r.text
    assert "event: token" in body
    assert "event: artifact" in body
    assert "event: done" in body
    assert '"type": "sql"' in body or '"type":"sql"' in body

    # A notebook row was created with the persisted turns.
    nbs = client.get(f"/api/v1/chat/notebooks?project_id={pid}", headers=h).json()
    assert len(nbs) == 1
    nb_id = nbs[0]["id"]
    detail = client.get(f"/api/v1/chat/notebooks/{nb_id}", headers=h).json()
    assert len(detail["turns"]) == 2  # user + assistant
    assert detail["turns"][1]["actions"][0]["type"] == "sql"

    # Owner-guard: another user gets 403 (not 404).
    client.post("/api/v1/auth/register", json={"email": "other@example.com", "password": "pw"})
    tok2 = client.post("/api/v1/auth/login", data={"username": "other@example.com", "password": "pw"}).json()["access_token"]
    assert client.get(f"/api/v1/chat/notebooks/{nb_id}", headers=_auth(tok2)).status_code == 403

    # Public share returns safe fields only.
    token = detail["share_token"]
    shared = client.get(f"/api/v1/chat/notebooks/share/{token}").json()
    assert shared["title"] == detail["title"]
    assert "owner_id" not in shared
    assert client.get("/api/v1/chat/notebooks/share/bogus").status_code == 404
```

- [ ] **Step 6: Run backend unit + e2e**

Run: `cd backend && python -m pytest tests/test_chat_llm.py tests/test_chat_orchestrator.py tests/test_chat_executor.py -v`
Expected: PASS.
Then (with a live Postgres): `cd backend && python -m pytest tests/manual_chat_e2e.py -v` → PASS.

- [ ] **Step 7: Frontend build**

Run: `cd frontend && npx tsc --noEmit && npx next lint && npx next build`
Expected: success; `/notebooks/[id]` and `/notebooks/share/[token]` emitted in the build manifest.

- [ ] **Step 8: Commit**

```bash
git add frontend/app/projects/\[id\]/page.tsx frontend/app/notebooks frontend/components/notebook-share.tsx backend/tests/manual_chat_e2e.py
git commit -m "feat(chat): entry points, owner + share pages, e2e verification (M1)"
```

---

## Milestone 2 — Full action surface (charts / cleaning / dashboard / report)

### Task 11: Executor — charts, cleaning, dashboard, report artifacts

**Files:**
- Modify: `backend/app/services/chat/executor.py`
- Modify: `backend/app/api/routes/chat.py` (`_AVAILABLE_ACTIONS_M1` → full list)
- Test: extend `backend/tests/test_chat_executor.py`

**Interfaces:**
- Consumes: `eda.engine.build_candidates` + `DatasetProfile`; `cleaning.planner.propose_plan`; `dashboard.proposer.propose_dashboard` + `dashboard.engine.assemble_context` + `build_catalog`; `app.core.storage.get_storage` + `cleaning.engine.load_dataframe` (for EDA candidates we need the frame).
- Produces: `ChatArtifact` for `chart`/`cleaning`/`dashboard`/`report`.

- [ ] **Step 1: Extend `_AVAILABLE_ACTIONS` in `backend/app/api/routes/chat.py`**

Change:
```python
_AVAILABLE_ACTIONS_M1 = ["sql"]  # M2 extends to chart/cleaning/dashboard/report
```
to:
```python
_AVAILABLE_ACTIONS = ["sql", "chart", "cleaning", "dashboard", "report"]
```
and update the `plan_turn(..., _AVAILABLE_ACTIONS_M1)` call to use `_AVAILABLE_ACTIONS`.

- [ ] **Step 2: Add the action branches to `run_action`** in `backend/app/services/chat/executor.py`. Add these helpers and wire them into `run_action`:

```python
async def run_action(session, action, project, dataset, user):
    if action.type == "sql":
        return await _run_sql(action, dataset)
    if action.type == "chart":
        return await _run_chart(action, dataset)
    if action.type == "cleaning":
        return await _run_cleaning(action, dataset)
    if action.type == "dashboard":
        return await _run_dashboard(session, action, project, dataset, user)
    if action.type == "report":
        return ChatArtifact(type="report", dataset_id=action.dataset_id,
                            status="proposed", proposal={"scope": action.scope or ("dataset" if dataset else "project")})
    return ChatArtifact(type=action.type, dataset_id=action.dataset_id, status="proposed")


async def _run_chart(action: ChatAction, dataset: Dataset | None) -> ChatArtifact:
    from app.core.storage import get_storage
    from app.services.cleaning.engine import load_dataframe
    from app.services.eda.engine import build_candidates

    if dataset is None or dataset.profile is None:
        return ChatArtifact(type="chart", dataset_id=action.dataset_id, status="error", error="No analyzed dataset.")
    profile = DatasetProfile.model_validate(dataset.profile)
    storage = get_storage()
    df = load_dataframe(storage, dataset.storage_path, dataset.file_format)
    candidates = build_candidates(df, profile)
    hints = set((action.hints or []))
    if hints:
        picked = [c for c in candidates if hints & set(c.metadata.get("columns", []))]
        candidates = picked or candidates[:4]
    else:
        candidates = candidates[:4]
    return ChatArtifact(
        type="chart", dataset_id=dataset.id,
        specs=[c.model_dump(mode="json") for c in candidates], status="proposed",
    )


async def _run_cleaning(action: ChatAction, dataset: Dataset | None) -> ChatArtifact:
    from app.services.cleaning.planner import propose_plan

    if dataset is None or dataset.profile is None:
        return ChatArtifact(type="cleaning", dataset_id=action.dataset_id, status="error", error="No analyzed dataset.")
    profile = DatasetProfile.model_validate(dataset.profile)
    understanding = (
        DatasetUnderstanding.model_validate(dataset.understanding) if dataset.understanding else None
    )
    operations, ai_available = await propose_plan(profile, understanding)
    return ChatArtifact(
        type="cleaning", dataset_id=dataset.id,
        proposal={"operations": [o.model_dump(mode="json") for o in operations], "ai_available": ai_available},
        status="proposed",
    )


async def _run_dashboard(session, action: ChatAction, project, dataset, user) -> ChatArtifact:
    from app.services.dashboard.engine import assemble_context
    from app.services.dashboard.proposer import propose_dashboard
    from app.services.dashboard.widgets.catalog import build_catalog

    scope = action.scope or ("dataset" if dataset else "project")
    ctx = assemble_context(session, project, user, scope=scope, dataset=dataset)
    catalog = build_catalog(ctx)
    spec, ai_available = await propose_dashboard(catalog, ctx)
    return ChatArtifact(
        type="dashboard", dataset_id=dataset.id if dataset else None,
        proposal={"scope": scope, "ai_available": ai_available},
        catalog=[e.model_dump(mode="json") for e in catalog], status="proposed",
    )
```

- [ ] **Step 3: Add executor tests** to `backend/tests/test_chat_executor.py`

```python
def test_run_action_report_placeholder(monkeypatch):
    art = asyncio.run(run_action(None, ChatAction(type="report", scope="project"),
                                 project=None, dataset=None, user=None))
    assert art.type == "report" and art.status == "proposed"

def test_run_action_dashboard_builds_catalog(monkeypatch):
    # Stub the dashboard proposer so no LLM is needed.
    async def fake_propose(catalog, ctx):
        from app.schemas.dashboard import DashboardSpec
        return DashboardSpec(scope=ctx.scope, widget_order=[e.widget.type for e in catalog]), True
    monkeypatch.setattr("app.services.chat.executor.propose_dashboard", fake_propose)
    from app.models.project import Project
    proj = Project(id=1, owner_id=1, name="p", description="d")
    art = asyncio.run(run_action(None, ChatAction(type="dashboard", scope="project"),
                                 project=proj, dataset=None, user=None))
    assert art.type == "dashboard"
    assert isinstance(art.catalog, list) and len(art.catalog) > 0
```

- [ ] **Step 4: Run tests**

Run: `cd backend && python -m pytest tests/test_chat_executor.py -v`
Expected: PASS (all executor tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/chat/executor.py backend/app/api/routes/chat.py backend/tests/test_chat_executor.py
git commit -m "feat(chat): executor charts/cleaning/dashboard/report (M2)"
```

---

### Task 12: Chat panel renders all artifact types (HITL)

**Files:**
- Modify: `frontend/components/chat-panel.tsx` (`ArtifactCard`)

**Interfaces:**
- Consumes: `ChartRenderer` (existing) for charts; `cleaningApi.apply` + `datasetsApi` (existing) for cleaning; `dashboardsApi.generate` / `reportsApi.generate` (existing) for links; `edaApi`/`ChartSpec` types (existing).
- Produces: HITL artifact cards (accept/reject charts; approve/apply cleaning; dashboard/report Generate links).

- [ ] **Step 1: Expand `ArtifactCard`** in `frontend/components/chat-panel.tsx` to handle `chart`, `cleaning`, `dashboard`, `report` in addition to `sql`. Replace the final `return (...)` (the inert placeholder) with:

```tsx
  if (artifact.type === "chart") {
    const specs = (artifact.specs ?? []) as unknown as import("@/lib/types").ChartSpec[];
    const [accepted, setAccepted] = useState<string[]>([]);
    return (
      <div className="mt-2 rounded-md border bg-background p-3 text-left text-sm">
        <p className="font-medium">Recommended charts</p>
        {specs.map((s) => (
          <div key={s.id} className="my-2">
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={accepted.includes(s.id)} onChange={(e) => setAccepted((p) => e.target.checked ? [...p, s.id] : p.filter((x) => x !== s.id))} />
              {s.title}
            </label>
            <ChartRenderer spec={s} />
          </div>
        ))}
        <p className="text-xs text-muted-foreground">{accepted.length} selected</p>
      </div>
    );
  }
  if (artifact.type === "cleaning") {
    const ops = (artifact.proposal as any)?.operations ?? [];
    return (
      <div className="mt-2 rounded-md border bg-background p-3 text-left text-sm">
        <p className="font-medium">Cleaning suggestions</p>
        <ul className="list-inside list-disc text-xs">{ops.map((o: any, i: number) => <li key={i}>{o.op}: {o.explanation}</li>)}</ul>
      </div>
    );
  }
  if (artifact.type === "dashboard" || artifact.type === "report") {
    const scope = (artifact.proposal as any)?.scope ?? (dataset ? "dataset" : "project");
    const gen = artifact.type === "dashboard" ? dashboardsApi.generate : reportsApi.generate;
    return (
      <div className="mt-2 rounded-md border bg-background p-3 text-left text-sm">
        <p className="font-medium">{artifact.type === "dashboard" ? "Dashboard" : "Report"} recommendation</p>
        <Button size="sm" className="mt-2" onClick={async () => {
          const r = await gen(scope === "dataset" ? { scope: "dataset", dataset_id: dataset!.id, project_id: projectId } : { scope: "project", project_id: projectId });
          window.location.href = artifact.type === "dashboard" ? `/dashboards/${r.id}` : `/reports/${r.id}`;
        }}>{artifact.type === "dashboard" ? "Open dashboard" : "Generate report"}</Button>
      </div>
    );
  }
  return <div className="mt-2 rounded-md border bg-background p-3 text-left text-sm text-muted-foreground">{artifact.type}</div>;
```

> Note: `projectId` must be in scope for `ArtifactCard`. Either lift it to component props or read it from the `ChatPanel` closure (it already has `projectId`). Pass `projectId` into `ArtifactCard` via its props if not already captured.

- [ ] **Step 2: Typecheck + lint + build**

Run: `cd frontend && npx tsc --noEmit && npx next lint && npx next build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/chat-panel.tsx
git commit -m "feat(chat): render chart/cleaning/dashboard/report artifacts with HITL (M2)"
```

---

### Task 13: M2 verification + docs

**Files:**
- Modify: `PROJECT_PROGRESS.md`, `DEVELOPMENT_LOG.md`

**Interfaces:** Standard.

- [ ] **Step 1: Run full backend + frontend checks**

Run: `cd backend && python -m pytest tests/test_chat_llm.py tests/test_chat_orchestrator.py tests/test_chat_executor.py -v` → PASS.
Run: `cd frontend && npx tsc --noEmit && npx next lint && npx next build` → success.

- [ ] **Step 2: Update `PROJECT_PROGRESS.md`** — mark Sprint 5 M1 + M2 complete; add "Next Tasks" entry for M3 + Portfolio Polish.

- [ ] **Step 3: Append a `DEVELOPMENT_LOG.md` entry** describing M1+M2 (engine primitives, executor, SSE route, frontend panel). Mirror the style of the Dashboard M3 entry.

- [ ] **Step 4: Commit**

```bash
git add PROJECT_PROGRESS.md DEVELOPMENT_LOG.md
git commit -m "docs(chat): M1+M2 shipped; update progress + log"
```

---

## Milestone 3 — Routing, notebook management & verification

### Task 14: Cross-dataset project routing

**Files:**
- Modify: `backend/app/services/chat/context.py` (populate `project_summary` for project scope)
- Modify: `backend/app/api/routes/chat.py` (`_resolve_scope`/`chat_message` to allow project questions that target a specific dataset frame)

**Interfaces:**
- Consumes: `dashboard.assemble_context` (project scope aggregates), `Dataset` list for a project.
- Produces: project-scope chat where SQL/cleaning actions name a `dataset_id` and the executor loads that frame (single-frame only; cross-dataset joins remain out of scope per spec §1).

- [ ] **Step 1: Populate `project_summary`** in `build_chat_context` when `dataset is None`:

```python
    if dataset is None:
        from sqlmodel import select
        from app.models.dataset import Dataset as _D
        owned = session.exec(select(_D).where(_D.project_id == project.id, _D.owner_id == user.id)).all()
        project_summary = {
            "dataset_count": len(owned),
            "profiled_count": sum(1 for d in owned if d.profile),
            "datasets": [
                {"id": d.id, "name": d.original_filename, "columns": list((d.profile or {}).get("column_names", [])),
                 "row_count": (d.profile or {}).get("row_count")}
                for d in owned
            ],
        }
```

- [ ] **Step 2: Allow project-scope SQL to target a dataset frame** — in `chat_message`, when `dataset is None` but a proposed `sql` action carries `dataset_id`, load that dataset (owner-checked) and pass it as the execution `dataset` for that action:

```python
            for action in proposed:
                exec_ds = dataset
                if exec_ds is None and action.dataset_id is not None:
                    exec_ds = session.get(Dataset, action.dataset_id)
                    if exec_ds is None or exec_ds.owner_id != current_user.id:
                        exec_ds = None
                artifact = await run_action(session, action, project, exec_ds, current_user)
                actions.append(artifact)
                yield _sse("artifact", {"artifact": artifact.model_dump(mode="json")})
```

- [ ] **Step 3: Add a routing test** to `backend/tests/manual_chat_e2e.py` covering a project-scope question that targets a dataset frame (assert the SQL artifact resolves `dataset_id` and the notebook persists).

- [ ] **Step 4: Run e2e** (live Postgres) → PASS; `cd frontend && npx tsc --noEmit && npx next build` → success.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/chat/context.py backend/app/api/routes/chat.py backend/tests/manual_chat_e2e.py
git commit -m "feat(chat): cross-dataset project routing (M3)"
```

---

### Task 15: Notebook list/manage page + pin/rename/regenerate

**Files:**
- Create: `frontend/app/notebooks/page.tsx` (project notebooks list) — optional, or add a list section to the project workspace.
- Modify: `frontend/app/notebooks/[id]/page.tsx` (rename via `notebooksApi.update`, delete via `remove`, back-to-project).

**Interfaces:**
- Consumes: `notebooksApi.list`/`update`/`remove` (Task 8).

- [ ] **Step 1: Add list + management to the project workspace or a `/notebooks` index** showing `notebooksApi.list(projectId)` with links to `/notebooks/{id}`, a rename input (PATCH), and a delete button (DELETE). Mirror the dashboards list pattern.

- [ ] **Step 2: Extend `frontend/app/notebooks/[id]/page.tsx`** with a rename field (calls `notebooksApi.update(id, { title })`) and a delete button (calls `notebooksApi.remove(id)` → router back to project).

- [ ] **Step 3: Typecheck + build** → success; commit:

```bash
git add frontend/app/notebooks
git commit -m "feat(chat): notebook management (list/rename/delete) (M3)"
```

---

### Task 16: End-to-end browser verification + final docs

**Files:**
- Modify: `PROJECT_PROGRESS.md`, `DEVELOPMENT_LOG.md`, `ARCHITECTURE.md` (if needed).

**Interfaces:** Standard.

- [ ] **Step 1: Drive a real chat turn in the browser** (or via the existing Playwright MCP if available): open a dataset → Chat → ask "Why did revenue drop in Q3?" → confirm tokens stream → SQL artifact appears → click Run → table + chart render → Save (notebook created) → open share link → read-only, branded footer.

- [ ] **Step 2: Run the full suite**

Run: `cd backend && python -m pytest tests/test_chat_llm.py tests/test_chat_orchestrator.py tests/test_chat_executor.py -v` → PASS.
Run: `cd frontend && npx tsc --noEmit && npx next lint && npx next build` → success.

- [ ] **Step 3: Update `PROJECT_PROGRESS.md`** — mark Sprint 5 (AI Chat & Notebook) fully complete; update the milestone timeline (AI Chat & Notebook ✅; next: Portfolio Polish).

- [ ] **Step 4: Append a `DEVELOPMENT_LOG.md` entry** for M3 (routing + management + verification).

- [ ] **Step 5: Commit**

```bash
git add PROJECT_PROGRESS.md DEVELOPMENT_LOG.md
git commit -m "docs(chat): Sprint 5 complete; update progress + log"
```

---

## Self-Review Notes (applied during writing)

- **Spec → plan correction:** the approved spec said UUID PKs; the codebase uses **integer** PKs (`Dataset`/`Dashboard`/`Report`). The plan uses integer IDs everywhere (`Notebook.id: int | None`, FKs `int`, `share_token` is the public token, not the PK).
- **No engine modified:** `sql/`, `eda/`, `cleaning/`, `dashboard/`, `reporting/` are only imported and called.
- **HITL preserved:** artifacts are `proposed`; SQL Run reuses `POST /sql/run`, cleaning reuses `propose_plan`, dashboard/report reuse their `generate` endpoints — no new execution routes.
- **SSE consumer:** uses `fetch` + `ReadableStream` (EventSource cannot POST), parsing `event:`/`data:` frames; `token`/`artifact`/`done`/`error` events match the spec §5.
- **Owner guard:** 403 if exists-but-not-owner, 404 if absent (matches `dashboards._owned`).
- **Fallback:** `plan_turn`/LLM failures yield a deterministic plan + `ai_available=False`; the stream emits `error` without a 5xx.
