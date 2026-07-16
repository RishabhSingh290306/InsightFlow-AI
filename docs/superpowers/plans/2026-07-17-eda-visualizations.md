# EDA + Visualizations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only EDA + Visualizations workflow: a deterministic backend engine computes chart-ready data and emits a universal `ChartSpec`; the LLM writes prose and recommends a subset; the human accepts/rejects each chart, and accepted charts persist on the dataset as reusable assets.

**Architecture:** The backend `app/services/eda/` has a deterministic `engine.py` (candidates from dataframe + `DatasetProfile`) and a best-effort `proposer.py` (AI prose, deterministic fallback). A single universal `ChartSpec` schema (`app/schemas/eda.py`) is the contract; `app/api/routes/eda.py` exposes `POST/GET/PATCH /datasets/{id}/eda` and stores the result on a new nullable `eda` JSON column. The frontend renders via a reusable Recharts `ChartRenderer` and an `eda-panel` review UI. The backend never imports React.

**Tech Stack:** FastAPI, SQLModel, Alembic, pandas, numpy (backend); Next.js 15, React 18, TypeScript, Tailwind v3, Recharts v2 (frontend); pytest (unit tests).

## Global Constraints

- Every AI step is best-effort with a deterministic fallback; the workflow never returns 5xx because of an AI issue. `ai_available` flags the fallback.
- The LLM only receives the structured `DatasetProfile`/`DatasetUnderstanding` — never raw data.
- Backend emits a universal `ChartSpec`; it never imports React or any presentation code.
- EDA is read-only: it does NOT create a new dataset version.
- All API routes are versioned under `/api/v1` (`settings.API_V1_PREFIX`).
- Auth token is read from `localStorage` key `insightflow_token`; `/api/*` → backend via Next.js rewrites.
- Do NOT run `git push`. The maintainer pushes manually. Commit per task.
- Secrets (`backend/.env`, `backend/.venv`) and `data/` are gitignored — never commit them.
- Backend venv Python: `backend/.venv/Scripts/python.exe`. Invoke as `./.venv/Scripts/python.exe`.

---

### Task 1: ChartSpec schema

**Files:**
- Create: `backend/app/schemas/eda.py`

**Interfaces:**
- Produces: `ChartSpec`, `EdaResult`, `EdaAcceptRequest` (imported by engine, proposer, routes, frontend types).

- [ ] **Step 1: Write the schema**

```python
"""Wire contracts for the EDA + Visualizations workflow.

A single universal `ChartSpec` describes every chart (present and future) so the
frontend `ChartRenderer` and all downstream consumers (dashboards, reports,
notebook, AI chat, export) stay stable. `data` is chart-ready (bins / counts /
points / matrix) and is computed deterministically by the backend.
"""
from __future__ import annotations

from pydantic import BaseModel


class ChartSpec(BaseModel):
    """A single recommended visualization (universal spec)."""

    id: str
    chart_type: str  # "bar" | "line" | "scatter" | "histogram" | "pie" | "box" | "heatmap"
    title: str
    subtitle: str | None = None
    business_question: str
    explanation: str
    recommended_reason: str
    confidence: float
    axis_config: dict = {}
    data: list[dict] = []
    metadata: dict = {}
    accepted: bool = False


class EdaResult(BaseModel):
    """The stored analysis for a dataset: recommended charts + AI availability."""

    ai_available: bool = True
    charts: list[ChartSpec] = []


class EdaAcceptRequest(BaseModel):
    """Body for PATCH /datasets/{id}/eda — the human's accepted chart ids."""

    accepted_ids: list[str] = []
```

- [ ] **Step 2: Verify it imports and round-trips**

Run: `cd backend && ./.venv/Scripts/python.exe -c "from app.schemas.eda import ChartSpec, EdaResult, EdaAcceptRequest; s=ChartSpec(id='x', chart_type='bar', title='t', business_question='q', explanation='e', recommended_reason='r', confidence=0.5, data=[{'category':'a','count':1}]); print(EdaResult(charts=[s]).model_dump(mode='json'))"`

Expected: prints `{'ai_available': True, 'charts': [{'id': 'x', 'chart_type': 'bar', 'title': 't', 'subtitle': None, 'business_question': 'q', 'explanation': 'e', 'recommended_reason': 'r', 'confidence': 0.5, 'axis_config': {}, 'data': [{'category': 'a', 'count': 1}], 'metadata': {}, 'accepted': False}]}`

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/eda.py
git commit -m "feat: add universal ChartSpec + EdaResult schemas for EDA"
```

---

### Task 2: Migration + `eda` column on Dataset

**Files:**
- Modify: `backend/app/models/dataset.py` (add `eda` field after `understanding`)
- Create: `backend/alembic/versions/d5e6f7a8b9c0_add_eda_column.py`

**Interfaces:**
- Produces: `Dataset.eda` nullable JSON column; migration `d5e6f7a8b9c0` revising `c4d5e6f7a8b9`.

- [ ] **Step 1: Add the field to the model**

In `backend/app/models/dataset.py`, after the `understanding` field (line 55), add:

```python
    # EDA + Visualizations: recommended chart specs (ChartSpec list) produced by
    # the deterministic EDA engine + AI proposer. NULL until EDA is generated.
    eda: dict | None = Field(default=None, sa_column=Column(JSON))
