"""Deterministic EDA candidate builder (pure pandas).

Reads the dataframe + its `DatasetProfile` and emits a list of `ChartSpec`
candidates with `data` computed. Prose fields (title/business_question/
explanation/recommended_reason/confidence) are left blank for the proposer to
fill. Always succeeds for a valid frame.
"""
from __future__ import annotations

import uuid

import numpy as np
import pandas as pd

from app.schemas.eda import ChartSpec
from app.schemas.understanding import DatasetProfile


def _uid() -> str:
    return str(uuid.uuid4())


def _histogram(series: pd.Series, max_bins: int = 30) -> list[dict]:
    s = series.dropna()
    if s.empty:
        return []
    n = len(s)
    bins = min(max_bins, max(5, int(np.sqrt(n))))
    counts, edges = np.histogram(s.astype(float), bins=bins)
    out = []
    for i in range(len(counts)):
        lo, hi = float(edges[i]), float(edges[i + 1])
        label = f"{lo:.2f}–{hi:.2f}" if lo != hi else f"{lo:.2f}"
        out.append({"bin": label, "count": int(counts[i])})
    return out


def _box(series: pd.Series) -> dict:
    s = series.dropna()
    if s.empty:
        return {"label": str(series.name), "min": None, "q1": None, "median": None, "q3": None, "max": None}
    q = s.quantile([0.0, 0.25, 0.5, 0.75, 1.0])
    return {
        "label": str(series.name),
        "min": float(q[0.0]), "q1": float(q[0.25]),
        "median": float(q[0.5]), "q3": float(q[0.75]), "max": float(q[1.0]),
    }


def build_candidates(df: pd.DataFrame, profile: DatasetProfile) -> list[ChartSpec]:
    charts: list[ChartSpec] = []
    numeric = list(profile.numeric_columns)
    categorical = list(profile.categorical_columns)

    for col in numeric:
        series = df[col]
        charts.append(ChartSpec(
            id=_uid(), chart_type="histogram",
            title=f"Distribution of {col}", subtitle=None,
            business_question=f"What is the distribution and spread of {col}?",
            explanation="", recommended_reason="", confidence=0.0,
            axis_config={"x_label": col, "y_label": "count"},
            data=_histogram(series),
            metadata={"columns": [col], "aggregation": "histogram"},
        ))
        charts.append(ChartSpec(
            id=_uid(), chart_type="box",
            title=f"Spread of {col} (five-number summary)", subtitle=None,
            business_question=f"Are there outliers or skew in {col}?",
            explanation="", recommended_reason="", confidence=0.0,
            axis_config={"x_label": col, "y_label": "value"},
            data=[_box(series)],
            metadata={"columns": [col], "aggregation": "box"},
        ))

    for col in categorical:
        vc = df[col].value_counts().head(10)
        charts.append(ChartSpec(
            id=_uid(), chart_type="bar",
            title=f"Counts by {col}", subtitle=None,
            business_question=f"What are the most common values of {col}?",
            explanation="", recommended_reason="", confidence=0.0,
            axis_config={"x_label": col, "y_label": "count"},
            data=[{"category": str(k), "count": int(v)} for k, v in vc.items()],
            metadata={"columns": [col], "aggregation": "value_counts"},
        ))
        if int(profile.unique_values.get(col, 0)) <= 8:
            charts.append(ChartSpec(
                id=_uid(), chart_type="pie",
                title=f"Proportion by {col}", subtitle=None,
                business_question=f"What share of records fall in each {col} category?",
                explanation="", recommended_reason="", confidence=0.0,
                axis_config={},
                data=[{"category": str(k), "value": int(v)} for k, v in vc.items()],
                metadata={"columns": [col], "aggregation": "value_counts"},
            ))

    if len(numeric) >= 2:
        corr = df[numeric].corr()
        heat = [{"x": a, "y": b, "value": round(float(corr.loc[a, b]), 4)}
                for a in numeric for b in numeric]
        charts.append(ChartSpec(
            id=_uid(), chart_type="heatmap",
            title="Correlation matrix (numeric columns)", subtitle=None,
            business_question="Which numeric columns move together?",
            explanation="", recommended_reason="", confidence=0.0,
            axis_config={"x_label": "column", "y_label": "column"},
            data=heat,
            metadata={"columns": numeric, "aggregation": "pearson"},
        ))
        pairs = []
        for i in range(len(numeric)):
            for j in range(i + 1, len(numeric)):
                a, b = numeric[i], numeric[j]
                pairs.append((abs(float(corr.loc[a, b])), a, b, float(corr.loc[a, b])))
        pairs.sort(reverse=True)
        for _, a, b, r in pairs[: min(5, len(pairs))]:
            sample = df[[a, b]].dropna()
            if len(sample) > 500:
                sample = sample.sample(500, random_state=0)
            charts.append(ChartSpec(
                id=_uid(), chart_type="scatter",
                title=f"{a} vs {b} (r={r:.2f})", subtitle=None,
                business_question=f"How does {a} relate to {b}?",
                explanation="", recommended_reason="", confidence=0.0,
                axis_config={"x_label": a, "y_label": b},
                data=[{"x": float(x), "y": float(y)} for x, y in zip(sample[a], sample[b])],
                metadata={"columns": [a, b], "aggregation": "scatter"},
            ))

    missing = {c: int(n) for c, n in (profile.missing_values or {}).items() if n and n > 0}
    if missing:
        charts.append(ChartSpec(
            id=_uid(), chart_type="bar",
            title="Missing values by column", subtitle=None,
            business_question="Which columns have the most missing data?",
            explanation="", recommended_reason="", confidence=0.0,
            axis_config={"x_label": "column", "y_label": "missing count"},
            data=[{"category": c, "count": n} for c, n in missing.items()],
            metadata={"columns": list(missing.keys()), "aggregation": "missing"},
        ))

    target = profile.potential_target_column
    if target and target in numeric and categorical:
        grp = categorical[0] if categorical[0] != target else (categorical[1] if len(categorical) > 1 else None)
        if grp:
            boxed = [{"label": str(k), **_box(df.loc[df[grp] == k, target])}
                     for k in list(df[grp].dropna().unique())[:10]]
            charts.append(ChartSpec(
                id=_uid(), chart_type="box",
                title=f"{target} by {grp}", subtitle=None,
                business_question=f"How does {target} differ across {grp}?",
                explanation="", recommended_reason="", confidence=0.0,
                axis_config={"x_label": grp, "y_label": target},
                data=boxed,
                metadata={"columns": [target, grp], "aggregation": "box_by_group"},
            ))
    elif target and target in categorical:
        vc = df[target].value_counts().head(10)
        charts.append(ChartSpec(
            id=_uid(), chart_type="bar",
            title=f"Distribution of target ({target})", subtitle=None,
            business_question=f"What is the class balance of {target}?",
            explanation="", recommended_reason="", confidence=0.0,
            axis_config={"x_label": target, "y_label": "count"},
            data=[{"category": str(k), "count": int(v)} for k, v in vc.items()],
            metadata={"columns": [target], "aggregation": "value_counts"},
        ))

    return charts
