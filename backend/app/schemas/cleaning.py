"""Schemas for the deterministic cleaning workflow.

These are the wire contracts for the cleaning endpoints. `params` is a single
free-form bag per operation (matching the recipe shape stored on derived
`Dataset` rows), e.g. ``{"strategy": "median", "columns": ["age"]}``.

Every execution carries lightweight metadata (`operation_id`, `duration_ms`,
`status`, `timestamp`) so future logging, analytics, workflow history, and
debugging can trace each operation without changing the engine architecture.
"""
from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class CleaningOperation(BaseModel):
    """A single requested operation within a cleaning plan."""

    model_config = ConfigDict(extra="ignore")

    op: str  # registry key, e.g. "handle_missing_values"
    params: dict = {}
    explanation: str | None = None
    confidence: float = 1.0
    approved: bool = True  # preview ignores this; apply executes only approved ops


class OperationImpact(BaseModel):
    """Deterministic dry-run impact of one operation on a copy of the dataframe."""

    rows_affected: int = 0
    cols_affected: int = 0
    estimated_changes: int = 0
    warnings: list[str] = []
    execution_time_ms: float = 0.0
    confidence: float = 1.0
    preview_before: list[dict] | None = None
    preview_after: list[dict] | None = None
    # Lightweight execution metadata (assigned by the engine around each call).
    operation_id: str | None = None
    duration_ms: float = 0.0
    status: str = "success"
    timestamp: str = _utcnow_iso()


class ProposedOperation(BaseModel):
    """An operation paired with its computed preview impact."""

    operation: CleaningOperation
    impact: OperationImpact


class PlanSummary(BaseModel):
    """Aggregate summary of a whole cleaning plan."""

    overall_quality: float | None = None  # refined in M3 (needs before/after profile)
    estimated_improvement: float | None = None  # proxy: % of cells changed
    estimated_time_ms: float = 0.0
    operation_count: int = 0
    affected_rows: int = 0


class CleaningPlan(BaseModel):
    """The full preview result: per-operation impacts plus a summary."""

    operations: list[ProposedOperation] = []
    summary: PlanSummary = PlanSummary()
    ai_available: bool = False  # preview is deterministic; AI is M3's plan step


class PreviewRequest(BaseModel):
    operations: list[CleaningOperation]


class ApplyRequest(BaseModel):
    """Same shape as PreviewRequest; reused by the M3 apply endpoint."""

    operations: list[CleaningOperation]