```

- [ ] **Step 2: Write the migration**

```python
"""add eda column to datasets

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-07-17 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel  # provides AutoString used by SQLModel columns


revision: str = 'd5e6f7a8b9c0'
down_revision: Union[str, None] = 'c4d5e6f7a8b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Nullable JSON holding the EdaResult (list of ChartSpec) for a dataset
    # version. NULL until EDA is generated.
    op.add_column('datasets', sa.Column('eda', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('datasets', 'eda')
```

- [ ] **Step 3: Verify migration applies and the column exists**

Run: `cd backend && ./.venv/Scripts/python.exe -c "from app.core.database import engine; from sqlalchemy import inspect; cols=[c['name'] for c in inspect(engine).get_columns('datasets')]; assert 'eda' in cols, cols; print('eda column present:', cols)"`

Expected: prints `eda column present: [..., 'eda']` (migration runs automatically on import via `run_migrations` referenced at startup; if not, run `./.venv/Scripts/python.exe -c "from app.core.database import run_migrations; run_migrations()"` first).

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/dataset.py backend/alembic/versions/d5e6f7a8b9c0_add_eda_column.py
git commit -m "feat: add nullable eda JSON column + migration"
```

---

### Task 3: Deterministic EDA engine (`build_candidates`)

**Files:**
- Create: `backend/app/services/eda/__init__.py`
- Create: `backend/app/services/eda/engine.py`
- Create: `backend/tests/test_eda_engine.py`

**Interfaces:**
- Consumes: `pd.DataFrame`, `DatasetProfile` (from `app.schemas/understanding.py`).
- Produces: `build_candidates(df: pd.DataFrame, profile: DatasetProfile) -> list[ChartSpec]` (used by routes + proposer).

- [ ] **Step 1: Write the failing unit test**

`backend/tests/test_eda_engine.py`:

```python
import pandas as pd
import numpy as np
from app.schemas.understanding import DatasetProfile
from app.services.eda.engine import build_candidates


def _profile(numeric, categorical, missing=None, target=None):
    return DatasetProfile(
        file_name="t.csv", file_size=10, row_count=100, column_count=len(numeric) + len(categorical),
        column_names=numeric + categorical,
        inferred_types={c: "numeric" for c in numeric} | {c: "categorical" for c in categorical},
        numeric_columns=list(numeric), categorical_columns=list(categorical), date_columns=[],
        missing_values=missing or {c: 0 for c in numeric + categorical},
        duplicate_row_count=0, null_percentage=0.0,
        unique_values={c: 10 for c in numeric + categorical},
        basic_statistics={}, potential_target_column=target, data_quality_issues=[], preview=[],
    )


def test_histogram_bins_sum_to_row_count():
    df = pd.DataFrame({"age": np.random.default_rng(0).integers(0, 100, 100)})
    charts = build_candidates(df, _profile(["age"], []))
    hist = [c for c in charts if c.chart_type == "histogram"]
    assert hist, "expected a histogram"
    assert sum(d["count"] for d in hist[0].data) == 100


def test_correlation_heatmap_is_symmetric_and_diagonal_one():
    rng = np.random.default_rng(1)
    df = pd.DataFrame({"a": rng.normal(size=50), "b": rng.normal(size=50)})
    df["b"] = df["a"] + rng.normal(scale=0.1, size=50)  # strong positive corr
    charts = build_candidates(df, _profile(["a", "b"], []))
    heat = [c for c in charts if c.chart_type == "heatmap"]
    assert heat, "expected a heatmap"
    cells = {(d["x"], d["y"]): d["value"] for d in heat[0].data}
    assert cells[("a", "a")] == 1.0 and cells[("b", "b")] == 1.0
    assert abs(cells[("a", "b")] - cells[("b", "a")]) < 1e-9
    assert cells[("a", "b")] > 0.9


def test_missingness_bar_matches_profile():
    df = pd.DataFrame({"x": [1, 2, None, 4], "y": [1, 2, 3, 4]})
    charts = build_candidates(df, _profile(["x", "y"], [], missing={"x": 1, "y": 0}))
    miss = [c for c in charts if c.metadata.get("aggregation") == "missing"]
    assert miss, "expected a missingness chart"
    assert {d["category"]: d["count"] for d in miss[0].data} == {"x": 1}


def test_box_stats_ordered():
    df = pd.DataFrame({"v": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]})
    charts = build_candidates(df, _profile(["v"], []))
    box = [c for c in charts if c.chart_type == "box" and c.metadata.get("aggregation") == "box"]
    assert box
    s = box[0].data[0]
    assert s["min"] <= s["q1"] <= s["median"] <= s["q3"] <= s["max"]


def test_categorical_bar_uses_top_counts():
    df = pd.DataFrame({"cat": ["a"] * 3 + ["b"] * 2 + ["c"] * 1})
    charts = build_candidates(df, _profile([], ["cat"]))
    bar = [c for c in charts if c.chart_type == "bar" and c.metadata.get("aggregation") == "value_counts"]
    assert bar
    assert {d["category"]: d["count"] for d in bar[0].data} == {"a": 3, "b": 2, "c": 1}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_eda_engine.py -q`

Expected: FAIL (`ModuleNotFoundError: No module named 'app.services.eda'`).

- [ ] **Step 3: Write the engine**

`backend/app/services/eda/__init__.py`:

```python
"""Deterministic EDA engine: candidate chart generation + AI proposer."""
from app.services.eda.engine import build_candidates
from app.services.eda.proposer import propose_charts

__all__ = ["build_candidates", "propose_charts"]
```

`backend/app/services/eda/engine.py`:

```python
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_eda_engine.py -q`

Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/eda/__init__.py backend/app/services/eda/engine.py backend/tests/test_eda_engine.py
git commit -m "feat: deterministic EDA candidate builder (histogram/box/bar/pie/heatmap/scatter)"
```

---

### Task 4: AI proposer (`propose_charts`) with fallback

**Files:**
- Create: `backend/app/services/eda/proposer.py`
- Create: `backend/tests/test_eda_proposer.py`

**Interfaces:**
- Consumes: `build_candidates` output, `DatasetProfile`, optional `DatasetUnderstanding`, `complete_json` (from `app.services.llm`).
- Produces: `propose_charts(profile, understanding, candidates) -> tuple[EdaResult, bool]`.

- [ ] **Step 1: Write the failing test (monkeypatch `complete_json`)**

`backend/tests/test_eda_proposer.py`:

```python
import asyncio
from app.schemas.eda import ChartSpec
from app.schemas.understanding import DatasetProfile
from app.services.eda import proposer


def _candidates():
    return [
        ChartSpec(id="c1", chart_type="histogram", title="Distribution of age",
                  business_question="q", explanation="", recommended_reason="",
                  confidence=0.0, data=[], metadata={"columns": ["age"]}),
        ChartSpec(id="c2", chart_type="bar", title="Counts by region",
                  business_question="q", explanation="", recommended_reason="",
                  confidence=0.0, data=[], metadata={"columns": ["region"]}),
    ]


def _profile():
    return DatasetProfile(
        file_name="t.csv", file_size=1, row_count=10, column_count=2,
        column_names=["age", "region"], inferred_types={"age": "numeric", "region": "categorical"},
        numeric_columns=["age"], categorical_columns=["region"], date_columns=[],
        missing_values={}, duplicate_row_count=0, null_percentage=0.0,
        unique_values={}, basic_statistics={}, potential_target_column=None,
        data_quality_issues=[], preview=[],
    )


def test_fallback_when_llm_unavailable(monkeypatch):
    async def boom(*a, **k):
        raise RuntimeError("no key")
    monkeypatch.setattr(proposer, "complete_json", boom)
    result, ai_available = asyncio.run(proposer.propose_charts(_profile(), None, _candidates()))
    assert ai_available is False
    assert len(result.charts) == 2
    assert all(c.confidence > 0 for c in result.charts)
    assert all(c.explanation for c in result.charts)


def test_success_path_fills_prose(monkeypatch):
    async def fake(_system, _user, model=None):
        return {"charts": [
            {"id": "c1", "title": "Age spread", "business_question": "dist?",
             "explanation": "shows age", "recommended_reason": "useful",
             "confidence": 0.9, "recommended": True},
        ]}
    monkeypatch.setattr(proposer, "complete_json", fake)
    result, ai_available = asyncio.run(proposer.propose_charts(_profile(), None, _candidates()))
    assert ai_available is True
    by_id = {c.id: c for c in result.charts}
    assert by_id["c1"].title == "Age spread"
    assert by_id["c1"].confidence == 0.9
```

Note: runs via `asyncio.run` — no `pytest-asyncio` dependency required.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_eda_proposer.py -q`

Expected: FAIL (`ModuleNotFoundError: No module named 'app.services.eda.proposer'`).

- [ ] **Step 3: Write the proposer**

`backend/app/services/eda/proposer.py`:

```python
"""Stage 2 — AI interpretation of EDA candidates (best-effort).

