"""Wire contracts for the SQL Generation (Question → SQL) workflow.

A single read-only query loop: the user asks a question, the AI returns SQL +
explanation + a suggested visualization, the human edits and executes it, the
deterministic engine runs it safely, and the result + AI insights come back.
Every executed query is persisted as a `SqlQueryRecord` in project history.
"""
from __future__ import annotations

from pydantic import BaseModel


class SqlVisualization(BaseModel):
    """A suggested chart for the query result (reuses the EDA ChartSpec contract)."""

    chart_type: str  # "bar" | "line" | "scatter" | "histogram" | "pie" | "box" | "heatmap"
    rationale: str
    x: str | None = None
    y: str | None = None


class SqlGenerateRequest(BaseModel):
    """Body for POST /sql/generate."""

    dataset_id: int
    question: str


class SqlProposal(BaseModel):
    """AI response to a business question (best-effort)."""

    business_question: str
    sql: str
    explanation: str
    confidence: float  # 0-1
    suggested_visualization: SqlVisualization | None = None
    ai_available: bool = True


class SqlRunRequest(BaseModel):
    """Body for POST /sql/run — the (possibly edited) SQL to execute."""

    dataset_id: int
    sql: str
    edited: bool = False  # True if the user modified the AI-generated SQL
    business_question: str | None = None
    explanation: str | None = None
    suggested_visualization: SqlVisualization | None = None


class SqlResult(BaseModel):
    """Execution result returned to the frontend."""

    columns: list[str]
    rows: list[dict]
    row_count: int
    truncated: bool
    duration_ms: float
    insights: list[str] = []
    insights_ai_available: bool = True
    persisted_id: int | None = None


class SqlQueryRecord(BaseModel):
    """A persisted, executed query (project history)."""

    id: int
    project_id: int
    dataset_id: int
    owner_id: int
    business_question: str
    sql: str
    edited: bool
    explanation: str
    suggested_visualization: SqlVisualization | None = None
    insights: list[str] = []
    columns: list[str] = []
    row_count: int | None = None
    truncated: bool | None = None
    duration_ms: float | None = None
    executed_at: str
