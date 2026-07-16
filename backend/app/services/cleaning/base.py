"""Cleaning operation plugin interface.

Every cleaning operation is an independent module implementing `CleaningOp`.
Adding a new operation (outliers, text normalization, encoding, feature
engineering, ...) is one new module + one registry entry; the engine, preview,
apply, and the UI pick it up automatically — no changes to the core.

Contract:
- `describe()`  — catalog entry for the UI / AI prompt (label, category,
  parameter schema, human-readable summary).
- `validate()`  — returns non-fatal warnings; raises `ValueError` on invalid
  params or columns.
- `preview()`   — dry-run on a COPY of `df`; computes impact + samples; never
  mutates the input.
- `execute()`   — applies the operation; returns `(new_df, applied_record)`.
- `rollback()`  — where applicable; default returns `None` (data-level rollback
  is "restore the parent version", since versions are immutable).
"""
from __future__ import annotations

import json
from abc import ABC, abstractmethod

import pandas as pd

from app.schemas.cleaning import OperationImpact


def _sample_records(df: pd.DataFrame, n: int = 3) -> list[dict]:
    """Return the first `n` rows as JSON-safe records (NaN/NaT -> null, dates -> ISO)."""
    return json.loads(df.head(n).to_json(orient="records", date_format="iso"))


class CleaningOp(ABC):
    # Stable registry key, e.g. "handle_missing_values".
    name: str
    # Human label, e.g. "Handle Missing Values".
    label: str
    # Grouping, e.g. "missing" | "duplicates" | "types" | "columns".
    category: str

    @abstractmethod
    def describe(self) -> dict:
        """Return a catalog entry: {name, label, category, summary, param_schema}."""
        raise NotImplementedError

    @abstractmethod
    def validate(self, df: pd.DataFrame, params: dict) -> list[str]:
        """Return non-fatal warnings; raise `ValueError` on invalid params/columns."""
        raise NotImplementedError

    @abstractmethod
    def preview(self, df: pd.DataFrame, params: dict) -> OperationImpact:
        """Dry-run on a COPY of `df`; never mutates the input."""
        raise NotImplementedError

    @abstractmethod
    def execute(self, df: pd.DataFrame, params: dict) -> tuple[pd.DataFrame, dict]:
        """Return `(new_df, applied_record)` where the record documents the change."""
        raise NotImplementedError

    def rollback(self, df: pd.DataFrame, record: dict) -> pd.DataFrame | None:
        """Restore `df` given an applied record. Default: None (restore parent version)."""
        return None
