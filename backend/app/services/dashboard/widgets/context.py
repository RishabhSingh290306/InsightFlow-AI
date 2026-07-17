"""Resolved artifacts a dashboard reads. Built once per request by the engine.

Widgets read ONLY from these typed dicts (never raw files). `dataset`/`project`
are the ORM rows, kept for convenience metadata (filename / name).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class DashboardContext:
    scope: str  # "dataset" | "project"
    project: Any = None
    dataset: Any = None
    dataset_version_id: int | None = None
    profiles: dict[int, Any] = field(default_factory=dict)
    understandings: dict[int, Any] = field(default_factory=dict)
    eda_results: dict[int, Any] = field(default_factory=dict)
    sql_history: list[Any] = field(default_factory=list)
    reports: list[Any] = field(default_factory=list)
    lineage: dict[int, list[Any]] = field(default_factory=dict)
