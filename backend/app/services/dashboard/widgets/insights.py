"""AI insights widget — the dataset-understanding interpretation (dataset scope)."""
from __future__ import annotations

from app.services.dashboard.widgets.base import DashboardWidget
from app.services.dashboard.widgets.context import DashboardContext


class AiInsightsWidget(DashboardWidget):
    type = "ai_insights"
    title = "AI Insights"
    description = "What the AI understood about this dataset: domain, use case, observations."
    applies_to_scopes = ["dataset"]

    def availability(self, ctx: DashboardContext) -> bool:
        return ctx.dataset is not None and ctx.dataset.id in ctx.understandings

    def build(self, ctx: DashboardContext) -> dict:
        u = ctx.understandings[ctx.dataset.id]
        return {
            "dataset_description": u.dataset_description,
            "domain": u.business_domain_guess,
            "use_case": u.likely_use_case,
            "target_column": u.possible_target_column,
            "observations": list(u.initial_business_observations),
            "suggested_questions": list(u.suggested_business_questions),
            "ai_available": u.ai_available,
        }
