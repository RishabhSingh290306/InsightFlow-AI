"""Dataset model — an uploaded file belonging to a project.

Each upload creates one `Dataset` row. Re-uploading a file with the same name stem
increments the `version` for that `(project_id, name_stem)` group, giving a simple
first slice of the versioning service. `row_count` / `column_count` are filled from
pandas at upload time; `status` starts as ``"uploaded"`` and is advanced by the AI
dataset-understanding workflow.

Datasets form an immutable, Git-like version graph: the original upload is never
mutated, and every transformation (cleaning, and later feature engineering / SQL /
manual edits) creates a **new** `Dataset` row linked by `parent_id` / `root_id`.
`root_id` points at the original upload of the lineage; `WHERE root_id = ?` lists a
full lineage. `origin` distinguishes uploads from derived versions, and `recipe`
records the executed transformation for derived versions (`NULL` for uploads).
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Column, JSON, UniqueConstraint
from sqlmodel import Field, SQLModel


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Dataset(SQLModel, table=True):
    __tablename__ = "datasets"
    __table_args__ = (
        # One version per (project, name stem) group — prevents two concurrent
        # uploads of the same file creating duplicate version numbers.
        UniqueConstraint("project_id", "name_stem", "version", name="uq_dataset_version"),
    )

    id: int | None = Field(default=None, primary_key=True)
    project_id: int = Field(index=True, foreign_key="projects.id", ondelete="CASCADE")
    owner_id: int = Field(index=True, foreign_key="users.id", ondelete="CASCADE")
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
    # Version lineage (Git-like). Uploads are roots: parent_id=NULL, root_id=self,
    # origin="upload". Derived versions (cleaning/SQL/etc.) set parent_id/root_id to
    # point back along the chain and origin to their transformation type.
    parent_id: int | None = Field(default=None, index=True, foreign_key="datasets.id", ondelete="CASCADE")
    root_id: int | None = Field(default=None, index=True, foreign_key="datasets.id", ondelete="CASCADE")
    origin: str = "upload"  # "upload" | "cleaning" | future: "sql","feature_eng","manual"
    recipe: dict | None = Field(default=None, sa_column=Column(JSON))
    # Stage 1 facts (deterministic profiling) — single source of truth for
    # downstream workflows. Stage 2 AI interpretation is stored separately.
    profile: dict | None = Field(default=None, sa_column=Column(JSON))
    understanding: dict | None = Field(default=None, sa_column=Column(JSON))
    # EDA + Visualizations: recommended chart specs (ChartSpec list) produced by
    # the deterministic EDA engine + AI proposer. NULL until EDA is generated.
    eda: dict | None = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=_now)
