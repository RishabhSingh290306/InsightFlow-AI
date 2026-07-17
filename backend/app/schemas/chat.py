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