Consumes the structured profile + the deterministically computed candidate
charts, and asks the LLM to write prose (title/business_question/explanation/
recommended_reason/confidence) for each. On any failure, falls back to keeping
all candidates with templated prose. Never raises because of the LLM.
"""
from __future__ import annotations

import json

from pydantic import ValidationError

from app.schemas.eda import ChartSpec, EdaResult
from app.schemas.understanding import DatasetProfile, DatasetUnderstanding
from app.services.llm import complete_json

_SYSTEM = (
    "You are a senior data analyst. You are given STRUCTURED metadata about a "
    "dataset (never the raw data) and a list of CANDIDATE charts already computed "
    "from it. For each candidate (by 'id') write: title (string), business_question "
    "(string), explanation (string), recommended_reason (string), confidence "
    "(number 0-1), and recommended (boolean — whether to surface it). Respond with "
    "JSON only: {\"charts\": [ {id, title, business_question, explanation, "
    "recommended_reason, confidence, recommended} ]}."
)


async def propose_charts(
    profile: DatasetProfile,
    understanding: DatasetUnderstanding | None,
    candidates: list[ChartSpec],
) -> tuple[EdaResult, bool]:
    candidates = list(candidates)
    try:
        user_prompt = (
            "Profile:\n" + json.dumps(profile.model_dump(mode="json"), indent=2)
            + "\nCandidates (id, type, source columns):\n"
            + json.dumps(
                [{"id": c.id, "chart_type": c.chart_type, "columns": c.metadata.get("columns")}
                 for c in candidates],
                indent=2,
            )
        )
        data = await complete_json(_SYSTEM, user_prompt)
        raw = data.get("charts", []) if isinstance(data, dict) else []
        by_id = {c.id: c for c in candidates}
        out: list[ChartSpec] = []
        for item in raw:
            spec = by_id.get(item.get("id"))
            if spec is None:
                continue
            spec = spec.model_copy()
            spec.title = str(item.get("title", spec.title))
            spec.business_question = str(item.get("business_question", spec.business_question))
            spec.explanation = str(item.get("explanation", ""))
            spec.recommended_reason = str(item.get("recommended_reason", ""))
            spec.confidence = float(item.get("confidence", spec.confidence))
            out.append(spec)
        if not out:
            return EdaResult(ai_available=False, charts=_fallback(candidates, profile)), False
        return EdaResult(ai_available=True, charts=out), True
    except (Exception, ValidationError):
        return EdaResult(ai_available=False, charts=_fallback(candidates, profile)), False


def _fallback(candidates: list[ChartSpec], profile: DatasetProfile) -> list[ChartSpec]:
    null_pct = float(getattr(profile, "null_percentage", 0) or 0)
    base = max(0.3, round(0.9 - null_pct / 100.0, 2))
    out = []
    for c in candidates:
        c = c.model_copy()
        c.confidence = base
        c.explanation = c.explanation or (
            f"Shows the {c.chart_type} view of {c.metadata.get('columns')}."
        )
        c.recommended_reason = c.recommended_reason or (
            "Automatically generated from the dataset profile."
        )
        out.append(c)
    return out
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_eda_proposer.py -q`

Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/eda/proposer.py backend/tests/test_eda_proposer.py
git commit -m "feat: EDA AI proposer with deterministic fallback"
```

---

### Task 5: EDA routes + mounting

**Files:**
- Create: `backend/app/api/routes/eda.py`
- Modify: `backend/app/api/routes/__init__.py` (import `eda`)
- Modify: `backend/app/main.py` (include `eda.router`)

**Interfaces:**
- Consumes: `build_candidates`, `propose_charts`, `load_dataframe` (from `app.services.cleaning.engine`), `get_storage`, `DatasetProfile`/`DatasetUnderstanding`.
- Produces: `POST/GET/PATCH /api/v1/datasets/{id}/eda` endpoints.

- [ ] **Step 1: Write the routes**

`backend/app/api/routes/eda.py`:

```python
"""EDA + Visualizations routes — generate, fetch, and accept charts.

