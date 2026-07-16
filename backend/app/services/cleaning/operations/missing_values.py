"""Operation: handle missing values.

Strategies: drop_rows | drop_columns | mean | median | mode | constant.
`columns` selects the target columns; `fill_value` is required for `constant`.
"""
from __future__ import annotations

import time

import pandas as pd

from app.schemas.cleaning import OperationImpact
from app.services.cleaning.base import CleaningOp, _sample_records

_STRATEGIES = {"drop_rows", "drop_columns", "mean", "median", "mode", "constant"}


class HandleMissingValues(CleaningOp):
    name = "handle_missing_values"
    label = "Handle Missing Values"
    category = "missing"

    def describe(self) -> dict:
        return {
            "name": self.name,
            "label": self.label,
            "category": self.category,
            "summary": "Drop rows/columns with nulls or fill missing values with a statistic or constant.",
            "param_schema": {
                "strategy": {
                    "type": "enum",
                    "enum": sorted(_STRATEGIES),
                    "default": "median",
                    "description": "How to handle missing values.",
                },
                "columns": {
                    "type": "list[str]",
                    "description": "Target columns. Empty = all columns.",
                },
                "fill_value": {
                    "type": "any",
                    "required": False,
                    "description": "Value used when strategy='constant'.",
                },
            },
        }

    def _target_columns(self, df: pd.DataFrame, params: dict) -> list[str]:
        cols = params.get("columns") or list(df.columns)
        return [str(c) for c in cols]

    def validate(self, df: pd.DataFrame, params: dict) -> list[str]:
        warnings: list[str] = []
        strategy = params.get("strategy")
        if strategy not in _STRATEGIES:
            raise ValueError(f"Unknown strategy '{strategy}'. Expected one of {sorted(_STRATEGIES)}.")
        cols = self._target_columns(df, params)
        missing = [c for c in cols if c not in df.columns]
        if missing:
            raise ValueError(f"Column(s) not found: {missing}")
        if strategy == "constant" and "fill_value" not in params:
            raise ValueError("fill_value is required when strategy='constant'.")
        for c in cols:
            if strategy in ("mean", "median") and not pd.api.types.is_numeric_dtype(df[c]):
                raise ValueError(f"Column '{c}' is not numeric; cannot use '{strategy}'.")
            if int(df[c].isna().sum()) == 0:
                warnings.append(f"Column '{c}' has no missing values; nothing to do.")
        return warnings

    def _apply(self, df: pd.DataFrame, params: dict) -> tuple[pd.DataFrame, dict]:
        cols = self._target_columns(df, params)
        strategy = params["strategy"]
        new = df.copy()
        rows_affected = 0
        cols_affected = 0
        if strategy == "drop_rows":
            subset = cols if cols else None
            rows_affected = int(new[subset].isna().any(axis=1).sum()) if subset else int(new.isna().any(axis=1).sum())
            new = new.dropna(subset=subset)
        elif strategy == "drop_columns":
            cols_affected = len(cols)
            new = new.drop(columns=cols)
        else:
            cols_affected = len(cols)
            for c in cols:
                if strategy == "mean":
                    fill = new[c].mean()
                elif strategy == "median":
                    fill = new[c].median()
                elif strategy == "mode":
                    modes = new[c].mode()
                    fill = modes.iloc[0] if not modes.empty else None
                else:  # constant
                    fill = params["fill_value"]
                if fill is not None:
                    rows_affected += int(new[c].isna().sum())
                    new[c] = new[c].fillna(fill)
        return new, {"op": self.name, "params": params, "rows_affected": rows_affected, "cols_affected": cols_affected}

    def preview(self, df: pd.DataFrame, params: dict) -> OperationImpact:
        self.validate(df, params)
        cols = self._target_columns(df, params)
        strategy = params["strategy"]
        t0 = time.perf_counter()
        if strategy == "drop_rows":
            subset = cols if cols else None
            rows_affected = int(df[subset].isna().any(axis=1).sum()) if subset else int(df.isna().any(axis=1).sum())
            estimated_changes = rows_affected
            cols_affected = len(cols)
        elif strategy == "drop_columns":
            cols_affected = len(cols)
            estimated_changes = int(df.shape[0] * len(cols))
            rows_affected = 0
        else:
            cols_affected = len(cols)
            estimated_changes = int(sum(int(df[c].isna().sum()) for c in cols))
            rows_affected = 0
        after_df, _ = self._apply(df, params)
        execution_time_ms = (time.perf_counter() - t0) * 1000
        return OperationImpact(
            rows_affected=rows_affected,
            cols_affected=cols_affected,
            estimated_changes=estimated_changes,
            execution_time_ms=round(execution_time_ms, 3),
            preview_before=_sample_records(df),
            preview_after=_sample_records(after_df),
        )

    def execute(self, df: pd.DataFrame, params: dict) -> tuple[pd.DataFrame, dict]:
        self.validate(df, params)
        return self._apply(df, params)
