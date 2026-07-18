"""AI cleaning planner (best-effort) with a deterministic fallback.

`propose_plan` asks the LLM to propose cleaning operations **constrained to the
registry catalog**, interpreting only the structured `DatasetProfile` (never raw
data). Every returned op is validated against the registry and the real columns;
invalid ops are dropped. On any LLM failure (missing key, API error, bad JSON,
validation), a rule-based plan is derived from the profile's quality signals and
`ai_available` is set `False` so the UI can show a clear "rule-based plan" message.

This module never touches data and never mutates anything — it only returns
`CleaningOperation` proposals for the engine to preview/execute.
"""
from __future__ import annotations

import json

from pydantic import ValidationError

from app.schemas.cleaning import CleaningOperation
from app.schemas.understanding import DatasetProfile, DatasetUnderstanding
from app.services.cleaning.registry import catalog, get_operation
from app.services.llm import complete_json

_SYSTEM = (
    "You are a senior data cleaning engineer. You are given STRUCTURED metadata "
    "about a dataset (never the raw data) and a CATALOG of cleaning operations you "
    "are allowed to use. Propose a sequence of operations that improves data "
    "quality (remove duplicates, fill or drop missing values, fix types, etc.). "
    "Return a JSON object with exactly one key 'operations', a list where each "
    "item has: 'op' (one of the catalog names), 'params' (matching that op's "
    "param_schema, referencing ONLY columns that exist), 'explanation' (short "
    "plain-English reason), and 'confidence' (number 0-1). Do not propose "
    "operations that are not in the catalog. Respond with JSON only."
)


def _user_prompt(profile: DatasetProfile, understanding: DatasetUnderstanding | None, cat: list[dict]) -> str:
    parts = [
        "Catalog of allowed operations (use only these 'op' names):",
        json.dumps(cat, indent=2),
        "",
        "Dataset profile (columns that exist are in 'column_names'):",
        json.dumps(profile.model_dump(mode="json", exclude={"preview"}), indent=2),
    ]
    if understanding is not None:
        parts += [
            "",
            "AI data understanding (for context only):",
            json.dumps(understanding.model_dump(mode="json"), indent=2),
        ]
    return "\n".join(parts)


def _validate_plan(raw_ops: list[dict], columns: list[str]) -> list[CleaningOperation]:
    """Keep only ops whose name is in the registry and whose columns exist."""
    valid: list[CleaningOperation] = []
    known = set(columns)
    for raw in raw_ops or []:
        if not isinstance(raw, dict):
            continue
        op_name = raw.get("op")
        if not op_name or not isinstance(op_name, str):
            continue
        if op_name not in {c["name"] for c in catalog()}:
            continue
        try:
            get_operation(op_name)  # ensure registered
        except KeyError:
            continue
        params = raw.get("params") or {}
        # Reject ops that reference unknown columns.
        referenced = []
        if isinstance(params.get("columns"), list):
            referenced += params["columns"]
        if isinstance(params.get("subset"), list):
            referenced += params["subset"]
        if isinstance(params.get("column"), str):
            referenced.append(params["column"])
        if isinstance(params.get("mapping"), dict):
            referenced += list(params["mapping"].keys())
        if any(str(c) not in known for c in referenced):
            continue
        valid.append(
            CleaningOperation(
                op=op_name,
                params=params,
                explanation=raw.get("explanation"),
                confidence=float(raw.get("confidence", 1.0)),
                approved=True,
            )
        )
    return valid


def _fallback_plan(profile: DatasetProfile) -> list[CleaningOperation]:
    """Deterministic rule-based plan from the profile's quality signals."""
    ops: list[CleaningOperation] = []
    if profile.duplicate_row_count and profile.duplicate_row_count > 0:
        ops.append(
            CleaningOperation(
                op="remove_duplicates",
                params={"keep": "first"},
                explanation=f"Remove {profile.duplicate_row_count} duplicate row(s).",
                confidence=0.9,
                approved=True,
            )
        )
    for col, n in (profile.missing_values or {}).items():
        if n and n > 0:
            inferred = (profile.inferred_types or {}).get(col)
            strategy = "median" if inferred == "numeric" else "mode"
            ops.append(
                CleaningOperation(
                    op="handle_missing_values",
                    params={"strategy": strategy, "columns": [col]},
                    explanation=f"Fill {n} missing value(s) in '{col}' with the {strategy}.",
                    confidence=0.8,
                    approved=True,
                )
            )
    return ops


async def propose_plan(
    profile: DatasetProfile, understanding: DatasetUnderstanding | None = None
) -> tuple[list[CleaningOperation], bool]:
    """Propose cleaning operations. Returns `(operations, ai_available)`."""
    cat = catalog()
    try:
        data = await complete_json(_SYSTEM, _user_prompt(profile, understanding, cat))
        ops_raw = data.get("operations", []) if isinstance(data, dict) else []
        operations = _validate_plan(ops_raw, profile.column_names)
        ai_available = True
    except (Exception, ValidationError):
        # Any LLM/validation failure -> deterministic rule-based plan.
        operations = _fallback_plan(profile)
        ai_available = False
    return operations, ai_available