- `POST /{id}/eda` — build candidate charts, run the AI proposer, store the
  result on `dataset.eda`, return it (409 if the dataset is unprofiled).
- `GET /{id}/eda` — return the stored result (404 if not generated).
- `PATCH /{id}/eda` — persist the human's accepted chart ids (404 if none yet).

EDA is read-only: it never creates a new dataset version.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUser, SessionDep
from app.core.storage import get_storage
from app.models.dataset import Dataset
from app.schemas.eda import EdaAcceptRequest, EdaResult
from app.schemas.understanding import DatasetProfile, DatasetUnderstanding
from app.services.cleaning.engine import load_dataframe
from app.services.eda.engine import build_candidates
from app.services.eda.proposer import propose_charts

router = APIRouter(prefix="/datasets", tags=["eda"])


def _get_owned(dataset_id: int, session: SessionDep, user: CurrentUser) -> Dataset:
    dataset = session.get(Dataset, dataset_id)
    if dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    if dataset.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your dataset")
    return dataset


@router.post("/{dataset_id}/eda", response_model=EdaResult)
async def generate_eda(dataset_id: int, session: SessionDep, current_user: CurrentUser) -> EdaResult:
    dataset = _get_owned(dataset_id, session, current_user)
    if dataset.profile is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Dataset is not analyzed yet. Run Analyze first.",
        )
    profile = DatasetProfile.model_validate(dataset.profile)
    understanding = (
        DatasetUnderstanding.model_validate(dataset.understanding)
        if dataset.understanding
        else None
    )
    storage = get_storage()
    df = load_dataframe(storage, dataset.storage_path, dataset.file_format)
    candidates = build_candidates(df, profile)
    result, _ = await propose_charts(profile, understanding, candidates)
    dataset.eda = result.model_dump(mode="json")
    session.add(dataset)
    session.commit()
    session.refresh(dataset)
    return result


@router.get("/{dataset_id}/eda", response_model=EdaResult)
def get_eda(dataset_id: int, session: SessionDep, current_user: CurrentUser) -> EdaResult:
    dataset = _get_owned(dataset_id, session, current_user)
    if dataset.eda is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="EDA not generated yet. Run EDA first.")
    return EdaResult.model_validate(dataset.eda)


@router.patch("/{dataset_id}/eda", response_model=EdaResult)
def accept_eda(
    dataset_id: int,
    body: EdaAcceptRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> EdaResult:
    dataset = _get_owned(dataset_id, session, current_user)
    if dataset.eda is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="EDA not generated yet. Run EDA first.")
    result = EdaResult.model_validate(dataset.eda)
    accepted = set(body.accepted_ids)
    for c in result.charts:
        c.accepted = c.id in accepted
    dataset.eda = result.model_dump(mode="json")
    session.add(dataset)
    session.commit()
    session.refresh(dataset)
    return result
```

- [ ] **Step 2: Mount the router**

In `backend/app/api/routes/__init__.py` change line 2-4 to:

```python
from app.api.routes import auth, cleaning, datasets, eda, projects, users

