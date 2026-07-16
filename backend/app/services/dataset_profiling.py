"""Stage 1 — deterministic dataset profiling (pandas).

Reads the uploaded file via the storage adapter and computes structured facts.
This NEVER calls an LLM and must always succeed for a valid file. The resulting
`DatasetProfile` is the single source of truth for every downstream workflow.
"""
from __future__ import annotations

import io
import json

import pandas as pd

from app.core.storage import StorageAdapter
from app.schemas.understanding import DatasetProfile


def _infer_semantic_types(df: pd.DataFrame) -> dict[str, str]:
    types: dict[str, str] = {}
    for col in df.columns:
        series = df[col]
        if pd.api.types.is_bool_dtype(series):
            types[col] = "boolean"
        elif pd.api.types.is_datetime64_any_dtype(series):
            types[col] = "datetime"
        elif pd.api.types.is_numeric_dtype(series):
            types[col] = "numeric"
        else:
            nunique = int(series.nunique(dropna=True))
            # Low-cardinality non-numeric columns are categorical; else free text.
            types[col] = "categorical" if nunique <= max(50, int(0.5 * len(df))) else "text"
    return types


def _safe_float(value) -> float | None:
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return None if pd.isna(f) or f != f else f


def profile_dataset(
    storage: StorageAdapter,
    storage_path: str,
    original_filename: str,
    file_format: str,
) -> DatasetProfile:
    content = storage.read(storage_path)
    if file_format == "csv":
        df = pd.read_csv(io.BytesIO(content))
    else:  # xlsx / xls
        df = pd.read_excel(io.BytesIO(content))

    inferred = _infer_semantic_types(df)
    numeric = [c for c, t in inferred.items() if t == "numeric"]
    categorical = [c for c, t in inferred.items() if t in ("categorical", "text")]
    date_cols = [c for c, t in inferred.items() if t == "datetime"]

    missing = {str(c): int(df[c].isna().sum()) for c in df.columns}
    total_cells = max(int(df.shape[0] * df.shape[1]), 1)
    null_cells = sum(missing.values())
    null_pct = round(100.0 * null_cells / total_cells, 2)
    unique = {str(c): int(df[c].nunique(dropna=True)) for c in df.columns}

    basic_stats: dict[str, dict] = {}
    for c in numeric:
        s = df[c].describe()
        basic_stats[str(c)] = {
            "min": _safe_float(s.get("min")),
            "max": _safe_float(s.get("max")),
            "mean": _safe_float(s.get("mean")),
            "median": _safe_float(df[c].median()),
            "std": _safe_float(s.get("std")),
        }

    # Potential target: a categorical column with moderate cardinality, else the
    # last column. (Deterministic heuristic; the LLM may refine this.)
    potential_target: str | None = None
    for c in categorical:
        if 1 < unique.get(str(c), 0) <= min(20, int(0.2 * len(df)) + 2):
            potential_target = str(c)
            break
    if potential_target is None and df.columns.size:
        potential_target = str(df.columns[-1])

    issues: list[str] = []
    for c in df.columns:
        cs = str(c)
        if missing[cs] > 0:
            pct = round(100 * missing[cs] / max(len(df), 1), 1)
            issues.append(f"'{cs}' has {missing[cs]} missing values ({pct}%).")
        if unique[cs] == 1:
            issues.append(f"'{cs}' is constant (single unique value).")
        if inferred[cs] != "boolean" and unique[cs] == len(df):
            issues.append(f"'{cs}' looks like an identifier (all unique); exclude from modeling.")
    dup = int(df.duplicated().sum())
    if dup > 0:
        issues.append(f"{dup} duplicate rows detected.")

    # preview: JSON-safe (NaT/NaN -> null, datetimes -> ISO strings)
    preview = json.loads(df.head(10).to_json(orient="records", date_format="iso"))

    return DatasetProfile(
        file_name=original_filename,
        file_size=len(content),
        row_count=int(df.shape[0]),
        column_count=int(df.shape[1]),
        column_names=[str(c) for c in df.columns],
        inferred_types=inferred,
        numeric_columns=numeric,
        categorical_columns=categorical,
        date_columns=date_cols,
        missing_values=missing,
        duplicate_row_count=dup,
        null_percentage=null_pct,
        unique_values=unique,
        basic_statistics=basic_stats,
        potential_target_column=potential_target,
        data_quality_issues=issues,
        preview=preview,
    )
