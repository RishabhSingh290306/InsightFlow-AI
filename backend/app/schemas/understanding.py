"""Shared contracts for the AI dataset-understanding workflow.

`DatasetProfile` is produced by deterministic Stage 1 profiling (pandas) and is
the single source of truth. `DatasetUnderstanding` is the Stage 2 AI
interpretation. Both are stored as JSON on the `Dataset` and reused by every
downstream workflow (cleaning, EDA, SQL, viz, insights, dashboards, reports).
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class DatasetProfile(BaseModel):
    """Structured, deterministic facts about an uploaded dataset."""

    file_name: str
    file_size: int
    row_count: int
    column_count: int
    column_names: list[str]
    inferred_types: dict[str, str]
    numeric_columns: list[str]
    categorical_columns: list[str]
    date_columns: list[str]
    missing_values: dict[str, int]
    duplicate_row_count: int
    null_percentage: float
    unique_values: dict[str, int]
    basic_statistics: dict[str, dict]
    potential_target_column: str | None = None
    data_quality_issues: list[str] = Field(default_factory=list)
    preview: list[dict] = Field(default_factory=list)


class DatasetUnderstanding(BaseModel):
    """AI interpretation of a `DatasetProfile` (structured JSON)."""

    dataset_description: str = ""
    business_domain_guess: str = ""
    likely_use_case: str = ""
    possible_target_column: str | None = None
    important_features: list[str] = Field(default_factory=list)
    data_quality_summary: str = ""
    cleaning_recommendations: list[str] = Field(default_factory=list)
    suggested_visualizations: list[str] = Field(default_factory=list)
    suggested_business_questions: list[str] = Field(default_factory=list)
    initial_business_observations: list[str] = Field(default_factory=list)
    confidence_score: float = 0.0
    explanation: dict[str, str] = Field(default_factory=dict)
    # Set false when the LLM was unavailable/failed and this is a deterministic
    # fallback. Lets the UI show a clear "AI insights unavailable" message.
    ai_available: bool = True
