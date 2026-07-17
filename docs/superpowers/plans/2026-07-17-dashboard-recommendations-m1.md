# Dashboard Recommendations — M1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the reusable dashboard engine and render dataset-scoped dashboards (KPI cards, data quality, recommended charts, AI insights, SQL widget) via an on-demand `POST /preview` endpoint with a read-only frontend renderer — no persistence yet (that is M3).

**Architecture:** A single `Dashboard` engine with a registered `DashboardWidget` plugin per widget (mirrors the cleaning `CleaningOp` pattern). `build_catalog` runs every widget's deterministic `availability`+`build` against stored artifacts to produce candidate widgets. `propose_dashboard` (best-effort AI) selects/orders/groups + writes prose from catalog *metadata only*, falling back to "show all + no summary" on any LLM failure. `render` resolves the saved spec against live artifacts. The route is ephemeral (`/preview`) for M1; persistence + HITL editing land in M3.

**Tech Stack:** Backend — FastAPI, SQLModel, Pydantic v2, pytest, TestClient. Frontend — Next.js 15 (App Router), TypeScript, Tailwind v3, Recharts (via existing `ChartRenderer`), lucide-react.

> This is M1 of the Dashboard Recommendations milestone (spec: `docs/superpowers/specs/2026-07-17-dashboard-recommendations-design.md`). M2 adds project scope + remaining widgets; M3 adds persistence + HITL editor + entry points. Each milestone is reviewed separately before building the next.

## Global Constraints

- "Deterministic code computes all widget facts → AI selects/orders/groups widgets and writes prose → Human accepts/rejects/reorders/saves → Renderer resolves live data." (spec §1)
- "AI never invents widgets or computes facts." (spec §2)
- "Always functional regardless of AI availability (no 5xx from LLM failure)." (spec §2)
- "`build_catalog` (deterministic) runs every widget's `availability` + `build` against stored artifacts ... The AI then selects / orders / groups widgets and writes prose ... from catalog metadata only. On any LLM/validation failure → deterministic fallback." (spec §6.3–6.4)
- "A `Dashboard` row stores the *spec* (config only), never rendered data. The renderer resolves each widget's **live** data from the latest artifacts at render time." (spec §5) — *M3 persistence; M1 stores nothing.*
- "reuses `ChartRenderer` for charts/SQL widgets." (spec §9)
- "reads only stored profile/understanding/eda/lineage — never reparses files." (spec §15)
- All API routes versioned under `/api/v1`; frontend rewrites `/api/*` → backend. Auth token in `localStorage` key `insightflow_token`.
- Every AI step best-effort with deterministic fallback; never return a 5xx because of the LLM.

---

## File Structure

**Backend (new):**
- `app/schemas/dashboard.py` — wire contracts: `WidgetMeta`, `CatalogEntry`, `DashboardSpec`, `DashboardView`, `DashboardPreviewRequest`.
- `app/services/dashboard/__init__.py` — re-exports `assemble_context`, `build_catalog`, `propose_dashboard`, `render`, `all_widgets`.
- `app/services/dashboard/widgets/__init__.py` — builds + holds the widget registry.
- `app/services/dashboard/widgets/base.py` — `DashboardWidget` ABC.
- `app/services/dashboard/widgets/context.py` — `DashboardContext` dataclass.
- `app/services/dashboard/widgets/registry.py` — `all_widgets()` / `get_widget()`.
- `app/services/dashboard/widgets/kpi.py` — `KpiCardsWidget`.
- `app/services/dashboard/widgets/quality.py` — `DataQualityWidget`.
- `app/services/dashboard/widgets/charts.py` — `RecommendedChartsWidget`.
- `app/services/dashboard/widgets/insights.py` — `AiInsightsWidget`.
- `app/services/dashboard/widgets/sql.py` — `SqlWidget`.
- `app/services/dashboard/proposer.py` — `propose_dashboard()` + `_fallback_spec()`.
- `app/services/dashboard/engine.py` — `assemble_context()` + `render()`.
- `app/api/routes/dashboards.py` — `POST /preview` (dataset scope for M1).

**Backend (modify):**
- `app/main.py` — import + mount `dashboards` router.

**Frontend (new):**
- `components/dashboard-renderer.tsx` — read-only, scope-independent renderer reusing `ChartRenderer`.

**Frontend (modify):**
- `lib/types.ts` — dashboard types.
- `lib/api.ts` — `dashboardsApi.preview()`.

**Tests (new, backend):**
- `tests/test_dashboard_widgets.py` — widget `build()` determinism + `build_catalog` assembly + failing-widget skip.
- `tests/test_dashboard_proposer.py` — fallback path (no API key) + success path (monkeypatched `complete_json`).
- `tests/test_dashboard_engine.py` — `render()` honors `widget_order` + `hidden_widgets`; `assemble_context()` shape.
- `tests/manual_dashboard_e2e.py` — TestClient e2e (requires live Postgres, mirrors `manual_sql_followups_e2e.py`): 409 before profile, preview returns widgets, 422 project scope in M1.

---

### Task 1: Dashboard schemas

**Files:**
- Create: `app/schemas/dashboard.py`
- Test: `tests/test_dashboard_widgets.py`

**Interfaces:**
- Produces: `WidgetMeta`, `CatalogEntry`, `DashboardSpec`, `DashboardView`, `DashboardPreviewRequest` (imported by all later tasks).

- [ ] **Step 1: Write the failing test**

```python
# tests/test_dashboard_widgets.py
from app.schemas.dashboard import (
    CatalogEntry, DashboardPreviewRequest, DashboardSpec, DashboardView, WidgetMeta,
)

def test_dashboard_spec_defaults():
    spec = DashboardSpec(scope="dataset")
    assert spec.widget_order == []
    assert spec.hidden_widgets == []
    assert spec.ai_summary is None

def test_dashboard_view_requires_widgets_list():
    view = DashboardView(
        scope="dataset",
        spec=DashboardSpec(scope="dataset"),
        widgets=[CatalogEntry(widget=WidgetMeta(type="kpi", title="K", description="d", applies_to_scopes=["dataset"]), data={"x": 1})],
        ai_available=True,
    )
    assert view.widgets[0].widget.type == "kpi"

def test_preview_request_dataset_scope():
    req = DashboardPreviewRequest(scope="dataset", dataset_id=5)
    assert req.dataset_id == 5
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_dashboard_widgets.py -v`
Expected: FAIL (ModuleNotFoundError: No module named 'app.schemas.dashboard')

- [ ] **Step 3: Write minimal implementation**

