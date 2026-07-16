"""Operation: convert a column to a target type."""
from __future__ import annotations

import time

import pandas as pd

from app.schemas.cleaning import OperationImpact
from app.services.cleaning.base import CleaningOp, _sample_records

_TYPES = {"numeric", "datetime", "string", "category"}


class ConvertTypes(CleaningOp):
    name = "convert_types"
    label = "Convert Column Type"
    category = "types"

    def describe(self) -> dict:
        return {
            "name": self.name,
            "label": self.label,
            "category": self.category,
            "summary": "Cast a column to numeric, datetime, string, or category (unparseable -> null).",
            "param_schema": {
                "column": {"type": "str", "description": "Column to convert."},
                "to_type": {
                    "type": "enum",
                    "enum": sorted(_TYPES),
                    "default": "numeric",
                    "description": "Target type.",
                },
                "errors": {
                    "type": "enum",
                    "enum": ["coerce"],
                    "default": "coerce",
                    "description": "How to handle unparseable values.",
                },
            },
        }

    def validate(self, df: pd.DataFrame, params: dict) -> list[str]:
        warnings: list[str] = []
        column = params.get("column")
        if not column:
            raise ValueError("'column' is required.")
        if column not in df.columns:
            raise ValueError(f"Column '{column}' not found.")
        to_type = params.get("to_type")
        if to_type not in _TYPES:
            raise ValueError(f"Unknown to_type '{to_type}'. Expected one of {sorted(_TYPES)}.")
        return warnings

    def _convert(self, series: pd.Series, to_type: str) -> pd.Series:
        if to_type == "numeric":
            return pd.to_numeric(series, errors="coerce")
        if to_type == "datetime":
            return pd.to_datetime(series, errors="coerce")
        if to_type == "string":
            return series.astype("string")
        return series.astype("category")

    def _apply(self, df: pd.DataFrame, params: dict) -> tuple[pd.DataFrame, dict]:
        column = params["column"]
        to_type = params["to_type"]
        new = df.copy()
        new[column] = self._convert(new[column], to_type)
        rows_affected = int(new[column].notna().sum())
        return new, {"op": self.name, "params": params, "rows_affected": rows_affected, "cols_affected": 1}

    def preview(self, df: pd.DataFrame, params: dict) -> OperationImpact:
        self.validate(df, params)
        column = params["column"]
        t0 = time.perf_counter()
        rows_affected = int(df[column].notna().sum())
        after_df, _ = self._apply(df, params)
        execution_time_ms = (time.perf_counter() - t0) * 1000
        return OperationImpact(
            rows_affected=rows_affected,
            cols_affected=1,
            estimated_changes=rows_affected,
            execution_time_ms=round(execution_time_ms, 3),
            preview_before=_sample_records(df),
            preview_after=_sample_records(after_df),
        )

    def execute(self, df: pd.DataFrame, params: dict) -> tuple[pd.DataFrame, dict]:
        self.validate(df, params)
        return self._apply(df, params)
