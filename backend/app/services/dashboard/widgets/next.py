"""Recommended next analyses widget — deterministic suggestions (both scopes).

Gathers next-step suggestions from stored artifact metadata (the dataset
understanding's suggested business questions) and from deterministic gaps
(unprofiled datasets, datasets without EDA, datasets without SQL questions).
The AI's freeform `ai_summary.next_analyses` is surfaced separately by the
renderer's executive banner; this widget is purely deterministic.
"""
from __future__ import annotations

from app.services.dashboard.widgets.base import DashboardWidget
from app.services.dashboard.widgets.context import DashboardContext


class RecommendedNextWidget(DashboardWidget):
    type = "recommended_next"
    title = "Recommended Next"
    description = "Suggested next analyses derived from each dataset's understanding and gaps."
    applies_to_scopes = ["dataset", "project"]

    def availability(self, ctx: DashboardContext) -> bool:
        return True  # always available; suggests at least one gap unless everything is done

    def build(self, ctx: DashboardContext) -> dict:
        suggestions: list[dict] = []
        seen: set[str] = set()

        def add(text: str, kind: str) -> None:
            if text in seen:
                return
            seen.add(text)
            suggestions.append({"text": text, "kind": kind})

        # Understanding-implied questions (per dataset that has one).
        for ds_id, u in ctx.understandings.items():
            name = self._name(ctx, ds_id)
            for q in getattr(u, "suggested_business_questions", []) or []:
                add(f"{name}: {q}" if name else q, "question")

        # Deterministic gap heuristics across the project's datasets.
        for d in ctx.datasets:
            name = d.original_filename
            if d.id not in ctx.profiles:
                add(f"Run Analyze on {name} to profile it.", "profile")
            elif d.id not in ctx.eda_results:
                add(f"Generate recommended charts for {name}.", "eda")
            if d.id in ctx.profiles and not any(
                q.dataset_id == d.id for q in ctx.sql_history
            ):
                add(f"Ask a question with SQL on {name}.", "sql")

        return {"suggestions": suggestions}

    @staticmethod
    def _name(ctx: DashboardContext, dataset_id: int) -> str:
        if ctx.scope == "dataset" and ctx.dataset is not None:
            return ctx.dataset.original_filename
        for d in ctx.datasets:
            if d.id == dataset_id:
                return d.original_filename
        return ""