```python
# app/schemas/dashboard.py
"""Wire contracts for the Dashboard Recommendations workflow.

A `DashboardSpec` is config only (widget order, hidden widgets, groups, AI
prose, user notes) — never rendered data. The renderer resolves each widget's
live data from the latest artifacts at render time.
"""
from __future__ import annotations

from pydantic import BaseModel


class WidgetMeta(BaseModel):
    """Metadata for one widget — what the AI sees (never its data)."""

    type: str
    title: str
    description: str
    applies_to_scopes: list[str]


class CatalogEntry(BaseModel):
    """A candidate widget with its deterministic, already-computed data."""

    widget: WidgetMeta
    data: dict = {}


class DashboardSpec(BaseModel):
    """The stored/transferred dashboard configuration (no rendered data)."""

    scope: str  # "dataset" | "project"
    widget_order: list[str] = []
    hidden_widgets: list[str] = []
    groups: list[dict] = []
    ai_summary: dict | None = None
    user_notes: dict | None = None


class DashboardView(BaseModel):
    """A resolved dashboard: ordered widgets with live data + the spec."""

    scope: str
    spec: DashboardSpec
    widgets: list[CatalogEntry] = []
    ai_available: bool = True


class DashboardPreviewRequest(BaseModel):
    """Body for POST /dashboards/preview (ephemeral, no persistence in M1)."""

    scope: str
    project_id: int | None = None
    dataset_id: int | None = None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_dashboard_widgets.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/schemas/dashboard.py tests/test_dashboard_widgets.py
git commit -m "feat(dashboards): dashboard wire schemas (M1)"
```

---

### Task 2: Widget base, context, and registry

**Files:**
- Create: `app/services/dashboard/widgets/base.py`
- Create: `app/services/dashboard/widgets/context.py`
- Create: `app/services/dashboard/widgets/registry.py`
- Create: `app/services/dashboard/widgets/__init__.py`
- Create: `app/services/dashboard/__init__.py`
- Test: `tests/test_dashboard_widgets.py` (append)

**Interfaces:**
- Produces: `DashboardWidget` ABC, `DashboardContext` dataclass, `all_widgets()`, `get_widget()`, package re-exports. Consumed by Tasks 3–10.
- `DashboardWidget.build(ctx) -> dict` returns the widget's data payload; `availability(ctx) -> bool` decides inclusion.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_dashboard_widgets.py`:

```python
from app.services.dashboard.widgets.base import DashboardWidget
from app.services.dashboard.widgets.context import DashboardContext
from app.services.dashboard.widgets.registry import all_widgets, get_widget


class _StubWidget(DashboardWidget):
    type = "stub"
    title = "Stub"
    description = "stub widget"
    applies_to_scopes = ["dataset"]

    def availability(self, ctx: DashboardContext) -> bool:
        return True

    def build(self, ctx: DashboardContext) -> dict:
        return {"ok": True}


def test_registry_returns_instances():
    w = _StubWidget()
    # registry is built from real widget modules; just assert shape of API
    assert callable(all_widgets)
    assert callable(get_widget)


def test_context_dataclass_defaults():
    ctx = DashboardContext(scope="dataset")
    assert ctx.scope == "dataset"
    assert ctx.profiles == {}
    assert ctx.sql_history == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_dashboard_widgets.py -v`
Expected: FAIL (ModuleNotFoundError: No module named 'app.services.dashboard')

- [ ] **Step 3: Write minimal implementation**

```python
# app/services/dashboard/widgets/base.py
"""Base class for dashboard widgets (plugin pattern, mirrors cleaning CleaningOp).

Each widget is an independent module implementing `availability` (does it have
data for this scope?) and `build` (deterministic facts from stored artifacts
only — never raw data, never the LLM). The AI never sees `build`'s output; it
only sees `describe()` metadata.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from app.schemas.dashboard import WidgetMeta


class DashboardWidget(ABC):
    type: str = ""
    title: str = ""
    description: str = ""
    applies_to_scopes: list[str] = []

    @abstractmethod
    def availability(self, ctx: "DashboardContext") -> bool:
        """Deterministic: does this widget have data for the current scope?"""

    @abstractmethod
    def build(self, ctx: "DashboardContext") -> dict:
        """Deterministic: compute the widget's facts from stored artifacts only."""

    def describe(self) -> WidgetMeta:
        return WidgetMeta(
            type=self.type,
            title=self.title,
            description=self.description,
            applies_to_scopes=self.applies_to_scopes,
        )
```

```python
# app/services/dashboard/widgets/context.py
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
```

```python
# app/services/dashboard/widgets/registry.py
"""Widget registry. Add a new widget by importing it into this module's
`REGISTRY` list — no engine change required (spec §7).
"""
from __future__ import annotations

from app.services.dashboard.widgets.base import DashboardWidget
from app.services.dashboard.widgets.charts import RecommendedChartsWidget
from app.services.dashboard.widgets.insights import AiInsightsWidget
from app.services.dashboard.widgets.kpi import KpiCardsWidget
from app.services.dashboard.widgets.quality import DataQualityWidget
from app.services.dashboard.widgets.sql import SqlWidget

REGISTRY: list[DashboardWidget] = [
    KpiCardsWidget(),
    DataQualityWidget(),
    RecommendedChartsWidget(),
    AiInsightsWidget(),
    SqlWidget(),
]


def all_widgets() -> list[DashboardWidget]:
    return list(REGISTRY)


def get_widget(widget_type: str) -> DashboardWidget | None:
    for w in REGISTRY:
        if w.type == widget_type:
            return w
    return None
```

```python
# app/services/dashboard/widgets/__init__.py
from app.services.dashboard.widgets.base import DashboardWidget
from app.services.dashboard.widgets.context import DashboardContext
from app.services.dashboard.widgets.registry import all_widgets, get_widget

__all__ = ["DashboardWidget", "DashboardContext", "all_widgets", "get_widget"]
```

```python
# app/services/dashboard/__init__.py
from app.services.dashboard.engine import assemble_context, render
from app.services.dashboard.proposer import propose_dashboard
from app.services.dashboard.widgets.catalog import build_catalog

__all__ = ["assemble_context", "render", "propose_dashboard", "build_catalog"]
```

> NOTE: `registry.py` imports the five M1 widget modules which do not exist yet.
> That import will fail until Tasks 4–8 create them. To keep this task green
> independently, create the five widget modules now as minimal stubs (Task 4–8
> fill them in), OR temporarily comment the imports. Recommended: implement
> Tasks 4–8 immediately after this task before running the full suite. The
> unit test in this task only references `base`, `context`, and `registry`
> (which fails to import until stubs exist) — so commit the base/context/registry
> code now, then proceed to Tasks 4–8.

- [ ] **Step 4: Run test to verify it passes** (after Tasks 4–8 create the widget modules)

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_dashboard_widgets.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/dashboard/widgets/base.py app/services/dashboard/widgets/context.py app/services/dashboard/widgets/registry.py app/services/dashboard/widgets/__init__.py app/services/dashboard/__init__.py tests/test_dashboard_widgets.py
git commit -m "feat(dashboards): widget base, context, registry (M1)"
```

---

### Task 3: build_catalog (deterministic assembly)

**Files:**
- Create: `app/services/dashboard/widgets/catalog.py`
- Test: `tests/test_dashboard_widgets.py` (append)

**Interfaces:**
- Consumes: `all_widgets()`, `DashboardContext`, `DashboardWidget.availability`/`build`/`describe`.
- Produces: `build_catalog(ctx) -> list[CatalogEntry]` (candidate set, registration order). Consumed by `propose_dashboard` and `render`.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_dashboard_widgets.py`:

```python
from app.services.dashboard.widgets.catalog import build_catalog
from app.schemas.understanding import DatasetProfile


def _ctx_with_profile() -> DashboardContext:
    profile = DatasetProfile(
        file_name="t.csv", file_size=10, row_count=100, column_count=3,
        column_names=["a", "b", "c"], inferred_types={"a": "numeric", "b": "categorical", "c": "numeric"},
        numeric_columns=["a", "c"], categorical_columns=["b"], date_columns=[],
        missing_values={"a": 0, "b": 0, "c": 0}, duplicate_row_count=2, null_percentage=0.0,
        unique_values={"a": 10, "b": 3, "c": 10}, basic_statistics={},
        data_quality_issues=["2 duplicate rows"], preview=[],
    )
    ds = type("DS", (), {"id": 1, "original_filename": "t.csv"})()
    ctx = DashboardContext(scope="dataset", dataset=ds, profiles={1: profile})
    return ctx


def test_build_catalog_includes_applicable_widgets():
    ctx = _ctx_with_profile()
    entries = build_catalog(ctx)
    types = [e.widget.type for e in entries]
    assert "kpi_cards" in types
    assert "data_quality" in types  # has quality issues


def test_build_catalog_skips_unavailable_widgets():
    # No EDA/understanding/sql -> recommended_charts, ai_insights, sql_widget absent
    ctx = _ctx_with_profile()
    types = [e.widget.type for e in build_catalog(ctx)]
    assert "recommended_charts" not in types
    assert "ai_insights" not in types
    assert "sql_widget" not in types


def test_build_catalog_skips_failing_widget_silently():
    ctx = _ctx_with_profile()

    class BoomWidget(DashboardWidget):
        type = "boom"; title = "Boom"; description = "x"; applies_to_scopes = ["dataset"]
        def availability(self, ctx): return True
        def build(self, ctx): raise RuntimeError("boom")

    # monkeypatch registry for this test only
    import app.services.dashboard.widgets.registry as reg
    reg.REGISTRY.insert(0, BoomWidget())
    entries = build_catalog(ctx)
    assert "boom" not in [e.widget.type for e in entries]
    reg.REGISTRY.pop(0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_dashboard_widgets.py::test_build_catalog_includes_applicable_widgets -v`
Expected: FAIL (ModuleNotFoundError: No module named 'app.services.dashboard.widgets.catalog')

- [ ] **Step 3: Write minimal implementation**

```python
# app/services/dashboard/widgets/catalog.py
"""Deterministic catalog builder.

Runs every registered widget's `availability` + `build` for the current scope
and returns the candidate `CatalogEntry` list with real, already-computed data.
A widget whose `build` raises is skipped (logged) so the dashboard always
renders. Never calls the LLM.
"""
from __future__ import annotations

import logging

from app.schemas.dashboard import CatalogEntry
from app.services.dashboard.widgets.base import DashboardWidget
from app.services.dashboard.widgets.context import DashboardContext
from app.services.dashboard.widgets.registry import all_widgets

logger = logging.getLogger(__name__)


def build_catalog(ctx: DashboardContext) -> list[CatalogEntry]:
    entries: list[CatalogEntry] = []
    for w in all_widgets():
        if ctx.scope not in w.applies_to_scopes:
            continue
        try:
            if not w.availability(ctx):
                continue
            data = w.build(ctx)
        except Exception:  # noqa: BLE001 — a bad widget must not 5xx the dashboard
            logger.exception("Dashboard widget %s failed; skipping", w.type)
            continue
        entries.append(CatalogEntry(widget=w.describe(), data=data))
    return entries
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_dashboard_widgets.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/dashboard/widgets/catalog.py tests/test_dashboard_widgets.py
git commit -m "feat(dashboards): deterministic build_catalog (M1)"
```

---

### Task 4: Widget — kpi_cards

**Files:**
- Create: `app/services/dashboard/widgets/kpi.py`
- Test: `tests/test_dashboard_widgets.py` (append)

**Interfaces:**
- Produces: `KpiCardsWidget` (`type="kpi_cards"`, `applies_to_scopes=["dataset"]`). Reads `ctx.profiles[ctx.dataset.id]`.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_dashboard_widgets.py`:

```python
from app.services.dashboard.widgets.kpi import KpiCardsWidget


def test_kpi_cards_build():
    ctx = _ctx_with_profile()
    w = KpiCardsWidget()
    assert w.type == "kpi_cards"
    assert w.applies_to_scopes == ["dataset"]
    assert w.availability(ctx) is True
    data = w.build(ctx)
    labels = {k["label"] for k in data["kpis"]}
    assert {"Rows", "Columns", "Null %", "Duplicate rows", "Quality score"} <= labels
    row_kpi = next(k for k in data["kpis"] if k["label"] == "Rows")
    assert row_kpi["value"] == 100


def test_kpi_cards_unavailable_without_profile():
    ds = type("DS", (), {"id": 1})()
    ctx = DashboardContext(scope="dataset", dataset=ds, profiles={})
    assert KpiCardsWidget().availability(ctx) is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_dashboard_widgets.py::test_kpi_cards_build -v`
Expected: FAIL (ModuleNotFoundError: No module named 'app.services.dashboard.widgets.kpi')

- [ ] **Step 3: Write minimal implementation**

```python
# app/services/dashboard/widgets/kpi.py
"""KPI cards widget — headline dataset metrics (dataset scope)."""
from __future__ import annotations

from app.services.dashboard.widgets.base import DashboardWidget
from app.services.dashboard.widgets.context import DashboardContext


def _quality_score(profile) -> int:
    # 0-100 heuristic: start at 100, subtract penalties for known issues.
    score = 100
    score -= int(min(profile.null_percentage, 50))
    score -= min(profile.duplicate_row_count, 20)
    score -= min(len(profile.data_quality_issues), 20)
    return max(0, score)


class KpiCardsWidget(DashboardWidget):
    type = "kpi_cards"
    title = "Key Metrics"
    description = "Headline dataset metrics: rows, columns, null %, duplicates, quality score."
    applies_to_scopes = ["dataset"]

    def availability(self, ctx: DashboardContext) -> bool:
        return ctx.dataset is not None and ctx.dataset.id in ctx.profiles

    def build(self, ctx: DashboardContext) -> dict:
        p = ctx.profiles[ctx.dataset.id]
        return {
            "kpis": [
                {"label": "Rows", "value": p.row_count, "hint": "total records"},
                {"label": "Columns", "value": p.column_count, "hint": "fields"},
                {"label": "Null %", "value": round(float(p.null_percentage), 1), "hint": "missing cells"},
                {"label": "Duplicate rows", "value": p.duplicate_row_count, "hint": "exact dupes"},
                {"label": "Quality score", "value": f"{_quality_score(p)}/100", "hint": "heuristic"},
            ]
        }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_dashboard_widgets.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/dashboard/widgets/kpi.py tests/test_dashboard_widgets.py
git commit -m "feat(dashboards): kpi_cards widget (M1)"
```

---

### Task 5: Widget — data_quality

**Files:**
- Create: `app/services/dashboard/widgets/quality.py`
- Test: `tests/test_dashboard_widgets.py` (append)

**Interfaces:**
- Produces: `DataQualityWidget` (`type="data_quality"`). Reads `ctx.profiles[ctx.dataset.id]`.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_dashboard_widgets.py`:

