"""Wire contracts for the Insights + Reports workflow.

A `Report` is an ordered list of `ReportSection`. Each section holds `blocks` that
mix editable prose with references to already-stored artifacts (chart specs, SQL
records, tables, lineage). The renderer resolves these references; it never
computes anything.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel


class SectionType(str, Enum):
    COVER = "cover"
    EXECUTIVE_SUMMARY = "executive_summary"
    DATASET_OVERVIEW = "dataset_overview"
    DATA_QUALITY = "data_quality"
    CLEANING_SUMMARY = "cleaning_summary"
    EDA = "eda"
    SQL_ANALYSIS = "sql_analysis"
    BUSINESS_INSIGHTS = "business_insights"
    RECOMMENDATIONS = "recommendations"
    APPENDIX = "appendix"
    CUSTOM = "custom"


class SectionBlock(BaseModel):
    """One unit inside a section."""

    kind: str  # "prose" | "chart" | "sql" | "table" | "lineage" | "custom_note"
    text: str | None = None
    ref_id: str | None = None
    payload: dict = {}


class ReportSection(BaseModel):
    id: str
    type: SectionType
    title: str
    blocks: list[SectionBlock] = []


class ReportRead(BaseModel):
    id: int
    project_id: int
    owner_id: int
    scope: str
    dataset_id: int | None = None
    title: str
    sections: list[ReportSection]
    share_token: str
    ai_available: bool
    created_at: datetime
    updated_at: datetime
    generated_at: datetime


class ReportShareRead(BaseModel):
    """Public, read-only projection — no owner/project linkage, no row ids."""

    title: str
    scope: str
    sections: list[ReportSection]
    ai_available: bool
    generated_at: datetime


class ReportGenerateRequest(BaseModel):
    scope: str  # "dataset" | "project"
    project_id: int | None = None
    dataset_id: int | None = None
    title: str | None = None


class ReportUpdateRequest(BaseModel):
    title: str | None = None
    sections: list[ReportSection]
