from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

DatasetStatus = Literal["uploaded", "profiled", "understood", "failed"]
DatasetOrigin = Literal["upload", "cleaning"]


class DatasetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    owner_id: int
    original_filename: str
    file_format: str
    file_size: int
    row_count: int | None
    column_count: int | None
    status: DatasetStatus
    version: int
    parent_id: int | None = None
    root_id: int | None = None
    origin: DatasetOrigin = "upload"
    recipe: dict | None = None
    profile: dict | None = None
    understanding: dict | None = None
    created_at: datetime
