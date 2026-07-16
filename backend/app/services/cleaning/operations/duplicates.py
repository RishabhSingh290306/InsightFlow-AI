"""Operation: remove duplicate rows."""
from __future__ import annotations

import time

import pandas as pd

from app.schemas.cleaning import OperationImpact
from app.services.cleaning.base import CleaningOp, _sample_records

_KEEP = {"first", "last"}


class RemoveDuplicates(CleaningOp):
    name = "remove_duplicates"
    label = "Remove Duplicates"
    category = "duplicates"

    def describe(self) -> dict:
        return {
            "name": self.name,
            "label": self.label,
            "category": self.category,
            "summary": "Drop duplicate rows, optionally restricted to a subset of columns.",
            "param_schema": {
                "subset": {
                    "type": "list[str] | null",
                    "description": "Columns to consider for duplication. Null = all columns.",
                },
                "keep": {
                    "type": "enum",
                    "enum": sorted(_KEEP),
                    "default": "first",
                    "description": "Which duplicate to keep.",
                },
            },
        }

    def _subset(self, df: pd.DataFrame, params: dict) -> list[str] | None:
        subset = params.get("subset")
        if not subset:
            return None
        cols = [str(c) for c in subset]
        return cols

    def validate(self, df: pd.DataFrame, params: dict) -> list[str]:
        warnings: list[str] = []
        keep = params.get("keep", "first")
        if keep not in _KEEP:
            raise ValueError(f"Unknown keep '{keep}'. Expected one of {sorted(_KEEP)}.")
        subset = self._subset(df, params)
        if subset:
            missing = [c for c in subset if c not in df.columns]
            if missing:
                raise ValueError(f"Column(s) not found: {missing}")
        if int(df.duplicated(subset=subset, keep=keep).sum()) == 0:
            warnings.append("No duplicate rows detected; nothing to do.")
        return warnings

    def _apply(self, df: pd.DataFrame, params: dict) -> tuple[pd.DataFrame, dict]:
        subset = self._subset(df, params)
        keep = params.get("keep", "first")
        rows_affected = int(df.duplicated(subset=subset, keep=keep).sum())
        new = df.drop_duplicates(subset=subset, keep=keep)
        return new, {"op": self.name, "params": params, "rows_affected": rows_affected, "cols_affected": 0}

    def preview(self, df: pd.DataFrame, params: dict) -> OperationImpact:
        self.validate(df, params)
        subset = self._subset(df, params)
        keep = params.get("keep", "first")
        t0 = time.perf_counter()
        rows_affected = int(df.duplicated(subset=subset, keep=keep).sum())
        after_df, _ = self._apply(df, params)
        execution_time_ms = (time.perf_counter() - t0) * 1000
        return OperationImpact(
            rows_affected=rows_affected,
            cols_affected=0,
            estimated_changes=rows_affected,
            execution_time_ms=round(execution_time_ms, 3),
            preview_before=_sample_records(df),
            preview_after=_sample_records(after_df),
        )

    def execute(self, df: pd.DataFrame, params: dict) -> tuple[pd.DataFrame, dict]:
        self.validate(df, params)
        return self._apply(df, params)
