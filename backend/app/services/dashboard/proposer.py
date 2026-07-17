"""Best-effort AI curation of the deterministic widget catalog.

Sends catalog *metadata only* (widget types, titles, descriptions, scope) to
the LLM and asks it to select / order / group widgets and write the executive
summary, per-widget insights, and recommended next analyses. On ANY failure
(LLM unavailable, invalid JSON, validation error) it falls back to showing all
widgets in registration order with no AI summary — the dashboard always
renders. The AI never sees widget data and never invents widgets.
"""
from __future__ import annotations

import json

from pydantic import ValidationError

from app.schemas.dashboard import CatalogEntry, DashboardSpec
from app.services.dashboard.widgets.context import DashboardContext
from app.services.llm import complete_json

_SYSTEM = (
    "You are a senior data analyst curating a dashboard for a user. You are given "
    "a list of AVAILABLE dashboard widgets (metadata only, never their data). "
    "Decide which to surface, in what order, and how to group them. Also write a "
    "short executive summary, a per-widget 'why it matters' note, and 2-3 "
    "recommended next analyses. Respond JSON only: {\"widget_order\": [types...], "
    "\"groups\": [{\"title\": str, \"widget_types\": [types...]}], \"ai_summary\": "
    "{\"executive\": str, \"per_widget\": {type: str}, \"next_analyses\": [str]}}."
)


async def propose_dashboard(
    catalog: list[CatalogEntry], ctx: DashboardContext
) -> tuple[DashboardSpec, bool]:
    types = [e.widget.type for e in catalog]
    if not types:
        return _fallback_spec(catalog, ctx), False
    try:
        user_prompt = json.dumps(
            [e.widget.model_dump() for e in catalog], indent=2
        )
        data = await complete_json(_SYSTEM, user_prompt)
        raw_order = data.get("widget_order", []) if isinstance(data, dict) else []
        order = [t for t in raw_order if t in types]
        for t in types:  # ensure every available widget is represented
            if t not in order:
                order.append(t)
        groups = [
            g for g in (data.get("groups", []) or [])
            if isinstance(g, dict) and all(wt in types for wt in g.get("widget_types", []))
        ]
        summary = data.get("ai_summary") if isinstance(data, dict) else None
        return DashboardSpec(scope=ctx.scope, widget_order=order, groups=groups, ai_summary=summary), True
    except (Exception, ValidationError):
        return _fallback_spec(catalog, ctx), False


def _fallback_spec(catalog: list[CatalogEntry], ctx: DashboardContext) -> DashboardSpec:
    order = [e.widget.type for e in catalog]
    return DashboardSpec(scope=ctx.scope, widget_order=order, ai_summary=None)
