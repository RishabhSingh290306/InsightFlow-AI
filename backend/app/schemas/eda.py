"""Wire contracts for the EDA + Visualizations workflow.

A single universal `ChartSpec` describes every chart (present and future) so the
frontend `ChartRenderer` and all downstream consumers (dashboards, reports,
notebook, AI chat, export) stay stable. `data` is chart-ready (bins / counts /
points / matrix) and is computed deterministically by the backend.
"""
from __future__ import annotations

from pydantic import BaseModel


class ChartSpec(BaseModel):
    """A single recommended visualization (universal spec)."""

    id: str
    chart_type: str  # "bar" | "line" | "scatter" | "histogram" | "pie" | "box" | "heatmap"
    title: str
    subtitle: str | None = None
    business_question: str
    explanation: str
    recommended_reason: str
    confidence: float
    axis_config: dict = {}
    data: list[dict] = []
    metadata: dict = {}
    accepted: bool = False


class EdaResult(BaseModel):
    """The stored analysis for a dataset: recommended charts + AI availability."""

    ai_available: bool = True
    charts: list[ChartSpec] = []


class EdaAcceptRequest(BaseModel):
    """Body for PATCH /datasets/{id}/eda — the human's accepted chart ids."""

    accepted_ids: list[str] = []
