from app.schemas.dashboard import (
    CatalogEntry,
    DashboardPreviewRequest,
    DashboardSpec,
    DashboardView,
    WidgetMeta,
)
from app.schemas.eda import ChartSpec, EdaResult
from app.schemas.understanding import DatasetProfile, DatasetUnderstanding
from app.services.dashboard.widgets.base import DashboardWidget
from app.services.dashboard.widgets.context import DashboardContext
from app.services.dashboard.widgets.kpi import KpiCardsWidget
from app.services.dashboard.widgets.quality import DataQualityWidget
from app.services.dashboard.widgets.charts import RecommendedChartsWidget
from app.services.dashboard.widgets.insights import AiInsightsWidget
from app.services.dashboard.widgets.sql import SqlWidget


# ---- Task 1: schemas -------------------------------------------------------

def test_dashboard_spec_defaults():
    spec = DashboardSpec(scope="dataset")
    assert spec.widget_order == []
    assert spec.hidden_widgets == []
    assert spec.ai_summary is None


def test_dashboard_view_requires_widgets_list():
    view = DashboardView(
        scope="dataset",
        spec=DashboardSpec(scope="dataset"),
        widgets=[CatalogEntry(widget=WidgetMeta(type="kpi", title="K", description="d", applies_to_scopes=["dataset"]), data={"x": 1})],
        ai_available=True,
    )
    assert view.widgets[0].widget.type == "kpi"


def test_preview_request_dataset_scope():
    req = DashboardPreviewRequest(scope="dataset", dataset_id=5)
    assert req.dataset_id == 5


# ---- Task 2: base / context / registry -------------------------------------

def test_registry_returns_instances():
    from app.services.dashboard.widgets.registry import all_widgets, get_widget

    ws = all_widgets()
    assert len(ws) >= 5
    assert get_widget("kpi_cards") is not None
    assert get_widget("does_not_exist") is None


def test_context_dataclass_defaults():
    ctx = DashboardContext(scope="dataset")
    assert ctx.scope == "dataset"
    assert ctx.profiles == {}
    assert ctx.sql_history == []


# ---- Task 3: build_catalog ------------------------------------------------

from app.services.dashboard.widgets.catalog import build_catalog


def _ctx_with_profile() -> DashboardContext:
    profile = DatasetProfile(
        file_name="t.csv", file_size=10, row_count=100, column_count=3,
        column_names=["a", "b", "c"], inferred_types={"a": "numeric", "b": "categorical", "c": "numeric"},
        numeric_columns=["a", "c"], categorical_columns=["b"], date_columns=[],
        missing_values={"a": 0, "b": 0, "c": 0}, duplicate_row_count=2, null_percentage=0.0,
        unique_values={"a": 10, "b": 3, "c": 10}, basic_statistics={},
        data_quality_issues=["2 duplicate rows"], preview=[],
    )
    ds = type("DS", (), {"id": 1, "original_filename": "t.csv"})()
    ctx = DashboardContext(scope="dataset", dataset=ds, profiles={1: profile})
    return ctx


def test_build_catalog_includes_applicable_widgets():
    ctx = _ctx_with_profile()
    entries = build_catalog(ctx)
    types = [e.widget.type for e in entries]
    assert "kpi_cards" in types
    assert "data_quality" in types  # has quality issues


def test_build_catalog_skips_unavailable_widgets():
    # No EDA/understanding/sql -> recommended_charts, ai_insights, sql_widget absent
    ctx = _ctx_with_profile()
    types = [e.widget.type for e in build_catalog(ctx)]
    assert "recommended_charts" not in types
    assert "ai_insights" not in types
    assert "sql_widget" not in types


def test_build_catalog_skips_failing_widget_silently():
    ctx = _ctx_with_profile()

    class BoomWidget(DashboardWidget):
        type = "boom"; title = "Boom"; description = "x"; applies_to_scopes = ["dataset"]
        def availability(self, ctx): return True
        def build(self, ctx): raise RuntimeError("boom")

    import app.services.dashboard.widgets.registry as reg
    reg.REGISTRY.insert(0, BoomWidget())
    entries = build_catalog(ctx)
    assert "boom" not in [e.widget.type for e in entries]
    reg.REGISTRY.pop(0)


