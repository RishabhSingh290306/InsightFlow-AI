"""Wire contracts for the Dashboard Recommendations workflow.

A `DashboardSpec` is config only (widget order, hidden widgets, groups, AI
prose, user notes) — never rendered data. The renderer resolves each widget's
live data from the latest artifacts at render time.
"""
from __future__ import annotations

from pydantic import BaseModel


class WidgetMeta(BaseModel):
    """Metadata for one widget — what the AI sees (never its data)."""

    type: str
    title: str
    description: str
    applies_to_scopes: list[str]


class CatalogEntry(BaseModel):
    """A candidate widget with its deterministic, already-computed data."""

    widget: WidgetMeta
    data: dict = {}


class DashboardSpec(BaseModel):
    """The stored/transferred dashboard configuration (no rendered data)."""

    scope: str  # "dataset" | "project"
    widget_order: list[str] = []
    hidden_widgets: list[str] = []
    groups: list[dict] = []
    ai_summary: dict | None = None
    user_notes: dict | None = None


class DashboardView(BaseModel):
    """A resolved dashboard: ordered widgets with live data + the spec."""

    scope: str
    spec: DashboardSpec
    widgets: list[CatalogEntry] = []
    ai_available: bool = True


class DashboardPreviewRequest(BaseModel):
    """Body for POST /dashboards/preview (ephemeral, no persistence in M1)."""

    scope: str
    project_id: int | None = None
    dataset_id: int | None = None
