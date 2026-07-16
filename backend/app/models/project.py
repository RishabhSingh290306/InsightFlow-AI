"""Project / workspace model — the top-level container for a user's datasets
and analyses.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Project(SQLModel, table=True):
    __tablename__ = "projects"

    id: int | None = Field(default=None, primary_key=True)
    owner_id: int = Field(index=True, foreign_key="users.id")
    name: str = Field(index=True)
    description: str = Field(default="")
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=_now)