# ---- Task 4: kpi_cards ----------------------------------------------------

def test_kpi_cards_build():
    ctx = _ctx_with_profile()
    w = KpiCardsWidget()
    assert w.type == "kpi_cards"
    assert w.applies_to_scopes == ["dataset"]
    assert w.availability(ctx) is True
    data = w.build(ctx)
    labels = {k["label"] for k in data["kpis"]}
    assert {"Rows", "Columns", "Null %", "Duplicate rows", "Quality score"} <= labels
    row_kpi = next(k for k in data["kpis"] if k["label"] == "Rows")
    assert row_kpi["value"] == 100


def test_kpi_cards_unavailable_without_profile():
    ds = type("DS", (), {"id": 1})()
    ctx = DashboardContext(scope="dataset", dataset=ds, profiles={})
    assert KpiCardsWidget().availability(ctx) is False


# ---- Task 5: data_quality -------------------------------------------------

def test_data_quality_build():
    ctx = _ctx_with_profile()
    w = DataQualityWidget()
    assert w.type == "data_quality"
    data = w.build(ctx)
    assert "2 duplicate rows" in data["issues"]
    assert data["duplicate_row_count"] == 2


def test_data_quality_absent_when_clean():
    clean = DatasetProfile(
        file_name="c.csv", file_size=1, row_count=10, column_count=1, column_names=["a"],
        inferred_types={"a": "numeric"}, numeric_columns=["a"], categorical_columns=[], date_columns=[],
        missing_values={"a": 0}, duplicate_row_count=0, null_percentage=0.0,
        unique_values={"a": 10}, basic_statistics={}, data_quality_issues=[], preview=[],
    )
    ctx = DashboardContext(scope="dataset", dataset=type("DS", (), {"id": 2})(), profiles={2: clean})
    assert DataQualityWidget().availability(ctx) is False


# ---- Task 6: recommended_charts ------------------------------------------

def _eda_ctx() -> DashboardContext:
    charts = [
        ChartSpec(id="h1", chart_type="histogram", title="A", business_question="?", explanation="", recommended_reason="", confidence=0.9, accepted=True),
        ChartSpec(id="b1", chart_type="bar", title="B", business_question="?", explanation="", recommended_reason="", confidence=0.4, accepted=False),
    ]
    eda = EdaResult(ai_available=True, charts=charts)
    ctx = DashboardContext(scope="dataset", dataset=type("DS", (), {"id": 3})(), eda_results={3: eda})
    return ctx


def test_recommended_charts_prefers_accepted():
    ctx = _eda_ctx()
    w = RecommendedChartsWidget()
    assert w.availability(ctx) is True
    data = w.build(ctx)
    ids = [c["id"] for c in data["charts"]]
    assert ids == ["h1"]  # only the accepted chart


def test_recommended_charts_falls_back_to_all_when_none_accepted():
    ctx = _eda_ctx()
    ctx.eda_results[3].charts[0].accepted = False
    data = RecommendedChartsWidget().build(ctx)
    assert {c["id"] for c in data["charts"]} == {"h1", "b1"}


# ---- Task 7: ai_insights --------------------------------------------------

def test_ai_insights_build():
    u = DatasetUnderstanding(
        dataset_description="Sales data", business_domain_guess="Retail",
        likely_use_case="Forecasting", possible_target_column="sales",
        data_quality_summary="Clean", cleaning_recommendations=["drop nulls"],
        suggested_visualizations=["histogram"], suggested_business_questions=["trend?"],
        initial_business_observations=["seasonal"], confidence_score=0.8,
    )
    ctx = DashboardContext(scope="dataset", dataset=type("DS", (), {"id": 4})(), understandings={4: u})
    w = AiInsightsWidget()
    assert w.availability(ctx) is True
    data = w.build(ctx)
    assert data["dataset_description"] == "Sales data"
    assert "Retail" in data["domain"]
    assert "seasonal" in data["observations"]
    assert data["ai_available"] is True


# ---- Task 8: sql_widget --------------------------------------------------

