"""Dashboard — a curated, persisted view of a project's analysis.

Stores the *spec* (config only: widget order, hidden widgets, groups, AI
summary, user notes, scope, dataset version reference, refreshed timestamp) —
never rendered data. The renderer resolves each widget's live data from the
latest artifacts at render time (spec §5).
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Dashboard(SQLModel, table=True):
    __tablename__ = "dashboards"

    id: int | None = Field(default=None, primary_key=True)
    project_id: int = Field(index=True, foreign_key="projects.id")
    owner_id: int = Field(index=True, foreign_key="users.id")
    scope: str = "dataset"  # "dataset" | "project"
    dataset_id: int | None = Field(default=None, index=True, foreign_key="datasets.id")
    dataset_version_id: int | None = Field(default=None)
    title: str
    spec: dict | None = Field(default=None, sa_column=Column(JSON))
    ai_available: bool = True
    refreshed_at: datetime = Field(default_factory=_now)
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
