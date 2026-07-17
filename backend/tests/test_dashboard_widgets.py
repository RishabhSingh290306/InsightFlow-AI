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
