"""Deterministic cleaning engine: plugin registry + preview/apply.

Public surface:
- `catalog()`, `get_operation()`, `all_operations()` — discover operations.
- `load_dataframe()` — read a stored dataset into a pandas DataFrame.
- `run_preview()` — dry-run a plan, returning a `CleaningPlan` (no persistence).
- `apply()` — execute approved operations, returning `(new_df, applied_records)`.
"""
from app.services.cleaning.engine import apply, load_dataframe, run_preview
from app.services.cleaning.planner import propose_plan
from app.services.cleaning.registry import (
    all_operations,
    catalog,
    get_operation,
)

__all__ = [
    "apply",
    "load_dataframe",
    "run_preview",
    "propose_plan",
    "all_operations",
    "catalog",
    "get_operation",
]
