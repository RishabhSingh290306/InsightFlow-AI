from app.schemas.dashboard import CatalogEntry, DashboardSpec, WidgetMeta
from app.services.dashboard.engine import render
from app.services.dashboard.widgets.context import DashboardContext


def _ctx() -> DashboardContext:
    entries = [
        CatalogEntry(widget=WidgetMeta(type="kpi_cards", title="K", description="d", applies_to_scopes=["dataset"]), data={"kpis": []}),
        CatalogEntry(widget=WidgetMeta(type="data_quality", title="Q", description="d", applies_to_scopes=["dataset"]), data={"issues": []}),
    ]
    ctx = DashboardContext(scope="dataset")
    import app.services.dashboard.engine as E

    E.build_catalog = lambda c: entries  # type: ignore
    return ctx


def test_render_honors_widget_order_and_hidden():
    ctx = _ctx()
    spec = DashboardSpec(scope="dataset", widget_order=["data_quality", "kpi_cards"], hidden_widgets=["kpi_cards"])
    view = render(spec, ctx, ai_available=True)
    assert [w.widget.type for w in view.widgets] == ["data_quality"]
    assert view.ai_available is True


def test_render_empty_order_uses_catalog_order():
    ctx = _ctx()
    spec = DashboardSpec(scope="dataset", widget_order=[])
    view = render(spec, ctx, ai_available=False)
    assert [w.widget.type for w in view.widgets] == ["kpi_cards", "data_quality"]
    assert view.ai_available is False


def test_render_project_scope_with_order_and_hidden():
    entries = [
        CatalogEntry(widget=WidgetMeta(type="project_kpis", title="P", description="d", applies_to_scopes=["project"]), data={"kpis": []}),
        CatalogEntry(widget=WidgetMeta(type="dataset_summaries", title="S", description="d", applies_to_scopes=["project"]), data={"datasets": []}),
        CatalogEntry(widget=WidgetMeta(type="recent_reports", title="R", description="d", applies_to_scopes=["project"]), data={"reports": []}),
    ]
    ctx = DashboardContext(scope="project")
    import app.services.dashboard.engine as E

    E.build_catalog = lambda c: entries  # type: ignore
    spec = DashboardSpec(
        scope="project",
        widget_order=["recent_reports", "project_kpis", "dataset_summaries"],
        hidden_widgets=["project_kpis"],
    )
    view = render(spec, ctx, ai_available=True)
    assert view.scope == "project"
    assert [w.widget.type for w in view.widgets] == ["recent_reports", "dataset_summaries"]