def test_sql_widget_build():
    q = type("Q", (), {
        "id": 9, "business_question": "top region?", "sql": "SELECT 1",
        "explanation": "x", "suggested_visualization": {"chart_type": "bar"},
        "executed_at": "2026-07-17T00:00:00+00:00",
    })()
    ctx = DashboardContext(scope="dataset", dataset=type("DS", (), {"id": 5})(), sql_history=[q])
    w = SqlWidget()
    assert w.availability(ctx) is True
    data = w.build(ctx)
    assert data["queries"][0]["business_question"] == "top region?"
    assert data["queries"][0]["suggested_visualization"]["chart_type"] == "bar"


# ---- M2: project-scope widgets -------------------------------------------


def _project_ctx() -> DashboardContext:
    """A project context with two datasets: one profiled+understood+eda, one raw."""
    from datetime import datetime, timezone

    profile = DatasetProfile(
        file_name="a.csv", file_size=10, row_count=100, column_count=3,
        column_names=["a", "b", "c"], inferred_types={"a": "numeric", "b": "categorical", "c": "numeric"},
        numeric_columns=["a", "c"], categorical_columns=["b"], date_columns=[],
        missing_values={"a": 0, "b": 0, "c": 0}, duplicate_row_count=0, null_percentage=0.0,
        unique_values={"a": 10, "b": 3, "c": 10}, basic_statistics={},
        data_quality_issues=[], preview=[],
    )
    understanding = DatasetUnderstanding(
        dataset_description="Sales", business_domain_guess="Retail",
        likely_use_case="Forecast", possible_target_column="sales",
        data_quality_summary="Clean", cleaning_recommendations=[],
        suggested_visualizations=[], suggested_business_questions=["trend over time?"],
        initial_business_observations=["seasonal"], confidence_score=0.8,
    )
    eda = EdaResult(ai_available=True, charts=[
        ChartSpec(id="h1", chart_type="histogram", title="A", business_question="?", explanation="", recommended_reason="", confidence=0.9, accepted=True),
    ])
    d_profiled = type("DS", (), {
        "id": 1, "original_filename": "a.csv", "status": "understood", "version": 1,
        "row_count": 100, "column_count": 3, "created_at": datetime(2026, 1, 2, tzinfo=timezone.utc),
    })()
    d_raw = type("DS", (), {
        "id": 2, "original_filename": "b.csv", "status": "uploaded", "version": 1,
        "row_count": 50, "column_count": 2, "created_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
    })()
    q = type("Q", (), {
        "id": 7, "dataset_id": 2, "business_question": "top region?", "sql": "SELECT 1",
        "executed_at": datetime(2026, 1, 3, tzinfo=timezone.utc),
    })()
    r = type("R", (), {
        "id": 4, "title": "Q1 report", "scope": "project", "dataset_id": None,
        "sections": [{}, {}], "ai_available": True,
        "updated_at": datetime(2026, 1, 4, tzinfo=timezone.utc),
    })()
    return DashboardContext(
        scope="project",
        datasets=[d_profiled, d_raw],
        profiles={1: profile},
        understandings={1: understanding},
        eda_results={1: eda},
        sql_history=[q],
        reports=[r],
        lineage={},
    )


def test_project_kpis_build():
    from app.services.dashboard.widgets.kpi import ProjectKpisWidget

    ctx = _project_ctx()
    w = ProjectKpisWidget()
    assert w.applies_to_scopes == ["project"]
    assert w.availability(ctx) is True
    data = w.build(ctx)
    by_label = {k["label"]: k["value"] for k in data["kpis"]}
    assert by_label["Datasets"] == 2
    assert by_label["Analyzed"] == 1
    assert by_label["With EDA"] == 1
    assert by_label["Total rows"] == 150


def test_dataset_summaries_build():
    from app.services.dashboard.widgets.summaries import DatasetSummariesWidget

    ctx = _project_ctx()
    w = DatasetSummariesWidget()
    assert w.availability(ctx) is True
    data = w.build(ctx)
    ids = [d["id"] for d in data["datasets"]]
    assert ids == [1, 2]  # sorted by created_at desc (a.csv newer than b.csv)
    raw = next(d for d in data["datasets"] if d["id"] == 2)
    assert raw["has_profile"] is False
    profiled = next(d for d in data["datasets"] if d["id"] == 1)
    assert profiled["has_eda"] is True