```python
from app.services.dashboard.widgets.quality import DataQualityWidget


def test_data_quality_build():
    ctx = _ctx_with_profile()
    w = DataQualityWidget()
    assert w.type == "data_quality"
    data = w.build(ctx)
    assert "2 duplicate rows" in data["issues"]
    assert data["duplicate_row_count"] == 2


def test_data_quality_absent_when_clean():
    clean = DatasetProfile(
        file_name="c.csv", file_size=1, row_count=10, column_count=1, column_names=["a"],
        inferred_types={"a": "numeric"}, numeric_columns=["a"], categorical_columns=[], date_columns=[],
        missing_values={"a": 0}, duplicate_row_count=0, null_percentage=0.0,
        unique_values={"a": 10}, basic_statistics={}, data_quality_issues=[], preview=[],
    )
    ctx = DashboardContext(scope="dataset", dataset=type("DS", (), {"id": 2})(), profiles={2: clean})
    assert DataQualityWidget().availability(ctx) is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_dashboard_widgets.py::test_data_quality_build -v`
Expected: FAIL (ModuleNotFoundError)

- [ ] **Step 3: Write minimal implementation**

```python
# app/services/dashboard/widgets/quality.py
"""Data quality widget — concrete quality issues (dataset scope)."""
from __future__ import annotations

from app.services.dashboard.widgets.base import DashboardWidget
from app.services.dashboard.widgets.context import DashboardContext


class DataQualityWidget(DashboardWidget):
    type = "data_quality"
    title = "Data Quality"
    description = "Concrete data quality issues detected during profiling."
    applies_to_scopes = ["dataset"]

    def availability(self, ctx: DashboardContext) -> bool:
        if ctx.dataset is None or ctx.dataset.id not in ctx.profiles:
            return False
        p = ctx.profiles[ctx.dataset.id]
        return bool(p.data_quality_issues) or p.duplicate_row_count > 0 or float(p.null_percentage) > 0

    def build(self, ctx: DashboardContext) -> dict:
        p = ctx.profiles[ctx.dataset.id]
        return {
            "issues": list(p.data_quality_issues),
            "null_percentage": round(float(p.null_percentage), 1),
            "duplicate_row_count": p.duplicate_row_count,
        }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_dashboard_widgets.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/dashboard/widgets/quality.py tests/test_dashboard_widgets.py
git commit -m "feat(dashboards): data_quality widget (M1)"
```

---

### Task 6: Widget — recommended_charts

**Files:**
- Create: `app/services/dashboard/widgets/charts.py`
- Test: `tests/test_dashboard_widgets.py` (append)

**Interfaces:**
- Produces: `RecommendedChartsWidget` (`type="recommended_charts"`). Reads `ctx.eda_results[ctx.dataset.id]` (an `EdaResult` with `charts: list[ChartSpec]`). Exposes accepted charts, or all if none accepted.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_dashboard_widgets.py`:

```python
from app.services.dashboard.widgets.charts import RecommendedChartsWidget
from app.schemas.eda import ChartSpec, EdaResult


def _eda_ctx() -> DashboardContext:
    charts = [
        ChartSpec(id="h1", chart_type="histogram", title="A", business_question="?", explanation="", recommended_reason="", confidence=0.9, accepted=True),
        ChartSpec(id="b1", chart_type="bar", title="B", business_question="?", explanation="", recommended_reason="", confidence=0.4, accepted=False),
    ]
    eda = EdaResult(ai_available=True, charts=charts)
    ctx = DashboardContext(scope="dataset", dataset=type("DS", (), {"id": 3})(), eda_results={3: eda})
    return ctx


def test_recommended_charts_prefers_accepted():
    ctx = _eda_ctx()
    w = RecommendedChartsWidget()
    assert w.availability(ctx) is True
    data = w.build(ctx)
    ids = [c["id"] for c in data["charts"]]
    assert ids == ["h1"]  # only the accepted chart


