"""Operations: rename columns and drop columns."""
from __future__ import annotations

import time

import pandas as pd

from app.schemas.cleaning import OperationImpact
from app.services.cleaning.base import CleaningOp, _sample_records


class RenameColumns(CleaningOp):
    name = "rename_columns"
    label = "Rename Columns"
    category = "columns"

    def describe(self) -> dict:
        return {
            "name": self.name,
            "label": self.label,
            "category": self.category,
            "summary": "Rename columns using an {old: new} mapping.",
            "param_schema": {
                "mapping": {
                    "type": "object",
                    "description": "Map of existing column name -> new column name.",
                },
            },
        }

    def validate(self, df: pd.DataFrame, params: dict) -> list[str]:
        warnings: list[str] = []
        mapping = params.get("mapping") or {}
        if not isinstance(mapping, dict) or not mapping:
            raise ValueError("'mapping' must be a non-empty {old: new} dict.")
        missing = [c for c in mapping if c not in df.columns]
        if missing:
            raise ValueError(f"Column(s) not found: {missing}")
        return warnings

    def _apply(self, df: pd.DataFrame, params: dict) -> tuple[pd.DataFrame, dict]:
        mapping = params["mapping"]
        new = df.rename(columns=mapping)
        return new, {"op": self.name, "params": params, "rows_affected": 0, "cols_affected": len(mapping)}

    def preview(self, df: pd.DataFrame, params: dict) -> OperationImpact:
        self.validate(df, params)
        t0 = time.perf_counter()
        cols_affected = len(params.get("mapping") or {})
        after_df, _ = self._apply(df, params)
        execution_time_ms = (time.perf_counter() - t0) * 1000
        return OperationImpact(
            rows_affected=0,
            cols_affected=cols_affected,
            estimated_changes=cols_affected,
            execution_time_ms=round(execution_time_ms, 3),
            preview_before=_sample_records(df),
            preview_after=_sample_records(after_df),
        )

    def execute(self, df: pd.DataFrame, params: dict) -> tuple[pd.DataFrame, dict]:
        self.validate(df, params)
        return self._apply(df, params)


class DropColumns(CleaningOp):
    name = "drop_columns"
    label = "Drop Columns"
    category = "columns"

    def describe(self) -> dict:
        return {
            "name": self.name,
            "label": self.label,
            "category": self.category,
            "summary": "Drop one or more columns from the dataset.",
            "param_schema": {
                "columns": {"type": "list[str]", "description": "Columns to drop."},
            },
        }

    def validate(self, df: pd.DataFrame, params: dict) -> list[str]:
        warnings: list[str] = []
        columns = params.get("columns") or []
        if not columns:
            raise ValueError("'columns' must list at least one column.")
        missing = [c for c in columns if c not in df.columns]
        if missing:
            raise ValueError(f"Column(s) not found: {missing}")
        return warnings

    def _apply(self, df: pd.DataFrame, params: dict) -> tuple[pd.DataFrame, dict]:
        columns = [str(c) for c in params["columns"]]
        new = df.drop(columns=columns)
        return new, {"op": self.name, "params": params, "rows_affected": 0, "cols_affected": len(columns)}

    def preview(self, df: pd.DataFrame, params: dict) -> OperationImpact:
        self.validate(df, params)
        t0 = time.perf_counter()
        cols_affected = len(params.get("columns") or [])
        after_df, _ = self._apply(df, params)
        execution_time_ms = (time.perf_counter() - t0) * 1000
        return OperationImpact(
            rows_affected=0,
            cols_affected=cols_affected,
            estimated_changes=int(df.shape[0] * cols_affected),
            execution_time_ms=round(execution_time_ms, 3),
            preview_before=_sample_records(df),
            preview_after=_sample_records(after_df),
        )

    def execute(self, df: pd.DataFrame, params: dict) -> tuple[pd.DataFrame, dict]:
        self.validate(df, params)
        return self._apply(df, params)
