"""Recent reports widget — the project's report documents (project scope)."""
from __future__ import annotations

from app.services.dashboard.widgets.base import DashboardWidget
from app.services.dashboard.widgets.context import DashboardContext


class RecentReportsWidget(DashboardWidget):
    type = "recent_reports"
    title = "Recent Reports"
    description = "Reports generated for this project, most recently updated first."
    applies_to_scopes = ["project"]

    def availability(self, ctx: DashboardContext) -> bool:
        return ctx.scope == "project" and bool(ctx.reports)

    def build(self, ctx: DashboardContext) -> dict:
        reports = [
            {
                "id": r.id,
                "title": r.title,
                "scope": r.scope,
                "dataset_id": r.dataset_id,
                "section_count": len(r.sections) if r.sections else 0,
                "ai_available": r.ai_available,
                "updated_at": r.updated_at.isoformat() if hasattr(r.updated_at, "isoformat") else r.updated_at,
            }
            for r in ctx.reports
        ]
        return {"reports": reports}
