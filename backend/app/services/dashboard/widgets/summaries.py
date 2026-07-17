"""Dataset summaries widget — one card per project dataset (project scope)."""
from __future__ import annotations

from app.services.dashboard.widgets.base import DashboardWidget
from app.services.dashboard.widgets.context import DashboardContext


class DatasetSummariesWidget(DashboardWidget):
    type = "dataset_summaries"
    title = "Datasets"
    description = "Every dataset in the project with its analysis status and shape."
    applies_to_scopes = ["project"]

    def availability(self, ctx: DashboardContext) -> bool:
        return ctx.scope == "project" and bool(ctx.datasets)

    def build(self, ctx: DashboardContext) -> dict:
        summaries = []
        for d in sorted(ctx.datasets, key=lambda x: x.created_at, reverse=True):
            summaries.append(
                {
                    "id": d.id,
                    "filename": d.original_filename,
                    "status": d.status,
                    "version": d.version,
                    "row_count": d.row_count,
                    "column_count": d.column_count,
                    "has_profile": d.id in ctx.profiles,
                    "has_understanding": d.id in ctx.understandings,
                    "has_eda": d.id in ctx.eda_results,
                    "created_at": d.created_at.isoformat() if hasattr(d.created_at, "isoformat") else d.created_at,
                }
            )
        return {"datasets": summaries}
