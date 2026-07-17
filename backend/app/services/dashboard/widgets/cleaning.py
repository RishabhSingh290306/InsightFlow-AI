"""Version timeline widget — the dataset's immutable version chain (dataset scope).

Mirrors the cleaning/versioning lineage: each transformation (cleaning, derived
versions) is an immutable child `Dataset` row linked by `root_id`. This widget
shows the chain in version order so the human can see how the current dataset
was produced.
"""
from __future__ import annotations

from app.services.dashboard.widgets.base import DashboardWidget
from app.services.dashboard.widgets.context import DashboardContext


class VersionTimelineWidget(DashboardWidget):
    type = "version_timeline"
    title = "Version Timeline"
    description = "The immutable version chain for this dataset, oldest upload first."
    applies_to_scopes = ["dataset"]

    def availability(self, ctx: DashboardContext) -> bool:
        if ctx.scope != "dataset" or ctx.dataset is None:
            return False
        chain = ctx.lineage.get(ctx.dataset.id, [])
        return len(chain) >= 1

    def build(self, ctx: DashboardContext) -> dict:
        chain = ctx.lineage.get(ctx.dataset.id, [])
        versions = [
            {
                "version": d.version,
                "origin": d.origin,
                "status": d.status,
                "row_count": d.row_count,
                "is_current": d.id == ctx.dataset.id,
                "created_at": d.created_at.isoformat() if hasattr(d.created_at, "isoformat") else d.created_at,
            }
            for d in chain
        ]
        return {"versions": versions}
