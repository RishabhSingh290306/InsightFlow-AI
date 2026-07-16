"""Dataset model — an uploaded file belonging to a project.

Each upload creates one `Dataset` row. Re-uploading a file with the same name stem
increments the `version` for that `(project_id, name_stem)` group, giving a simple
first slice of the versioning service. `row_count` / `column_count` are filled from
pandas at upload time; `status` starts as ``"uploaded"`` and is advanced by the AI
dataset-understanding workflow.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Dataset(SQLModel, table=True):
    __tablename__ = "datasets"

    id: int | None = Field(default=None, primary_key=True)
    project_id: int = Field(index=True, foreign_key="projects.id")
    owner_id: int = Field(index=True, foreign_key="users.id")
    filename: str  # stored name, e.g. "<uuid>.csv"
    original_filename: str
    name_stem: str = Field(index=True)  # for version grouping
    storage_path: str
    file_size: int
    mime_type: str = ""
    file_format: str  # "csv", "xlsx", ...
    row_count: int | None = None
    column_count: int | None = None
    status: str = "uploaded"
    version: int = 1
    # Stage 1 facts (deterministic profiling) — single source of truth for
    # downstream workflows. Stage 2 AI interpretation is stored separately.
    profile: dict | None = Field(default=None, sa_column=Column(JSON))
    understanding: dict | None = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=_now)
