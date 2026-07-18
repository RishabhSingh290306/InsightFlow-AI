"""Report — a curated, editable analysis document.

Stored as canonical JSON: an ordered list of `ReportSection` dicts in `sections`.
`share_token` is a random, unique, public handle for the read-only share link.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, JSON, Text
from sqlmodel import Field, SQLModel


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Report(SQLModel, table=True):
    __tablename__ = "reports"

    id: int | None = Field(default=None, primary_key=True)
    project_id: int = Field(index=True, foreign_key="projects.id", ondelete="CASCADE")
    owner_id: int = Field(index=True, foreign_key="users.id", ondelete="CASCADE")
    scope: str = "dataset"  # "dataset" | "project"
    dataset_id: int | None = Field(default=None, index=True, foreign_key="datasets.id", ondelete="CASCADE")
    title: str = Field(sa_column=Column(Text))
    sections: list[dict] = Field(default_factory=list, sa_column=Column(JSON))
    share_token: str = Field(index=True, unique=True)
    ai_available: bool = True
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
    generated_at: datetime = Field(default_factory=_now)
