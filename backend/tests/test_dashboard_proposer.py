import asyncio

from app.schemas.dashboard import CatalogEntry, WidgetMeta
from app.services.dashboard.proposer import _fallback_spec, propose_dashboard
from app.services.dashboard.widgets.context import DashboardContext


def _catalog() -> list[CatalogEntry]:
    return [
        CatalogEntry(widget=WidgetMeta(type="kpi_cards", title="K", description="d", applies_to_scopes=["dataset"]), data={}),
        CatalogEntry(widget=WidgetMeta(type="data_quality", title="Q", description="d", applies_to_scopes=["dataset"]), data={}),
    ]


def test_fallback_spec_shows_all_widgets():
    ctx = DashboardContext(scope="dataset")
    spec = _fallback_spec(_catalog(), ctx)
    assert spec.scope == "dataset"
    assert set(spec.widget_order) == {"kpi_cards", "data_quality"}
    assert spec.ai_summary is None


def test_propose_falls_back_without_api_key(monkeypatch):
    # complete_json raises when OPENROUTER_API_KEY is unset; proposer must catch it.
    import app.services.dashboard.proposer as P

    def _boom(*a, **k):
        raise RuntimeError("no key")

    monkeypatch.setattr(P, "complete_json", _boom)
    ctx = DashboardContext(scope="dataset")
    spec, ok = asyncio.run(propose_dashboard(_catalog(), ctx))
    assert ok is False
    assert spec.ai_summary is None
    assert set(spec.widget_order) == {"kpi_cards", "data_quality"}


def test_propose_success_orders_and_groups(monkeypatch):
    import app.services.dashboard.proposer as P

    async def fake(system, user, model=None):
        return {
            "widget_order": ["data_quality", "kpi_cards"],
            "groups": [{"title": "Overview", "widget_types": ["kpi_cards", "data_quality"]}],
            "ai_summary": {"executive": "Looks clean.", "per_widget": {}, "next_analyses": ["Check correlations"]},
        }

    monkeypatch.setattr(P, "complete_json", fake)
    ctx = DashboardContext(scope="dataset")
    spec, ok = asyncio.run(propose_dashboard(_catalog(), ctx))
    assert ok is True
    assert spec.widget_order == ["data_quality", "kpi_cards"]
    assert spec.groups[0]["title"] == "Overview"
    assert spec.ai_summary["executive"] == "Looks clean."


def test_propose_drops_unknown_widget_types(monkeypatch):
    import app.services.dashboard.proposer as P

    async def fake(system, user, model=None):
        return {"widget_order": ["kpi_cards", "not_a_widget"], "ai_summary": {"executive": "x", "per_widget": {}, "next_analyses": []}}

    monkeypatch.setattr(P, "complete_json", fake)
    ctx = DashboardContext(scope="dataset")
    spec, ok = asyncio.run(propose_dashboard(_catalog(), ctx))
    assert "not_a_widget" not in spec.widget_order
    assert "kpi_cards" in spec.widget_order
