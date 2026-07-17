"""Data quality widget — concrete quality issues (dataset scope)."""
from __future__ import annotations

from app.services.dashboard.widgets.base import DashboardWidget
from app.services.dashboard.widgets.context import DashboardContext


class DataQualityWidget(DashboardWidget):
    type = "data_quality"
    title = "Data Quality"
    description = "Concrete data quality issues detected during profiling."
    applies_to_scopes = ["dataset"]

    def availability(self, ctx: DashboardContext) -> bool:
        if ctx.dataset is None or ctx.dataset.id not in ctx.profiles:
            return False
        p = ctx.profiles[ctx.dataset.id]
        return bool(p.data_quality_issues) or p.duplicate_row_count > 0 or float(p.null_percentage) > 0

    def build(self, ctx: DashboardContext) -> dict:
        p = ctx.profiles[ctx.dataset.id]
        return {
            "issues": list(p.data_quality_issues),
            "null_percentage": round(float(p.null_percentage), 1),
            "duplicate_row_count": p.duplicate_row_count,
        }
