"""Deterministic catalog builder.

Runs every registered widget's `availability` + `build` for the current scope
and returns the candidate `CatalogEntry` list with real, already-computed data.
A widget whose `build` raises is skipped (logged) so the dashboard always
renders. Never calls the LLM.
"""
from __future__ import annotations

import logging

from app.schemas.dashboard import CatalogEntry
from app.services.dashboard.widgets.base import DashboardWidget
from app.services.dashboard.widgets.context import DashboardContext
from app.services.dashboard.widgets.registry import all_widgets

logger = logging.getLogger(__name__)


def build_catalog(ctx: DashboardContext) -> list[CatalogEntry]:
    entries: list[CatalogEntry] = []
    for w in all_widgets():
        if ctx.scope not in w.applies_to_scopes:
            continue
        try:
            if not w.availability(ctx):
                continue
            data = w.build(ctx)
        except Exception:  # noqa: BLE001 — a bad widget must not 5xx the dashboard
            logger.exception("Dashboard widget %s failed; skipping", w.type)
            continue
        entries.append(CatalogEntry(widget=w.describe(), data=data))
    return entries
