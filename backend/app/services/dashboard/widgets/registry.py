"""Widget registry. Add a new widget by importing it into this module's
`REGISTRY` list — no engine change required (spec §7).
"""
from __future__ import annotations

from app.services.dashboard.widgets.base import DashboardWidget
from app.services.dashboard.widgets.charts import RecommendedChartsWidget
from app.services.dashboard.widgets.insights import AiInsightsWidget
from app.services.dashboard.widgets.kpi import KpiCardsWidget
from app.services.dashboard.widgets.quality import DataQualityWidget
from app.services.dashboard.widgets.sql import SqlWidget

REGISTRY: list[DashboardWidget] = [
    KpiCardsWidget(),
    DataQualityWidget(),
    RecommendedChartsWidget(),
    AiInsightsWidget(),
    SqlWidget(),
]


def all_widgets() -> list[DashboardWidget]:
    return list(REGISTRY)


def get_widget(widget_type: str) -> DashboardWidget | None:
    for w in REGISTRY:
        if w.type == widget_type:
            return w
    return None
