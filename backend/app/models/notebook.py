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
    project_id: int = Field(index=True, foreign_key="projects.id", ondelete="CASCADE")
    owner_id: int = Field(index=True, foreign_key="users.id", ondelete="CASCADE")
    scope: str = "dataset"  # "dataset" | "project"
    dataset_id: int | None = Field(default=None, index=True, foreign_key="datasets.id", ondelete="CASCADE")
    title: str
    turns: list | None = Field(default=None, sa_column=Column(JSON))
    share_token: str = Field(index=True, unique=True)
    ai_available: bool = True  # True only if every persisted turn used AI
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
    generated_at: datetime | None = Field(default=None)  # set on first assistant turn
