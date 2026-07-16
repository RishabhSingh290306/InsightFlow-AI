"""Operation registry — the single lookup point for cleaning operations.

Each operation is registered by its stable `name`. The engine, preview, apply,
and the UI discover operations exclusively through this module, so adding a new
operation is just one new module + one line in `_OPERATIONS`.
"""
from __future__ import annotations

from app.services.cleaning.base import CleaningOp
from app.services.cleaning.operations.columns import DropColumns, RenameColumns
from app.services.cleaning.operations.convert_types import ConvertTypes
from app.services.cleaning.operations.duplicates import RemoveDuplicates
from app.services.cleaning.operations.missing_values import HandleMissingValues

# Ordered list of operation classes registered in the catalog.
_OPERATIONS: list[type[CleaningOp]] = [
    HandleMissingValues,
    RemoveDuplicates,
    ConvertTypes,
    RenameColumns,
    DropColumns,
]

_REGISTRY: dict[str, CleaningOp] = {cls().name: cls() for cls in _OPERATIONS}


def get_operation(name: str) -> CleaningOp:
    """Return the registered operation instance for `name`."""
    op = _REGISTRY.get(name)
    if op is None:
        raise KeyError(f"Unknown cleaning operation '{name}'.")
    return op


def all_operations() -> list[CleaningOp]:
    """Return all registered operation instances, in catalog order."""
    return [_REGISTRY[cls().name] for cls in _OPERATIONS]


def catalog() -> list[dict]:
    """Return `describe()` for every operation (for the UI / AI prompt)."""
    return [op.describe() for op in all_operations()]
