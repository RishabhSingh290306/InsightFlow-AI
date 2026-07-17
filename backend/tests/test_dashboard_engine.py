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
