"""Deterministic cleaning engine.

`run_preview` dry-runs a plan and returns a `CleaningPlan` without persisting
anything. `apply` executes the **approved** operations sequentially through the
same registry `preview` uses, so the two can never diverge, and returns the new
dataframe plus the executed records.

Every operation execution is wrapped with lightweight metadata — `operation_id`
(UUID), `duration_ms`, `status`, `timestamp` — recorded on the impact (preview)
and the applied record (apply). This powers future logging, analytics, workflow
history, and debugging without changing the operation architecture.
"""
from __future__ import annotations

import io
import time
import uuid

import pandas as pd

from app.core.storage import StorageAdapter
from app.schemas.cleaning import (
    CleaningOperation,
    CleaningPlan,
    OperationImpact,
    PlanSummary,
    ProposedOperation,
    _utcnow_iso,
)
from app.services.cleaning.registry import get_operation


def load_dataframe(storage: StorageAdapter, storage_path: str, file_format: str) -> pd.DataFrame:
    """Read a stored dataset file into a pandas DataFrame (CSV or Excel)."""
    content = storage.read(storage_path)
    if file_format == "csv":
        return pd.read_csv(io.BytesIO(content))
    return pd.read_excel(io.BytesIO(content))


def _wrap_impact(impact: OperationImpact, op_id: str, duration_ms: float) -> OperationImpact:
    impact.operation_id = op_id
    impact.duration_ms = round(duration_ms, 3)
    impact.status = "success"
    impact.timestamp = _utcnow_iso()
    return impact


def run_preview(df: pd.DataFrame, operations: list[CleaningOperation]) -> CleaningPlan:
    """Dry-run `operations` on a copy of `df`; return a `CleaningPlan`.

    Deterministic and side-effect free: the input dataframe is never mutated and
    nothing is persisted. Raises `ValueError`/`KeyError` for unknown or invalid
    operations (the route converts these to HTTP 422).
    """
    proposed: list[ProposedOperation] = []
    total_affected = 0
    total_time = 0.0
    total_changes = 0

    for op_req in operations:
        op = get_operation(op_req.op)  # KeyError -> route maps to 422
        op_id = str(uuid.uuid4())
        t0 = time.perf_counter()
        impact = op.preview(df, op_req.params)  # ValueError -> route maps to 422
        duration_ms = (time.perf_counter() - t0) * 1000
        _wrap_impact(impact, op_id, duration_ms)
        proposed.append(ProposedOperation(operation=op_req, impact=impact))
        total_affected += impact.rows_affected
        total_time += impact.duration_ms
        total_changes += impact.estimated_changes

    total_cells = max(int(df.shape[0] * df.shape[1]), 1)
    summary = PlanSummary(
        operation_count=len(operations),
        affected_rows=total_affected,
        estimated_time_ms=round(total_time, 3),
        estimated_improvement=round(100.0 * total_changes / total_cells, 2),
        overall_quality=None,  # refined in M3 (needs before/after profile)
    )
    return CleaningPlan(operations=proposed, summary=summary, ai_available=False)


def apply(
    df: pd.DataFrame, operations: list[CleaningOperation]
) -> tuple[pd.DataFrame, list[dict]]:
    """Execute approved operations sequentially; return `(new_df, applied_records)`.

    Unapproved operations are recorded as `skipped` (reason `user_rejected`) and
    not executed. On any operation failure the exception propagates so the caller
    (M3 `apply` endpoint) can abort without persisting a partial version.
    """
    new_df = df.copy()
    applied: list[dict] = []

    for op_req in operations:
        op_id = str(uuid.uuid4())
        timestamp = _utcnow_iso()
        if not op_req.approved:
            applied.append(
                {
                    "op": op_req.op,
                    "params": op_req.params,
                    "status": "skipped",
                    "operation_id": op_id,
                    "duration_ms": 0.0,
                    "timestamp": timestamp,
                    "rows_affected": 0,
                    "cols_affected": 0,
                    "reason": "user_rejected",
                }
            )
            continue

        op = get_operation(op_req.op)
        t0 = time.perf_counter()
        new_df, record = op.execute(new_df, op_req.params)
        duration_ms = (time.perf_counter() - t0) * 1000
        record.update(
            {
                "operation_id": op_id,
                "duration_ms": round(duration_ms, 3),
                "status": "success",
                "timestamp": timestamp,
            }
        )
        applied.append(record)

    return new_df, applied
