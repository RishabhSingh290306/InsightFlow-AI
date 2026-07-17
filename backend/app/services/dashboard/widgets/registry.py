"""Widget registry. Add a new widget by importing it into this module's
`REGISTRY` list — no engine change required (spec §7).
"""
from __future__ import annotations

from app.services.dashboard.widgets.activity import ActivityFeedWidget
from app.services.dashboard.widgets.base import DashboardWidget
from app.services.dashboard.widgets.charts import RecommendedChartsWidget
from app.services.dashboard.widgets.cleaning import VersionTimelineWidget
from app.services.dashboard.widgets.insights import AiInsightsWidget
from app.services.dashboard.widgets.kpi import KpiCardsWidget, ProjectKpisWidget
from app.services.dashboard.widgets.next import RecommendedNextWidget
from app.services.dashboard.widgets.quality import DataQualityWidget
from app.services.dashboard.widgets.reports import RecentReportsWidget
from app.services.dashboard.widgets.sql import SqlWidget
from app.services.dashboard.widgets.summaries import DatasetSummariesWidget

# Registration order is the deterministic fallback order (no AI).
REGISTRY: list[DashboardWidget] = [
    KpiCardsWidget(),  # dataset
    DataQualityWidget(),  # dataset
    RecommendedChartsWidget(),  # dataset
    AiInsightsWidget(),  # dataset
    SqlWidget(),  # dataset
    VersionTimelineWidget(),  # dataset
    ProjectKpisWidget(),  # project
    DatasetSummariesWidget(),  # project
    RecentReportsWidget(),  # project
    ActivityFeedWidget(),  # project
    RecommendedNextWidget(),  # both
]


def all_widgets() -> list[DashboardWidget]:
    return list(REGISTRY)


def get_widget(widget_type: str) -> DashboardWidget | None:
    for w in REGISTRY:
        if w.type == widget_type:
            return w
    return None