__all__ = ["auth", "users", "projects", "datasets", "cleaning", "eda"]
```

In `backend/app/main.py` add `eda` to the import on line 10 and add before the last
`include_router`:

```python
from app.api.routes import auth, cleaning, datasets, eda, projects, users
...
app.include_router(eda.router, prefix=API_PREFIX)
```

- [ ] **Step 3: Verify the app boots and routes are registered**

Run: `cd backend && ./.venv/Scripts/python.exe -c "from app.main import app; paths=[r.path for r in app.routes if getattr(r,'path','').endswith('/eda')]; print(sorted(paths))"`

Expected: prints a list containing `/api/v1/datasets/{dataset_id}/eda` (POST/GET/PATCH).

- [ ] **Step 4: End-to-end check (manual, against dev DB) — write, run, then delete**

Write `backend/_eda_e2e.py`:

```python
import io, uuid
from fastapi.testclient import TestClient
from app.main import app

c = TestClient(app)
email = f"eda_{uuid.uuid4().hex[:8]}@test.dev"
c.post("/api/v1/auth/register", json={"email": email, "password": "password123", "full_name": "E"})
tok = c.post("/api/v1/auth/login", data={"username": email, "password": "password123"}).json()["access_token"]
h = {"Authorization": f"Bearer {tok}"}
proj = c.post("/api/v1/projects", json={"name": "E", "description": "x"}, headers=h).json()
pid = proj["id"]

CSV = b"age,region,score\n30,north,10\n25,south,20\n25,south,20\n40,north,30\n45,,15\n"
files = {"file": ("d.csv", CSV, "text/csv")}
ds = c.post(f"/api/v1/datasets/projects/{pid}", files=files, headers=h).json()
did = ds["id"]

# 409 before profiling
r = c.post(f"/api/v1/datasets/{did}/eda", headers=h)
assert r.status_code == 409, r.status_code
print("PASS 409 before profile")

ds = c.post(f"/api/v1/datasets/{did}/understand", headers=h).json()
assert ds["profile"] is not None

res = c.post(f"/api/v1/datasets/{did}/eda", headers=h).json()
assert "charts" in res and res["charts"], "expected charts"
types = {ch["chart_type"] for ch in res["charts"]}
assert "histogram" in types and "bar" in types, types
print(f"PASS generate: {len(res['charts'])} charts, ai_available={res['ai_available']}")

got = c.get(f"/api/v1/datasets/{did}/eda", headers=h).json()
assert got["charts"], "expected stored charts"
print("PASS get returns stored eda")

cid = res["charts"][0]["id"]
upd = c.patch(f"/api/v1/datasets/{did}/eda", json={"accepted_ids": [cid]}, headers=h).json()
assert any(ch["id"] == cid and ch["accepted"] for ch in upd["charts"]), "accept flag not persisted"
assert not any(ch["accepted"] for ch in upd["charts"] if ch["id"] != cid), "unexpected accept"
print("PASS patch persists accepted id")

# cleanup
from app.core.database import engine
from app.models.dataset import Dataset
from sqlmodel import Session, select
with Session(engine) as s:
    ids = sorted((d.id for d in s.exec(select(Dataset).where(Dataset.project_id == pid)).all()), reverse=True)
for i in ids:
    c.delete(f"/api/v1/datasets/{i}", headers=h)
c.delete(f"/api/v1/projects/{pid}", headers=h)
print("CLEANUP done")
```

Run: `cd backend && ./.venv/Scripts/python.exe _eda_e2e.py`

Expected: all four PASS lines + CLEANUP done (no assertion errors).

Then delete the temp file: `rm backend/_eda_e2e.py`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/eda.py backend/app/api/routes/__init__.py backend/app/main.py
git commit -m "feat: EDA routes (generate/get/accept) + mount"
```

---

### Task 6: Frontend types + API client

**Files:**
- Modify: `frontend/lib/types.ts` (add ChartSpec, EdaResult, EdaAcceptRequest)
- Modify: `frontend/lib/api.ts` (add `edaApi`)

**Interfaces:**
- Produces: `ChartSpec`, `EdaResult`, `EdaAcceptRequest` types; `edaApi.generate/get/accept`.

- [ ] **Step 1: Add the types**

In `frontend/lib/types.ts`, after the `CleaningPlan` interface, add:

```typescript
// --- EDA + Visualizations ------------------------------------------------

export type ChartType =
  | "bar"
  | "line"
  | "scatter"
  | "histogram"
  | "pie"
  | "box"
  | "heatmap";

export interface ChartSpec {
  id: string;
  chart_type: ChartType;
  title: string;
  subtitle?: string | null;
  business_question: string;
  explanation: string;
  recommended_reason: string;
  confidence: number;
  axis_config: Record<string, unknown>;
  data: Record<string, unknown>[];
  metadata: Record<string, unknown>;
  accepted: boolean;
}

export interface EdaResult {
  ai_available: boolean;
  charts: ChartSpec[];
}

export interface EdaAcceptRequest {
  accepted_ids: string[];
}
```

- [ ] **Step 2: Add the API client**

In `frontend/lib/api.ts`, update the type import to include the new types and add `edaApi`
after `cleaningApi`:

```typescript
import type {
  CleaningOperation,
  CleaningPlan,
  ChartSpec,
  DatasetRead,
  EdaAcceptRequest,
  EdaResult,
  ProjectCreate,
  ProjectRead,
  Token,
  UserRead,
} from "@/lib/types";
```

