"""Base class for dashboard widgets (plugin pattern, mirrors cleaning CleaningOp).

Each widget is an independent module implementing `availability` (does it have
data for this scope?) and `build` (deterministic facts from stored artifacts
only — never raw data, never the LLM). The AI never sees `build`'s output; it
only sees `describe()` metadata.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from app.schemas.dashboard import WidgetMeta


class DashboardWidget(ABC):
    type: str = ""
    title: str = ""
    description: str = ""
    applies_to_scopes: list[str] = []

    @abstractmethod
    def availability(self, ctx: "DashboardContext") -> bool:
        """Deterministic: does this widget have data for the current scope?"""

    @abstractmethod
    def build(self, ctx: "DashboardContext") -> dict:
        """Deterministic: compute the widget's facts from stored artifacts only."""

    def describe(self) -> WidgetMeta:
        return WidgetMeta(
            type=self.type,
            title=self.title,
            description=self.description,
            applies_to_scopes=self.applies_to_scopes,
        )
