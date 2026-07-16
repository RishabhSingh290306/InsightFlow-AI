from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


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
    status: str
    version: int
    created_at: datetime
