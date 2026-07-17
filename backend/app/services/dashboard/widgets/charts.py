"""Recommended charts widget — accepted EDA charts (dataset scope)."""
from __future__ import annotations

from app.services.dashboard.widgets.base import DashboardWidget
from app.services.dashboard.widgets.context import DashboardContext


class RecommendedChartsWidget(DashboardWidget):
    type = "recommended_charts"
    title = "Recommended Charts"
    description = "Charts the human accepted during EDA (or all recommended if none accepted)."
    applies_to_scopes = ["dataset"]

    def availability(self, ctx: DashboardContext) -> bool:
        if ctx.dataset is None or ctx.dataset.id not in ctx.eda_results:
            return False
        return bool(ctx.eda_results[ctx.dataset.id].charts)

    def build(self, ctx: DashboardContext) -> dict:
        charts = ctx.eda_results[ctx.dataset.id].charts
        accepted = [c for c in charts if c.accepted]
        chosen = accepted if accepted else charts
        return {"charts": [c.model_dump(mode="json") for c in chosen]}
