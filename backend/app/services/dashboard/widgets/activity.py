"""Activity feed widget — recent events across datasets, SQL, and reports (project scope)."""
from __future__ import annotations

from app.services.dashboard.widgets.base import DashboardWidget
from app.services.dashboard.widgets.context import DashboardContext


def _ts(value) -> float:
    """Sort key for an arbitrary timestamp (datetime or iso string)."""
    if value is None:
        return 0.0
    if hasattr(value, "timestamp"):
        try:
            return float(value.timestamp())
        except Exception:
            return 0.0
    return 0.0


class ActivityFeedWidget(DashboardWidget):
    type = "activity_feed"
    title = "Activity"
    description = "A timeline of recent uploads, SQL questions, and report updates in the project."
    applies_to_scopes = ["project"]

    def availability(self, ctx: DashboardContext) -> bool:
        return ctx.scope == "project" and (
            bool(ctx.datasets) or bool(ctx.sql_history) or bool(ctx.reports)
        )

    def build(self, ctx: DashboardContext) -> dict:
        events: list[dict] = []
        for d in ctx.datasets:
            events.append(
                {
                    "kind": "upload",
                    "text": f"Uploaded {d.original_filename}",
                    "ts": _ts(d.created_at),
                }
            )
        for q in ctx.sql_history:
            events.append(
                {
                    "kind": "sql",
                    "text": f"Ran SQL: {q.business_question}",
                    "ts": _ts(q.executed_at),
                }
            )
        for r in ctx.reports:
            events.append(
                {
                    "kind": "report",
                    "text": f"Updated report “{r.title}”",
                    "ts": _ts(r.updated_at),
                }
            )
        events.sort(key=lambda e: e["ts"], reverse=True)
        for e in events:
            e.pop("ts", None)
        return {"activities": events[:12]}
