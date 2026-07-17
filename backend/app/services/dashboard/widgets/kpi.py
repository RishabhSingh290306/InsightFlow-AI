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


class ProjectKpisWidget(DashboardWidget):
    """Project-wide headline metrics aggregated across the project's datasets (project scope)."""

    type = "project_kpis"
    title = "Project Metrics"
    description = "Aggregated metrics across all datasets in the project: counts, rows, and activity."
    applies_to_scopes = ["project"]

    def availability(self, ctx: DashboardContext) -> bool:
        return ctx.scope == "project" and bool(ctx.datasets)

    def build(self, ctx: DashboardContext) -> dict:
        total_rows = 0
        total_cols = 0
        for d in ctx.datasets:
            total_rows += int(d.row_count or 0)
            total_cols += int(d.column_count or 0)
        profiled = len(ctx.profiles)
        with_eda = sum(1 for d in ctx.datasets if d.id in ctx.eda_results)
        with_understanding = len(ctx.understandings)
        return {
            "kpis": [
                {"label": "Datasets", "value": len(ctx.datasets), "hint": "in this project"},
                {"label": "Analyzed", "value": profiled, "hint": "profiled datasets"},
                {"label": "With EDA", "value": with_eda, "hint": "charts generated"},
                {"label": "AI understood", "value": with_understanding, "hint": "interpreted"},
                {"label": "Total rows", "value": total_rows, "hint": "across datasets"},
                {"label": "Total columns", "value": total_cols, "hint": "across datasets"},
                {"label": "SQL queries", "value": len(ctx.sql_history), "hint": "questions asked"},
                {"label": "Reports", "value": len(ctx.reports), "hint": "documents"},
            ]
        }
