"""KPI cards widget — headline dataset metrics (dataset scope)."""
from __future__ import annotations

from app.services.dashboard.widgets.base import DashboardWidget
from app.services.dashboard.widgets.context import DashboardContext


def _quality_score(profile) -> int:
    # 0-100 heuristic: start at 100, subtract penalties for known issues.
    score = 100
    score -= int(min(profile.null_percentage, 50))
    score -= min(profile.duplicate_row_count, 20)
    score -= min(len(profile.data_quality_issues), 20)
    return max(0, score)


class KpiCardsWidget(DashboardWidget):
    type = "kpi_cards"
    title = "Key Metrics"
    description = "Headline dataset metrics: rows, columns, null %, duplicates, quality score."
    applies_to_scopes = ["dataset"]

    def availability(self, ctx: DashboardContext) -> bool:
        return ctx.dataset is not None and ctx.dataset.id in ctx.profiles

    def build(self, ctx: DashboardContext) -> dict:
        p = ctx.profiles[ctx.dataset.id]
        return {
            "kpis": [
                {"label": "Rows", "value": p.row_count, "hint": "total records"},
                {"label": "Columns", "value": p.column_count, "hint": "fields"},
                {"label": "Null %", "value": round(float(p.null_percentage), 1), "hint": "missing cells"},
                {"label": "Duplicate rows", "value": p.duplicate_row_count, "hint": "exact dupes"},
                {"label": "Quality score", "value": f"{_quality_score(p)}/100", "hint": "heuristic"},
            ]
        }
