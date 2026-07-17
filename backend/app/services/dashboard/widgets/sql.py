"""SQL widget — recent executed queries for this dataset (dataset scope)."""
from __future__ import annotations

from app.services.dashboard.widgets.base import DashboardWidget
from app.services.dashboard.widgets.context import DashboardContext


class SqlWidget(DashboardWidget):
    type = "sql_widget"
    title = "Recent SQL Analysis"
    description = "Questions the analyst asked and ran against this dataset."
    applies_to_scopes = ["dataset"]

    def availability(self, ctx: DashboardContext) -> bool:
        return bool(ctx.sql_history)

    def build(self, ctx: DashboardContext) -> dict:
        queries = [
            {
                "id": q.id,
                "business_question": q.business_question,
                "sql": q.sql,
                "explanation": q.explanation,
                "suggested_visualization": q.suggested_visualization,
                "executed_at": q.executed_at.isoformat() if hasattr(q.executed_at, "isoformat") else q.executed_at,
            }
            for q in ctx.sql_history
        ]
        return {"queries": queries}