```typescript
export const edaApi = {
  generate(datasetId: number): Promise<EdaResult> {
    return request<EdaResult>(`/api/v1/datasets/${datasetId}/eda`, { method: "POST" });
  },
  get(datasetId: number): Promise<EdaResult> {
    return request<EdaResult>(`/api/v1/datasets/${datasetId}/eda`);
  },
  accept(datasetId: number, acceptedIds: string[]): Promise<EdaResult> {
    return request<EdaResult>(`/api/v1/datasets/${datasetId}/eda`, {
      method: "PATCH",
      body: JSON.stringify({ accepted_ids: acceptedIds }),
    });
  },
};
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/types.ts frontend/lib/api.ts
git commit -m "feat: frontend EDA types + edaApi client"
```

---

### Task 7: ChartRenderer component

**Files:**
- Create: `frontend/components/chart-renderer.tsx`

**Interfaces:**
- Consumes: `ChartSpec` (from `@/lib/types`), Recharts.
- Produces: `<ChartRenderer spec={...} />` (used by `eda-panel`).

- [ ] **Step 1: Install Recharts**

Run: `cd frontend && npm install recharts@^2.13.0`

Expected: recharts added to `package.json` dependencies; install succeeds.

- [ ] **Step 2: Write the component**

`frontend/components/chart-renderer.tsx`:

```tsx
"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartSpec } from "@/lib/types";

const ACCENT = "hsl(var(--primary))";
const PALETTE = [
  "hsl(var(--primary))",
  "hsl(var(--secondary-foreground))",
  "hsl(142 71% 45%)",
  "hsl(38 92% 50%)",
  "hsl(280 65% 60%)",
  "hsl(199 89% 48%)",
];

type Box = { label: string; min: number; q1: number; median: number; q3: number; max: number };

function BoxPlot({ data }: { data: Record<string, unknown>[] }) {
  const rows = data as Box[];
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r, i) => {
        const lo = r.min;
        const hi = r.max;
        const span = hi - lo || 1;
        const y = (v: number) => 40 - ((v - lo) / span) * 40;
        return (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-24 truncate text-muted-foreground">{r.label}</span>
            <svg viewBox="0 0 100 40" className="h-10 flex-1" preserveAspectRatio="none">
              <line x1={50} y1={y(r.min)} x2={50} y2={y(r.max)} stroke={ACCENT} />
              <line x1={0} y1={y(r.min)} x2={100} y2={y(r.min)} stroke={ACCENT} />
              <line x1={0} y1={y(r.max)} x2={100} y2={y(r.max)} stroke={ACCENT} />
              <rect
                x={0}
                y={y(r.q3)}
                width={100}
                height={Math.max(1, y(r.q1) - y(r.q3))}
                fill={ACCENT}
                fillOpacity={0.3}
                stroke={ACCENT}
              />
              <line x1={0} y1={y(r.median)} x2={100} y2={y(r.median)} stroke={ACCENT} strokeWidth={2} />
            </svg>
          </div>
        );
      })}
    </div>
  );
}

function Heatmap({ data, columns }: { data: Record<string, unknown>[]; columns: string[] }) {
  const cells = data as { x: string; y: string; value: number }[];
  const max = Math.max(1, ...cells.map((c) => Math.abs(Number(c.value))));
  return (
    <div className="flex flex-col gap-1 text-xs">
      {columns.map((y) => (
        <div key={y} className="flex items-center gap-1">
          <span className="w-20 truncate text-muted-foreground">{y}</span>
          {columns.map((x) => {
            const cell = cells.find((c) => c.x === x && c.y === y);
            const v = cell ? Number(cell.value) : 0;
            const op = 0.15 + 0.85 * (Math.abs(v) / max);
            return (
              <div
                key={x}
                title={`${x} ~ ${y}: ${v}`}
                className="h-5 w-5 rounded-sm"
                style={{ background: v >= 0 ? `rgba(34,197,94,${op})` : `rgba(239,68,68,${op})` }}
              />
            );
          })}
        </div>
      ))}
      <div className="flex items-center gap-1 pl-20">
        {columns.map((x) => (
          <span key={x} className="h-5 w-5 truncate text-center text-[9px] text-muted-foreground">
            {x}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ChartRenderer({ spec }: { spec: ChartSpec }) {
  const color = ACCENT;
  switch (spec.chart_type) {
    case "histogram":
    case "bar":
      return (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={spec.data as Record<string, unknown>[]}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={spec.chart_type === "histogram" ? "bin" : "category"} />
            <YAxis />
            <Tooltip />
            <Bar dataKey="count" fill={color} />
          </BarChart>
        </ResponsiveContainer>
      );
    case "line":
      return (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={spec.data as Record<string, unknown>[]}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="x" />
            <YAxis />
            <Tooltip />
            <Line dataKey="y" stroke={color} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      );
    case "scatter":
      return (
        <ResponsiveContainer width="100%" height={220}>
          <ScatterChart>
            <CartesianGrid />
            <XAxis dataKey="x" type="number" />
            <YAxis dataKey="y" type="number" />
            <Tooltip />
            <Scatter data={spec.data as Record<string, unknown>[]} fill={color} />
          </ScatterChart>
        </ResponsiveContainer>
      );
    case "pie":
      return (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={spec.data as Record<string, unknown>[]}
              dataKey="value"
              nameKey="category"
              outerRadius={80}
              label
            >
              {(spec.data as Record<string, unknown>[]).map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      );
    case "box":
      return <BoxPlot data={spec.data} />;
    case "heatmap":
      return (
        <Heatmap
          data={spec.data}
          columns={(spec.metadata.columns as string[]) ?? []}
        />
      );
    default:
      return <p className="text-sm text-muted-foreground">Unsupported chart type: {spec.chart_type}</p>;
  }
}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/chart-renderer.tsx frontend/package.json frontend/package-lock.json
git commit -m "feat: universal ChartRenderer (Recharts + custom box/heatmap)"
```