def test_recommended_charts_falls_back_to_all_when_none_accepted():
    ctx = _eda_ctx()
    ctx.eda_results[3].charts[0].accepted = False
    data = RecommendedChartsWidget().build(ctx)
    assert {c["id"] for c in data["charts"]} == {"h1", "b1"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_dashboard_widgets.py::test_recommended_charts_prefers_accepted -v`
Expected: FAIL (ModuleNotFoundError)

- [ ] **Step 3: Write minimal implementation**

```python
# app/services/dashboard/widgets/charts.py
"""Recommended charts widget — accepted EDA charts (dataset scope)."""
from __future__ import annotations

from app.services.dashboard.widgets.base import DashboardWidget
from app.services.dashboard.widgets.context import DashboardContext


class RecommendedChartsWidget(DashboardWidget):
    type = "recommended_charts"
    title = "Recommended Charts"
    description = "Charts the human accepted during EDA (or all recommended if none accepted)."
    applies_to_scopes = ["dataset"]

    def availability(self, ctx: DashboardContext) -> bool:
        if ctx.dataset is None or ctx.dataset.id not in ctx.eda_results:
            return False
        return bool(ctx.eda_results[ctx.dataset.id].charts)

    def build(self, ctx: DashboardContext) -> dict:
        charts = ctx.eda_results[ctx.dataset.id].charts
        accepted = [c for c in charts if c.accepted]
        chosen = accepted if accepted else charts
        return {"charts": [c.model_dump(mode="json") for c in chosen]}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_dashboard_widgets.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/dashboard/widgets/charts.py tests/test_dashboard_widgets.py
git commit -m "feat(dashboards): recommended_charts widget (M1)"
```

---

### Task 7: Widget — ai_insights

**Files:**
- Create: `app/services/dashboard/widgets/insights.py`
- Test: `tests/test_dashboard_widgets.py` (append)

**Interfaces:**
- Produces: `AiInsightsWidget` (`type="ai_insights"`). Reads `ctx.understandings[ctx.dataset.id]` (a `DatasetUnderstanding`).

- [ ] **Step 1: Write the failing test**

Append to `tests/test_dashboard_widgets.py`:

```python
from app.services.dashboard.widgets.insights import AiInsightsWidget
from app.schemas.understanding import DatasetUnderstanding


def test_ai_insights_build():
    u = DatasetUnderstanding(
        dataset_description="Sales data", business_domain_guess="Retail",
        likely_use_case="Forecasting", possible_target_column="sales",
        data_quality_summary="Clean", cleaning_recommendations=["drop nulls"],
        suggested_visualizations=["histogram"], suggested_business_questions=["trend?"],
        initial_business_observations=["seasonal"], confidence_score=0.8,
    )
    ctx = DashboardContext(scope="dataset", dataset=type("DS", (), {"id": 4})(), understandings={4: u})
    w = AiInsightsWidget()
    assert w.availability(ctx) is True
    data = w.build(ctx)
    assert data["dataset_description"] == "Sales data"
    assert "Retail" in data["domain"]
    assert "seasonal" in data["observations"]
    assert data["ai_available"] is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_dashboard_widgets.py::test_ai_insights_build -v`
Expected: FAIL (ModuleNotFoundError)

- [ ] **Step 3: Write minimal implementation**

```python
# app/services/dashboard/widgets/insights.py
"""AI insights widget — the dataset-understanding interpretation (dataset scope)."""
from __future__ import annotations

from app.services.dashboard.widgets.base import DashboardWidget
from app.services.dashboard.widgets.context import DashboardContext


class AiInsightsWidget(DashboardWidget):
    type = "ai_insights"
    title = "AI Insights"
    description = "What the AI understood about this dataset: domain, use case, observations."
    applies_to_scopes = ["dataset"]

    def availability(self, ctx: DashboardContext) -> bool:
        return ctx.dataset is not None and ctx.dataset.id in ctx.understandings

    def build(self, ctx: DashboardContext) -> dict:
        u = ctx.understandings[ctx.dataset.id]
        return {
            "dataset_description": u.dataset_description,
            "domain": u.business_domain_guess,
            "use_case": u.likely_use_case,
            "target_column": u.possible_target_column,
            "observations": list(u.initial_business_observations),
            "suggested_questions": list(u.suggested_business_questions),
            "ai_available": u.ai_available,
        }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_dashboard_widgets.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/dashboard/widgets/insights.py tests/test_dashboard_widgets.py
git commit -m "feat(dashboards): ai_insights widget (M1)"
```

---

### Task 8: Widget — sql_widget

**Files:**
- Create: `app/services/dashboard/widgets/sql.py`
- Test: `tests/test_dashboard_widgets.py` (append)

**Interfaces:**
- Produces: `SqlWidget` (`type="sql_widget"`). Reads `ctx.sql_history` (list of `SqlQuery` ORM rows for this dataset).

- [ ] **Step 1: Write the failing test**

Append to `tests/test_dashboard_widgets.py`:

```python
from app.services.dashboard.widgets.sql import SqlWidget


def test_sql_widget_build():
    q = type("Q", (), {
        "id": 9, "business_question": "top region?", "sql": "SELECT 1",
        "explanation": "x", "suggested_visualization": {"chart_type": "bar"},
        "executed_at": "2026-07-17T00:00:00+00:00",
    })()
    ctx = DashboardContext(scope="dataset", dataset=type("DS", (), {"id": 5})(), sql_history=[q])
    w = SqlWidget()
    assert w.availability(ctx) is True
    data = w.build(ctx)
    assert data["queries"][0]["business_question"] == "top region?"
    assert data["queries"][0]["suggested_visualization"]["chart_type"] == "bar"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_dashboard_widgets.py::test_sql_widget_build -v`
Expected: FAIL (ModuleNotFoundError)

- [ ] **Step 3: Write minimal implementation**

```python
# app/services/dashboard/widgets/sql.py
"""SQL widget — recent executed queries for this dataset (dataset scope)."""
from __future__ import annotations

from app.services.dashboard.widgets.base import DashboardWidget
from app.services.dashboard.widgets.context import DashboardContext


class SqlWidget(DashboardWidget):
    type = "sql_widget"
    title = "Recent SQL Analysis"
    description = "Questions the analyst asked and ran against this dataset."
    applies_to_scopes = ["dataset"]

    def availability(self, ctx: DashboardContext) -> bool:
        return bool(ctx.sql_history)

    def build(self, ctx: DashboardContext) -> dict:
        queries = [
            {
                "id": q.id,
                "business_question": q.business_question,
                "sql": q.sql,
                "explanation": q.explanation,
                "suggested_visualization": q.suggested_visualization,
                "executed_at": q.executed_at.isoformat() if q.executed_at else None,
            }
            for q in ctx.sql_history
        ]
        return {"queries": queries}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_dashboard_widgets.py -v`
Expected: PASS (the full suite now imports cleanly — registry stubs are real)

- [ ] **Step 5: Commit**

```bash
git add app/services/dashboard/widgets/sql.py tests/test_dashboard_widgets.py
git commit -m "feat(dashboards): sql_widget widget (M1)"
```

---

### Task 9: Proposer (AI curation + deterministic fallback)

**Files:**
- Create: `app/services/dashboard/proposer.py`
- Test: `tests/test_dashboard_proposer.py`

**Interfaces:**
- Consumes: `build_catalog` output (`list[CatalogEntry]`), `DashboardContext`, `complete_json` (from `app.services.llm`).
- Produces: `propose_dashboard(catalog, ctx) -> tuple[DashboardSpec, bool]` and `_fallback_spec(catalog, ctx) -> DashboardSpec`. Consumed by the route (Task 11) and `render`.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_dashboard_proposer.py
import pytest

from app.schemas.dashboard import CatalogEntry, DashboardSpec, WidgetMeta
from app.services.dashboard.proposer import _fallback_spec, propose_dashboard
from app.services.dashboard.widgets.context import DashboardContext


def _catalog() -> list[CatalogEntry]:
    return [
        CatalogEntry(widget=WidgetMeta(type="kpi_cards", title="K", description="d", applies_to_scopes=["dataset"]), data={}),
        CatalogEntry(widget=WidgetMeta(type="data_quality", title="Q", description="d", applies_to_scopes=["dataset"]), data={}),
    ]


def test_fallback_spec_shows_all_widgets():
    ctx = DashboardContext(scope="dataset")
    spec = _fallback_spec(_catalog(), ctx)
    assert spec.scope == "dataset"
    assert set(spec.widget_order) == {"kpi_cards", "data_quality"}
    assert spec.ai_summary is None


async def test_propose_falls_back_without_api_key(monkeypatch):
    # complete_json raises when OPENROUTER_API_KEY is unset; proposer must catch it.
    import app.services.dashboard.proposer as P
    monkeypatch.setattr(P, "complete_json", staticmethod(lambda *a, **k: (_ for _ in ()).throw(RuntimeError("no key"))))
    ctx = DashboardContext(scope="dataset")
    spec, ok = await propose_dashboard(_catalog(), ctx)
    assert ok is False
    assert spec.ai_summary is None
    assert set(spec.widget_order) == {"kpi_cards", "data_quality"}


async def test_propose_success_orders_and_groups(monkeypatch):
    import app.services.dashboard.proposer as P

    async def fake(system, user, model=None):
        return {
            "widget_order": ["data_quality", "kpi_cards"],
            "groups": [{"title": "Overview", "widget_types": ["kpi_cards", "data_quality"]}],
            "ai_summary": {"executive": "Looks clean.", "per_widget": {}, "next_analyses": ["Check correlations"]},
        }

    monkeypatch.setattr(P, "complete_json", fake)
    ctx = DashboardContext(scope="dataset")
    spec, ok = await propose_dashboard(_catalog(), ctx)
    assert ok is True
    assert spec.widget_order == ["data_quality", "kpi_cards"]
    assert spec.groups[0]["title"] == "Overview"
    assert spec.ai_summary["executive"] == "Looks clean."


async def test_propose_drops_unknown_widget_types(monkeypatch):
    import app.services.dashboard.proposer as P

    async def fake(system, user, model=None):
        return {"widget_order": ["kpi_cards", "not_a_widget"], "ai_summary": {"executive": "x", "per_widget": {}, "next_analyses": []}}

    monkeypatch.setattr(P, "complete_json", fake)
    ctx = DashboardContext(scope="dataset")
    spec, ok = await propose_dashboard(_catalog(), ctx)
    assert "not_a_widget" not in spec.widget_order
    assert "kpi_cards" in spec.widget_order
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_dashboard_proposer.py -v`
Expected: FAIL (ModuleNotFoundError: No module named 'app.services.dashboard.proposer')

- [ ] **Step 3: Write minimal implementation**

```python
# app/services/dashboard/proposer.py
"""Best-effort AI curation of the deterministic widget catalog.

Sends catalog *metadata only* (widget types, titles, descriptions, scope) to
the LLM and asks it to select / order / group widgets and write the executive
summary, per-widget insights, and recommended next analyses. On ANY failure
(LLM unavailable, invalid JSON, validation error) it falls back to showing all
widgets in registration order with no AI summary — the dashboard always
renders. The AI never sees widget data and never invents widgets.
"""
from __future__ import annotations

import json

from pydantic import ValidationError

from app.schemas.dashboard import CatalogEntry, DashboardSpec
from app.services.dashboard.widgets.context import DashboardContext
from app.services.llm import complete_json

_SYSTEM = (
    "You are a senior data analyst curating a dashboard for a user. You are given "
    "a list of AVAILABLE dashboard widgets (metadata only, never their data). "
    "Decide which to surface, in what order, and how to group them. Also write a "
    "short executive summary, a per-widget 'why it matters' note, and 2-3 "
    "recommended next analyses. Respond JSON only: {\"widget_order\": [types...], "
    "\"groups\": [{\"title\": str, \"widget_types\": [types...]}], \"ai_summary\": "
    "{\"executive\": str, \"per_widget\": {type: str}, \"next_analyses\": [str]}}."
)


async def propose_dashboard(
    catalog: list[CatalogEntry], ctx: DashboardContext
) -> tuple[DashboardSpec, bool]:
    types = [e.widget.type for e in catalog]
    if not types:
        return _fallback_spec(catalog, ctx), False
    try:
        user_prompt = json.dumps(
            [e.widget.model_dump() for e in catalog], indent=2
        )
        data = await complete_json(_SYSTEM, user_prompt)
        raw_order = data.get("widget_order", []) if isinstance(data, dict) else []
        order = [t for t in raw_order if t in types]
        for t in types:  # ensure every available widget is represented
            if t not in order:
                order.append(t)
        groups = [
            g for g in (data.get("groups", []) or [])
            if isinstance(g, dict) and all(wt in types for wt in g.get("widget_types", []))
        ]
        summary = data.get("ai_summary") if isinstance(data, dict) else None
        return DashboardSpec(scope=ctx.scope, widget_order=order, groups=groups, ai_summary=summary), True
    except (Exception, ValidationError):
        return _fallback_spec(catalog, ctx), False


def _fallback_spec(catalog: list[CatalogEntry], ctx: DashboardContext) -> DashboardSpec:
    order = [e.widget.type for e in catalog]
    return DashboardSpec(scope=ctx.scope, widget_order=order, ai_summary=None)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_dashboard_proposer.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/dashboard/proposer.py tests/test_dashboard_proposer.py
git commit -m "feat(dashboards): AI proposer with deterministic fallback (M1)"
```

---

### Task 10: Engine — assemble_context + render

**Files:**
- Create: `app/services/dashboard/engine.py`
- Test: `tests/test_dashboard_engine.py`

**Interfaces:**
- Consumes: `build_catalog`, `DashboardContext`, `DatasetProfile`/`DatasetUnderstanding`/`EdaResult` model_validate, `SqlQuery` (select).
- Produces: `assemble_context(session, project, dataset, user) -> DashboardContext` and `render(spec, ctx, ai_available=True) -> DashboardView`. Consumed by the route (Task 11).

- [ ] **Step 1: Write the failing test**

```python
# tests/test_dashboard_engine.py
from app.schemas.dashboard import CatalogEntry, DashboardSpec, WidgetMeta
from app.services.dashboard.engine import render
from app.services.dashboard.widgets.context import DashboardContext


def _ctx() -> DashboardContext:
    entries = [
        CatalogEntry(widget=WidgetMeta(type="kpi_cards", title="K", description="d", applies_to_scopes=["dataset"]), data={"kpis": []}),
        CatalogEntry(widget=WidgetMeta(type="data_quality", title="Q", description="d", applies_to_scopes=["dataset"]), data={"issues": []}),
    ]
    ctx = DashboardContext(scope="dataset")
    # inject entries directly via the registry-independent path by monkeypatching
    import app.services.dashboard.engine as E
    E.build_catalog = lambda c: entries  # type: ignore
    return ctx


def test_render_honors_widget_order_and_hidden():
    ctx = _ctx()
    spec = DashboardSpec(scope="dataset", widget_order=["data_quality", "kpi_cards"], hidden_widgets=["kpi_cards"])
    view = render(spec, ctx, ai_available=True)
    assert [w.widget.type for w in view.widgets] == ["data_quality"]
    assert view.ai_available is True


def test_render_empty_order_uses_catalog_order():
    ctx = _ctx()
    spec = DashboardSpec(scope="dataset", widget_order=[])
    view = render(spec, ctx, ai_available=False)
    assert [w.widget.type for w in view.widgets] == ["kpi_cards", "data_quality"]
    assert view.ai_available is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_dashboard_engine.py -v`
Expected: FAIL (ModuleNotFoundError: No module named 'app.services.dashboard.engine')

- [ ] **Step 3: Write minimal implementation**

```python
# app/services/dashboard/engine.py
"""Dashboard engine: build the request context and render a resolved view.

`assemble_context` reads ONLY stored artifacts (profile/understanding/eda/sql
history) — never reparses the uploaded file. `render` resolves the saved spec
against the live context, honoring widget order + hidden widgets.
"""
from __future__ import annotations

from sqlmodel import select

from app.schemas.dashboard import DashboardSpec, DashboardView
from app.schemas.understanding import DatasetProfile, DatasetUnderstanding
from app.services.dashboard.widgets.catalog import build_catalog
from app.services.dashboard.widgets.context import DashboardContext
from app.models.sql_query import SqlQuery


def assemble_context(session, project, dataset, user) -> DashboardContext:
    profile = DatasetProfile.model_validate(dataset.profile) if dataset.profile else None
    understanding = (
        DatasetUnderstanding.model_validate(dataset.understanding)
        if dataset.understanding
        else None
    )
    eda = None
    if dataset.eda:
        from app.schemas.eda import EdaResult

        eda = EdaResult.model_validate(dataset.eda)
    sql_history = session.exec(
        select(SqlQuery)
        .where(SqlQuery.dataset_id == dataset.id, SqlQuery.owner_id == user.id)
        .order_by(SqlQuery.executed_at.desc())
        .limit(20)
    ).all()
    return DashboardContext(
        scope="dataset",
        project=project,
        dataset=dataset,
        dataset_version_id=dataset.id,
        profiles={dataset.id: profile} if profile else {},
        understandings={dataset.id: understanding} if understanding else {},
        eda_results={dataset.id: eda} if eda else {},
        sql_history=list(sql_history),
        reports=[],
        lineage={},
    )


def render(spec: DashboardSpec, ctx: DashboardContext, ai_available: bool = True) -> DashboardView:
    catalog = build_catalog(ctx)
    by_type = {e.widget.type: e for e in catalog}
    order = spec.widget_order or list(by_type.keys())
    widgets = []
    for t in order:
        if t in spec.hidden_widgets:
            continue
        entry = by_type.get(t)
        if entry is None:
            continue
        widgets.append(entry)
    return DashboardView(scope=ctx.scope, spec=spec, widgets=widgets, ai_available=ai_available)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_dashboard_engine.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/dashboard/engine.py tests/test_dashboard_engine.py
git commit -m "feat(dashboards): assemble_context + render (M1)"
```

---

### Task 11: Route — POST /preview (dataset scope, ephemeral)

**Files:**
- Create: `app/api/routes/dashboards.py`
- Modify: `app/main.py` (import + mount router)
- Test: `tests/manual_dashboard_e2e.py`

**Interfaces:**
- Consumes: `assemble_context`, `build_catalog`, `propose_dashboard`, `render`, `DashboardPreviewRequest`, `Dataset`/`Project` models, `CurrentUser`/`SessionDep`.
- Produces: `POST /api/v1/dashboards/preview` → `DashboardView` (409 before profile; 422 project scope in M1; 404 unknown dataset; 403 not owner).

- [ ] **Step 1: Write the route**

```python
# app/api/routes/dashboards.py
"""Dashboards routes (M1: ephemeral dataset-scope preview).

- `POST /preview` — build the deterministic catalog for a dataset, run the
  best-effort AI proposer, and return a resolved `DashboardView`. Nothing is
  persisted (persistence + HITL editing land in M3). 409 if the dataset is
  unprofiled; 422 for project scope (M2); 404 unknown; 403 not owner.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUser, SessionDep
from app.models.dataset import Dataset
from app.models.project import Project
from app.schemas.dashboard import DashboardPreviewRequest, DashboardView
from app.services.dashboard.engine import assemble_context, render
from app.services.dashboard.proposer import propose_dashboard
from app.services.dashboard.widgets.catalog import build_catalog

router = APIRouter(prefix="/dashboards", tags=["dashboards"])


@router.post("/preview", response_model=DashboardView)
async def preview_dashboard(
    body: DashboardPreviewRequest, session: SessionDep, current_user: CurrentUser
) -> DashboardView:
    if body.scope != "dataset":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Project-scope dashboards arrive in M2.",
        )
    if body.dataset_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="dataset_id is required for dataset scope.",
        )
    dataset = session.get(Dataset, body.dataset_id)
    if dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    if dataset.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your dataset")
    if dataset.profile is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Dataset is not analyzed yet. Run Analyze first.",
        )
    project = session.get(Project, dataset.project_id)
    ctx = assemble_context(session, project, dataset, current_user)
    catalog = build_catalog(ctx)
    spec, ai_available = await propose_dashboard(catalog, ctx)
    return render(spec, ctx, ai_available=ai_available)
```

- [ ] **Step 2: Mount the router in main.py**

In `app/main.py`, change the import line and add the include:

```python
from app.api.routes import auth, cleaning, datasets, dashboards, eda, projects, reports, sql, users
```
and after the reports include:
```python
app.include_router(dashboards.router, prefix=API_PREFIX)
```

- [ ] **Step 3: Write the e2e test**

```python
# tests/manual_dashboard_e2e.py
# Manual e2e — requires a live Postgres (DATABASE_URL). Not run in unit CI.
import io

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)  # runs migrations on startup


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_dashboard_preview_e2e():
    email = "dashboard_e2e@example.com"
    client.post("/api/v1/auth/register", json={"email": email, "password": "pw"})
    tok = client.post("/api/v1/auth/login", data={"username": email, "password": "pw"}).json()["access_token"]
    h = _auth(tok)
    pid = client.post("/api/v1/projects", json={"name": "p", "description": "d"}, headers=h).json()["id"]

    csv = b"region,score\nnorth,10\nsouth,20\nwest,5\n"
    did = client.post(
        f"/api/v1/datasets/projects/{pid}",
        headers=h, files={"file": ("t.csv", io.BytesIO(csv), "text/csv")},
    ).json()["id"]

    # 409 before analysis
    r = client.post("/api/v1/dashboards/preview", json={"scope": "dataset", "dataset_id": did}, headers=h)
    assert r.status_code == 409

    # analyze (profile) + eda + a sql run so widgets have data
    client.post(f"/api/v1/datasets/{did}/understand", headers=h)
    client.post(f"/api/v1/datasets/{did}/eda", headers=h)
    gen = client.post("/api/v1/sql/generate", json={"dataset_id": did, "question": "top region by score"}, headers=h).json()
    client.post("/api/v1/sql/run", json={"dataset_id": did, "sql": gen["sql"], "business_question": "top region"}, headers=h)

    # project scope rejected in M1
    rp = client.post("/api/v1/dashboards/preview", json={"scope": "project", "project_id": pid}, headers=h)
    assert rp.status_code == 422

    # dataset preview returns resolved widgets
    view = client.post("/api/v1/dashboards/preview", json={"scope": "dataset", "dataset_id": did}, headers=h).json()
    types = [w["widget"]["type"] for w in view["widgets"]]
    assert "kpi_cards" in types
    assert "data_quality" in types
    assert "recommended_charts" in types
    assert "ai_insights" in types
    assert "sql_widget" in types
    assert view["scope"] == "dataset"
```

- [ ] **Step 4: Run the e2e (requires live Postgres)**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/manual_dashboard_e2e.py -v`
Expected: PASS

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest -v`
Expected: all pass (including existing eda/sql/report tests)

- [ ] **Step 6: Commit**

```bash
git add app/api/routes/dashboards.py app/main.py tests/manual_dashboard_e2e.py
git commit -m "feat(dashboards): POST /preview route (dataset scope, M1)"
```

---

### Task 12: Frontend — types, API client, read-only renderer

**Files:**
- Modify: `frontend/lib/types.ts`
- Modify: `frontend/lib/api.ts`
- Create: `frontend/components/dashboard-renderer.tsx`

**Interfaces:**
- Consumes (backend): `POST /api/v1/dashboards/preview` → `DashboardView`.
- Produces: `dashboardsApi.preview(req)`, `DashboardView`/`DashboardSpec`/`CatalogEntry`/`WidgetMeta` types, `DashboardRenderer` component. (M1 is read-only — no editor yet; the editor is M3.)

- [ ] **Step 1: Add dashboard types to `lib/types.ts`**

Append to `frontend/lib/types.ts`:

```ts
export interface WidgetMeta {
  type: string;
  title: string;
  description: string;
  applies_to_scopes: string[];
}

export interface CatalogEntry {
  widget: WidgetMeta;
  data: Record<string, unknown>;
}

export interface DashboardSpec {
  scope: "dataset" | "project";
  widget_order: string[];
  hidden_widgets: string[];
  groups: { title: string; widget_types: string[] }[];
  ai_summary: {
    executive: string;
    per_widget: Record<string, string>;
    next_analyses: string[];
  } | null;
  user_notes: Record<string, string> | null;
}

export interface DashboardView {
  scope: string;
  spec: DashboardSpec;
  widgets: CatalogEntry[];
  ai_available: boolean;
}

export interface DashboardPreviewRequest {
  scope: string;
  project_id?: number;
  dataset_id?: number;
}
```

- [ ] **Step 2: Add `dashboardsApi` to `lib/api.ts`**

Append inside the `export const dashboardsApi = { ... }` object (add after the `reportsApi` block):

```ts
export const dashboardsApi = {
  // Ephemeral dataset-scope preview (M1). Returns a resolved DashboardView.
  preview(req: DashboardPreviewRequest): Promise<DashboardView> {
    return request<DashboardView>("/api/v1/dashboards/preview", {
      method: "POST",
      body: JSON.stringify(req),
    });
  },
};
```

- [ ] **Step 3: Create the read-only renderer**

```tsx
// frontend/components/dashboard-renderer.tsx
"use client";

import {
  AlertTriangle,
  BarChart3,
  Database,
  Lightbulb,
  MessageSquare,
  Sparkles,
} from "lucide-react";

import type { CatalogEntry, DashboardView } from "@/lib/types";
import { ChartRenderer } from "@/components/chart-renderer";
import type { ChartSpec } from "@/lib/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function IconFor({ type }: { type: string }) {
  const map: Record<string, typeof Sparkles> = {
    kpi_cards: Database,
    data_quality: AlertTriangle,
    recommended_charts: BarChart3,
    ai_insights: Lightbulb,
    sql_widget: MessageSquare,
  };
  const I = map[type] ?? Sparkles;
  return <I className="h-4 w-4" />;
}

function KpiCards({ data }: { data: Record<string, unknown> }) {
  const kpis = (data.kpis as { label: string; value: unknown; hint?: string }[]) ?? [];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {kpis.map((k) => (
        <div key={k.label} className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground">{k.label}</div>
          <div className="text-xl font-semibold">{String(k.value)}</div>
          {k.hint && <div className="text-[10px] text-muted-foreground">{k.hint}</div>}
        </div>
      ))}
    </div>
  );
}

function DataQuality({ data }: { data: Record<string, unknown> }) {
  const issues = (data.issues as string[]) ?? [];
  return (
    <ul className="flex flex-col gap-1">
      {issues.map((i, idx) => (
        <li key={idx} className="flex items-start gap-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{i}</span>
        </li>
      ))}
    </ul>
  );
}

function RecommendedCharts({ data }: { data: Record<string, unknown> }) {
  const charts = (data.charts as ChartSpec[]) ?? [];
  if (charts.length === 0) return <p className="text-sm text-muted-foreground">No accepted charts yet.</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {charts.map((c) => (
        <div key={c.id} className="rounded-md border p-3">
          <div className="mb-2 text-sm font-medium">{c.title}</div>
          <ChartRenderer spec={c} />
        </div>
      ))}
    </div>
  );
}

function AiInsights({ data }: { data: Record<string, unknown> }) {
  const obs = (data.observations as string[]) ?? [];
  return (
    <div className="flex flex-col gap-2 text-sm">
      {data.dataset_description ? <p>{String(data.dataset_description)}</p> : null}
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        {data.domain ? <span>Domain: {String(data.domain)}</span> : null}
        {data.use_case ? <span>· Use case: {String(data.use_case)}</span> : null}
      </div>
      {obs.length > 0 && (
        <ul className="flex flex-col gap-1">
          {obs.map((o, i) => (
            <li key={i}>• {o}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SqlWidgetView({ data }: { data: Record<string, unknown> }) {
  const queries = (data.queries as Record<string, unknown>[]) ?? [];
  if (queries.length === 0) return <p className="text-sm text-muted-foreground">No SQL analysis yet.</p>;
  return (
    <div className="flex flex-col gap-3">
      {queries.map((q) => (
        <div key={q.id as number} className="rounded-md border p-3">
          <div className="text-sm font-medium">{String(q.business_question)}</div>
          <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-xs">{String(q.sql)}</pre>
          {q.suggested_visualization ? (
            <ChartRenderer spec={q.suggested_visualization as ChartSpec} />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function WidgetBody({ entry }: { entry: CatalogEntry }) {
  switch (entry.widget.type) {
    case "kpi_cards":
      return <KpiCards data={entry.data} />;
    case "data_quality":
      return <DataQuality data={entry.data} />;
    case "recommended_charts":
      return <RecommendedCharts data={entry.data} />;
    case "ai_insights":
      return <AiInsights data={entry.data} />;
    case "sql_widget":
      return <SqlWidgetView data={entry.data} />;
    default:
      return <p className="text-sm text-muted-foreground">Unknown widget: {entry.widget.type}</p>;
  }
}

export function DashboardRenderer({ view }: { view: DashboardView }) {
  return (
    <div className="flex flex-col gap-4">
      {!view.ai_available && (
        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          Rule-based dashboard (AI suggestions unavailable).
        </div>
      )}
      {view.spec.ai_summary?.executive && (
        <p className="text-sm text-muted-foreground">{view.spec.ai_summary.executive}</p>
      )}
      {view.widgets.map((entry) => (
        <Card key={entry.widget.type}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <IconFor type={entry.widget.type} />
              {entry.widget.title}
            </CardTitle>
            <CardDescription>{entry.widget.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <WidgetBody entry={entry} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck, lint, build**

Run: `cd frontend && npx tsc --noEmit && npx next lint && npx next build`
Expected: all pass (no type errors; build succeeds)

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/types.ts frontend/lib/api.ts frontend/components/dashboard-renderer.tsx
git commit -m "feat(dashboards): read-only renderer + types + api client (M1)"
```

---

## Self-Review (completed against spec §1–§15)

1. **Spec coverage (M1):** engine + widget registry (§4, §6) → Tasks 2–3; M1 widgets kpi/quality/charts/insights/sql (§7) → Tasks 4–8; AI curation + fallback (§6.4, §10) → Task 9; deterministic catalog (§6.3) → Task 3; render resolves live data (§5, §6.5) → Task 10; on-demand `POST /preview` dataset scope (§8, §13 M1) → Task 11; read-only `dashboard-renderer` reusing `ChartRenderer` (§9) → Task 12. Project scope, persistence, HITL editor, and entry points are explicitly deferred to M2/M3.
2. **Placeholder scan:** No "TBD"/"TODO"/"implement later". Every code step shows full implementation. The registry-import-ordering note in Task 2 is an execution caveat, not a placeholder.
3. **Type consistency:** `DashboardWidget` (type/title/description/applies_to_scopes + `availability`/`build`/`describe`) is used consistently in `registry.py`, `catalog.py`, and all five widget modules. `DashboardContext` fields (`scope`, `dataset`, `profiles`, `understandings`, `eda_results`, `sql_history`) match between `context.py`, widgets, `engine.assemble_context`, and `render`/`build_catalog`. `DashboardSpec`/`DashboardView`/`WidgetMeta`/`CatalogEntry` match between `schemas/dashboard.py` and the frontend `types.ts`. `propose_dashboard(catalog, ctx) -> tuple[DashboardSpec, bool]` is used identically in the route and the proposer test. `render(spec, ctx, ai_available)` signature matches the route call.

**M1 is complete and independently testable.** Review it, then we build M2 (project scope + remaining widgets) and M3 (persistence + HITL editor + entry points) as separate, reviewed milestones.
