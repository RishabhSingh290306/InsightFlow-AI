"""Wire contracts for the AI Chat & Notebook workflow.

A `Notebook` stores an ordered `turns` list (ChatTurn). Each assistant turn
carries `actions` (proposed artifacts) as `ChatArtifact`. Artifact payloads are
stored as plain dicts (`proposal`/`specs`/`catalog`/`result`) so the schema never
imports the other engines and the `turns` JSON stays stable.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

ChatScope = Literal["dataset", "project"]
ChatActionType = Literal["sql", "chart", "cleaning", "dashboard", "report"]
ChatArtifactType = Literal["sql", "chart", "cleaning", "dashboard", "report"]
ChatArtifactStatus = Literal[
    "proposed", "executed", "accepted", "rejected", "opened", "error"
]
ChatRole = Literal["user", "assistant"]


class ChatContext(BaseModel):
    """Structured facts sent to the LLM (never raw rows)."""
    scope: ChatScope
    project_id: int
    dataset_id: int | None = None
    profile: dict | None = None
    understanding: dict | None = None
    eda: dict | None = None
    project_summary: dict | None = None  # lightweight aggregates for project scope


class ChatAction(BaseModel):
    """One proposed action from the intent call.

    `type` is intentionally `str`, not `ChatActionType`: the LLM may propose an
    action we don't recognise, and `run_action` must degrade gracefully (it
    returns a `proposed` placeholder forwarding the unknown type) rather than
    reject the whole turn. The `ChatActionType` union documents the *known*
    contract; anything outside it is treated as an unknown-action placeholder.
    """
    type: str
    question: str | None = None
    dataset_id: int | None = None
    hints: list[str] | None = None
    scope: ChatScope | None = None


class ChatArtifact(BaseModel):
    """A proposed/executed artifact attached to an assistant turn.

    `type` is `str` (not `ChatArtifactType`) because unknown action types are
    forwarded verbatim as placeholder artifacts by the executor.
    """
    type: str
    dataset_id: int | None = None
    proposal: dict | None = None   # e.g. SqlProposal.model_dump()
    specs: list[dict] | None = None  # chart ChartSpec.model_dump() list
    catalog: list[dict] | None = None  # dashboard CatalogEntry.model_dump() list
    status: ChatArtifactStatus = "proposed"
    error: str | None = None
    result: dict | None = None  # executed result (e.g. SqlResult) — persisted in M2


class ChatTurn(BaseModel):
    """One message in a notebook."""
    id: str
    role: ChatRole
    content: str
    actions: list[ChatArtifact] = []
    parent_id: str | None = None
    created_at: str


class NotebookCreate(BaseModel):
    scope: ChatScope
    project_id: int
    dataset_id: int | None = None
    title: str | None = None


class NotebookRead(BaseModel):
    id: int
    project_id: int
    owner_id: int
    scope: ChatScope
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
    scope: ChatScope
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
