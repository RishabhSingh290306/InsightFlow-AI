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
    project_id: int = Field(index=True, foreign_key="projects.id", ondelete="CASCADE")
    dataset_id: int = Field(index=True, foreign_key="datasets.id", ondelete="CASCADE")
    owner_id: int = Field(index=True, foreign_key="users.id", ondelete="CASCADE")
    parent_query_id: int | None = Field(default=None, foreign_key="sql_queries.id", index=True, ondelete="CASCADE")
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