---

### Task 8: EDA review panel

**Files:**
- Create: `frontend/components/eda-panel.tsx`

**Interfaces:**
- Consumes: `edaApi`, `ChartRenderer`, `DatasetRead`, `EdaResult`, `ChartSpec`.
- Produces: `<EdaPanel dataset={...} onClose={...} />` (used by project page).

- [ ] **Step 1: Write the component**

`frontend/components/eda-panel.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, Check, Loader2, Sparkles, TriangleAlert, X, XCircle } from "lucide-react";

import { edaApi } from "@/lib/api";
import type { ChartSpec, DatasetRead, EdaResult } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartRenderer } from "@/components/chart-renderer";

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const cls =
    pct >= 80
      ? "bg-primary/15 text-primary"
      : pct >= 50
        ? "bg-secondary text-secondary-foreground"
        : "bg-destructive/15 text-destructive";
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{pct}% conf.</span>;
}

export function EdaPanel({ dataset, onClose }: { dataset: DatasetRead; onClose: () => void }) {
  const [result, setResult] = useState<EdaResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let r: EdaResult;
      try {
        r = await edaApi.get(dataset.id);
      } catch {
        r = await edaApi.generate(dataset.id);
      }
      setResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate EDA");
    } finally {
      setLoading(false);
    }
  }, [dataset.id]);

  useEffect(() => {
    void load();
  }, [load]);

  function setAccepted(chart: ChartSpec, value: boolean) {
    if (!result) return;
    setResult({
      ...result,
      charts: result.charts.map((c) => (c.id === chart.id ? { ...c, accepted: value } : c)),
    });
  }

  async function onSave() {
    if (!result) return;
    setSaving(true);
    setError(null);
    try {
      const ids = result.charts.filter((c) => c.accepted).map((c) => c.id);
      setResult(await edaApi.accept(dataset.id, ids));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save selections");
    } finally {
      setSaving(false);
    }
  }

  const acceptedCount = result ? result.charts.filter((c) => c.accepted).length : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-10">
      <Card className="w-full max-w-3xl">
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div className="flex flex-col gap-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="h-4 w-4" /> EDA · {dataset.original_filename}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Review recommended charts; accept the ones worth keeping.
            </p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose} disabled={saving}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Generating EDA…
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <TriangleAlert className="h-4 w-4 shrink-0" /> {error}
            </div>
          ) : (
            result && (
              <>
                {!result.ai_available && (
                  <div className="flex items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                    <Sparkles className="h-4 w-4 shrink-0" />
                    AI suggestions unavailable — showing auto-generated charts from the profile.
                  </div>
                )}
                <div className="flex flex-col gap-3">
                  {result.charts.map((c) => (
                    <div
                      key={c.id}
                      className={`flex flex-col gap-2 rounded-lg border p-3 ${c.accepted ? "border-primary bg-primary/5" : ""}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">{c.title}</span>
                          <ConfidenceBadge value={c.confidence} />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant={c.accepted ? "default" : "outline"}
                            onClick={() => setAccepted(c, true)}
                          >
                            <Check className="h-4 w-4" /> Accept
                          </Button>
                          <Button
                            size="sm"
                            variant={!c.accepted ? "destructive" : "outline"}
                            onClick={() => setAccepted(c, false)}
                          >
                            <XCircle className="h-4 w-4" /> Reject
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium">Q:</span> {c.business_question}
                      </p>
                      <div className="rounded-md border bg-muted/30 p-2">
                        <ChartRenderer spec={c} />
                      </div>
                      <p className="text-xs text-muted-foreground">{c.explanation}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Why recommended: {c.recommended_reason}
                      </p>
                    </div>
                  ))}
                </div>
                {error && (
                  <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                    <TriangleAlert className="h-4 w-4 shrink-0" /> {error}
                  </div>
                )}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <span className="text-xs text-muted-foreground">{acceptedCount} accepted</span>
                  <Button variant="ghost" onClick={onClose} disabled={saving}>
                    Close
                  </Button>
                  <Button onClick={onSave} disabled={saving}>
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                      </>
                    ) : (
                      "Save selections"
                    )}
                  </Button>
                </div>
              </>
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/eda-panel.tsx
git commit -m "feat: EDA review panel (accept/reject charts)"
```

---

### Task 9: Wire EDA button into the project page

**Files:**
- Modify: `frontend/app/projects/[id]/page.tsx`

**Interfaces:**
- Consumes: `edaApi`, `EdaPanel`, `DatasetRead`.

- [ ] **Step 1: Import and add state**

Add to the imports block (after the `CleaningPanel` import):

```typescript
import { EdaPanel } from "@/components/eda-panel";
```

In the component body, near the `cleaningId` state (Task 20 of M3), add:

```typescript
  const [edaId, setEdaId] = useState<number | null>(null);