def test_recent_reports_build():
    from app.services.dashboard.widgets.reports import RecentReportsWidget

    ctx = _project_ctx()
    w = RecentReportsWidget()
    assert w.availability(ctx) is True
    data = w.build(ctx)
    assert data["reports"][0]["id"] == 4
    assert data["reports"][0]["section_count"] == 2


def test_activity_feed_build():
    from app.services.dashboard.widgets.activity import ActivityFeedWidget

    ctx = _project_ctx()
    w = ActivityFeedWidget()
    assert w.availability(ctx) is True
    data = w.build(ctx)
    kinds = {a["kind"] for a in data["activities"]}
    assert {"upload", "sql", "report"} <= kinds
    assert len(data["activities"]) <= 12


def test_version_timeline_build():
    from app.services.dashboard.widgets.cleaning import VersionTimelineWidget
    from datetime import datetime, timezone

    d_current = type("DS", (), {"id": 3, "original_filename": "a.csv"})()
    chain = [
        type("DS", (), {"id": 1, "version": 1, "origin": "upload", "status": "understood",
                        "row_count": 100, "created_at": datetime(2026, 1, 1, tzinfo=timezone.utc)})(),
        type("DS", (), {"id": 3, "version": 2, "origin": "cleaning", "status": "cleaned",
                        "row_count": 99, "created_at": datetime(2026, 1, 2, tzinfo=timezone.utc)})(),
    ]
    ctx = DashboardContext(scope="dataset", dataset=d_current, lineage={3: chain})
    w = VersionTimelineWidget()
    assert w.availability(ctx) is True
    data = w.build(ctx)
    assert [v["version"] for v in data["versions"]] == [1, 2]
    current = next(v for v in data["versions"] if v["is_current"])
    assert current["origin"] == "cleaning"


def test_recommended_next_build_project():
    from app.services.dashboard.widgets.next import RecommendedNextWidget

    ctx = _project_ctx()
    w = RecommendedNextWidget()
    assert w.applies_to_scopes == ["dataset", "project"]
    assert w.availability(ctx) is True
    data = w.build(ctx)
    texts = [s["text"] for s in data["suggestions"]]
    # understanding-implied question for dataset 1
    assert any("trend over time?" in t for t in texts)
    # gap heuristic: dataset 2 (b.csv) is unprofiled
    assert any("Run Analyze on b.csv" in t for t in texts)
    # gap heuristic: dataset 1 has profile + eda but no SQL of its own
    assert any("Ask a question with SQL" in t for t in texts)


def test_recommended_next_build_dataset():
    from app.services.dashboard.widgets.next import RecommendedNextWidget

    u = DatasetUnderstanding(
        dataset_description="Sales", business_domain_guess="Retail",
        likely_use_case="Forecast", possible_target_column="sales",
        data_quality_summary="Clean", cleaning_recommendations=[],
        suggested_visualizations=[], suggested_business_questions=["correlate X and Y?"],
        initial_business_observations=["seasonal"], confidence_score=0.8,
    )
    ds = type("DS", (), {"id": 4, "original_filename": "a.csv"})()
    ctx = DashboardContext(scope="dataset", dataset=ds, datasets=[ds], understandings={4: u})
    data = RecommendedNextWidget().build(ctx)
    assert any("correlate X and Y?" in s["text"] for s in data["suggestions"])


def test_build_catalog_project_scope_returns_only_project_widgets():
    ctx = _project_ctx()
    types = [e.widget.type for e in build_catalog(ctx)]
    # project widgets present
    assert "project_kpis" in types
    assert "dataset_summaries" in types
    assert "recent_reports" in types
    assert "activity_feed" in types
    assert "recommended_next" in types
    # dataset-only widgets absent
    assert "kpi_cards" not in types
    assert "data_quality" not in types
    assert "recommended_charts" not in types
    assert "sql_widget" not in types
    assert "version_timeline" not in types  # dataset scope only