```

- [ ] **Step 2: Add the EDA button**

In the button row (after the `Clean` button block added in M3), add:

```tsx
                      {d.profile && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEdaId(d.id)}
                        >
                          <BarChart3 className="h-4 w-4" />
                          EDA
                        </Button>
                      )}
```

(Add `BarChart3` to the lucide-react import list at the top of the file.)

- [ ] **Step 3: Render the panel**

After the `cleaningId` panel block (the `{cleaningId !== null && (...)}` JSX), add:

```tsx
      {edaId !== null && (
        <EdaPanel
          dataset={datasets.find((d) => d.id === edaId)!}
          onClose={() => setEdaId(null)}
        />
      )}
```

- [ ] **Step 4: Type-check, lint, build**

Run: `cd frontend && npx tsc --noEmit && npx next lint && rm -rf .next && npm run build 2>&1 | tail -n 12`

Expected: `tsc` clean, `next lint` no errors/warnings, `next build` succeeds (routes list printed).

- [ ] **Step 5: Commit**

```bash
git add frontend/app/projects/\[id\]/page.tsx
git commit -m "feat: wire EDA button + panel into project workspace"
```

---

### Task 10: Full verification + docs + milestone commit

**Files:**
- Modify: `PROJECT_PROGRESS.md` (tick Sprint 2 M1), `DEVELOPMENT_LOG.md` (add entry).

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Backend compile + unit tests**

Run: `cd backend && ./.venv/Scripts/python.exe -m compileall -q app && ./.venv/Scripts/python.exe -m pytest tests/ -q`

Expected: compile clean; `tests/` PASS (7 passed: 5 engine + 2 proposer).

- [ ] **Step 2: Frontend lint + build**

Run: `cd frontend && npx tsc --noEmit && npx next lint && rm -rf .next && npm run build 2>&1 | tail -n 12`

Expected: clean compile, lint, successful build.

- [ ] **Step 3: Tick Sprint 2 M1 in PROJECT_PROGRESS.md**

In `PROJECT_PROGRESS.md`, in the "Current Sprint" Sprint 2 block, add the milestone line and check it:

```markdown
- [x] **M1 — EDA + Visualizations:** deterministic `build_candidates` + best-effort `propose_charts` (fallback), universal `ChartSpec`, `POST/GET/PATCH /eda` (stored on `dataset.eda`), Recharts `ChartRenderer` + accept/reject `eda-panel`, end-to-end verification
```

Also update the milestone timeline row `| EDA + Visualizations | 2026-08-20 | Pending |` → `| EDA + Visualizations | 2026-08-20 | ✅ Complete |`.

- [ ] **Step 4: Add a DEVELOPMENT_LOG.md entry**

Append after the most recent M3 entry:

```markdown
## 2026-07-17 — Sprint 2, M1: EDA + Visualizations (shipped)

Read-only analysis workflow completing the HITL pattern: deterministic backend
computes facts, AI proposes, human curates. No new dataset version is created.

- **`app/services/eda/engine.py`** — `build_candidates(df, profile)` deterministically
  builds a candidate `ChartSpec` list: histogram + box per numeric column; bar (+ pie
  for low-cardinality) per categorical; correlation heatmap + top-K scatter pairs for
  numeric sets; missingness bar; target relationship chart. All `data` is chart-ready.
- **`app/services/eda/proposer.py`** — `propose_charts(profile, understanding, candidates)`
  sends the profile + candidate ids to `complete_json` for prose (title / business
  question / explanation / recommended_reason / confidence); validates against candidate
  ids; on any failure falls back to keeping all candidates with templated prose and
  `ai_available=False`.
- **`app/schemas/eda.py`** — universal `ChartSpec` (+ `EdaResult`, `EdaAcceptRequest`);
  the single visualization contract reused by future dashboards/reports/notebook/chat/export.
- **`app/api/routes/eda.py`** — `POST/GET/PATCH /datasets/{id}/eda`; generate requires a
  profile (409 otherwise) and stores `EdaResult` on a new nullable `eda` JSON column
  (migration `d5e6f7a8b9c0`); `PATCH` persists the human's accepted chart ids.
- **Frontend** — `lib/types.ts` (`ChartSpec`/`EdaResult`/`EdaAcceptRequest`), `lib/api.ts`
  (`edaApi`), `components/chart-renderer.tsx` (universal Recharts renderer; box + heatmap
  are custom SVG since Recharts lacks natives), `components/eda-panel.tsx` (accept/reject
  review), and an **EDA** button per dataset (shown when a profile exists) in
  `app/projects/[id]/page.tsx`.

Verified: `py_compile`, `pytest` (engine + proposer unit tests), `tsc`/`next lint`/`next
build` all pass; manual TestClient e2e confirms 409-before-profile, chart generation,
store/get, and accept persistence.

## Future Log Entries
```

- [ ] **Step 5: Commit (no push)**

```bash
git add PROJECT_PROGRESS.md DEVELOPMENT_LOG.md
git commit -m "docs: tick Sprint 2 M1 (EDA + Visualizations); add dev log entry"
```

- [ ] **Step 6: Final summary to maintainer**

Report: milestone complete, all tasks committed, no push performed (maintainer pushes).
List the verification results.
