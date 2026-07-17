# Dashboard Recommendations — Design Spec

- **Date:** 2026-07-17
- **Milestone:** Dashboard Recommendations (next pending milestone; target 2026-09-10)
- **Status:** Design approved
- **Sprint:** Sprint 4 — Dashboard Recommendations
- **Build sequence:** M1 (engine + dataset scope core) → M2 (project scope + remaining widgets) → M3 (persistence + HITL editor + entry points)

## 1. Summary

Dashboard Recommendations is the platform's **visual-first consumption layer**.
Where Reports assemble a *narrative* (prose + artifact references) and EDA produces a
*candidate list* of charts, a **Dashboard** is a curated, widget-grid view of a
project's analysis — KPI tiles, recommended charts, AI insight cards, SQL widgets,
cleaning/version timelines, recent reports, and activity — rendered for either a
single **dataset** or an entire **project**.

It follows the standing InsightFlow principle exactly:

> **Deterministic code computes all widget facts → AI selects/orders/groups widgets
> and writes prose → Human accepts/rejects/reorders/saves → Renderer resolves live
> data.**

A single reusable **dashboard engine** serves both scopes. The *scope* decides the
data source; the renderer is scope-independent. Widgets are independent, registered
modules — adding future widgets needs no engine change.

## 2. Goals

- One **dashboard engine** that renders both **dataset-scoped** and **project-scoped**
  dashboards from a shared widget registry.
- A **deterministic widget catalog** built first from stored project artifacts
  (profiles, understanding, accepted EDA charts, SQL history, reports, lineage).
- **Best-effort AI curation**: select relevant widgets, order them, group them, and
  write the executive summary, per-widget insight cards, and recommended-next-analyses
  — with a deterministic "show all / template summary" fallback. AI never invents
  widgets or computes facts.
- **Human-in-the-loop editing**: accept/reject (hide) widgets, reorder, add per-widget
  notes, regenerate AI recommendations, and save — like Reports.
- **Persistence** as a project asset: a saved `Dashboard` row holds the *spec* (config
  only), never rendered data. The renderer resolves live data from the latest
  artifacts at render time unless a future snapshot feature is explicitly requested.
- Always functional regardless of AI availability (no 5xx from LLM failure).

## 3. Non-goals (this milestone)

- **Public share link** for dashboards (future extension; Reports already have it).
- **Dashboard versioning** (`parent_dashboard_id`) — schema is designed-for, not built.
- **Snapshot/export** (PDF/PNG) — designed-for, not built.
- **Dashboard analytics** (views/downloads) — designed-for, not built.
- **Collaboration** (comments, multi-user editing) — out of scope.

## 4. Architecture

```
Dashboard Engine
   ↓
Scope Resolver        (dataset scope OR project scope → resolves artifacts)
   ↓
Deterministic Catalog (build_catalog: availability + build for every registered widget)
   ↓
Proposer (best-effort AI)  →  DashboardSpec  (selection / order / groups / prose)
   ↓                                              ↓ (deterministic fallback on AI failure)
Renderer (scope-independent)  ←  DashboardView (live data resolved from latest artifacts)
```

The renderer never depends on scope — it maps `widget.type` → a component and feeds
it the widget's live `WidgetData`.

## 5. Data model & storage

New `Dashboard` SQLModel (`app/models/dashboard.py`) + Alembic migration
(`h9i0j1k2l3m4_add_dashboards_table.py`, chained after `g8h9i0j1k2l3_add_reports_table.py`):

| Field | Type | Notes |
|---|---|---|
| `id` | PK int | |
| `project_id` | FK → projects (indexed) | |
| `owner_id` | FK → users (indexed) | |
| `scope` | `"dataset"` \| `"project"` | |
| `dataset_id` | FK → datasets (nullable, indexed) | set only for dataset scope |
| `dataset_version_id` | int (nullable) | version reference captured at generation |
| `title` | str | editable |
| `spec` | JSON | canonical `DashboardSpec` |
| `ai_available` | bool | False when fell back |
| `refreshed_at` | datetime | |
| `created_at` / `updated_at` | datetime | |

**`DashboardSpec` (the stored JSON — config only, never rendered data):**
```json
{
  "scope": "dataset|project",
  "widget_order": ["kpi_cards", "recommended_charts", "ai_insights", ...],
  "hidden_widgets": [],
  "groups": [
    { "title": "Overview", "widget_types": ["kpi_cards", "data_quality"] }
  ],
  "ai_summary": {
    "executive": "This dataset shows...",
    "per_widget": { "recommended_charts": "These charts matter because..." },
    "next_analyses": ["Investigate correlation between X and Y", "..."]
  } | null,
  "user_notes": { "kpi_cards": "Note for the team...", ... } | null
}
```

A dedicated `dashboards` table (not a JSON column on `Dataset`/`Project`) so a project
can hold multiple dashboards + future history, and so future analytics/versioning
columns slot in cleanly — same rationale as `reports`.

## 6. Backend engine — `app/services/dashboard/`

```
dashboard/
  widgets/
    base.py        # DashboardWidget ABC
    registry.py    # all_widgets(), get_widget(type)
    context.py     # DashboardContext dataclass
    catalog.py     # build_catalog(ctx) -> Catalog
    kpi.py         # kpi_cards (dataset + project variants)
    quality.py     # data_quality
    charts.py      # recommended_charts
    insights.py    # ai_insights
    sql.py         # sql_widget
    cleaning.py    # cleaning_history / version_timeline
    reports.py     # recent_reports
    activity.py    # activity_feed
    next.py        # recommended_next
    summaries.py   # dataset_summaries (project scope)
  engine.py        # assemble_context(), build_catalog(), propose(), render()
  proposer.py      # propose_dashboard(), _fallback_spec()
  __init__.py      # exports
```

### 6.1 `DashboardWidget` (ABC) — mirrors the cleaning `CleaningOp` plugin pattern

```python
class DashboardWidget(ABC):
    type: str                     # unique registry key, e.g. "kpi_cards"
    applies_to_scopes: list[str]  # ["dataset"], ["project"], or both

    @abstractmethod
    def availability(self, ctx: DashboardContext) -> WidgetAvailability:
        """Deterministic. Does this widget have data for this scope/dataset?"""

    @abstractmethod
    def build(self, ctx: DashboardContext) -> WidgetData:
        """Deterministic. Compute the widget's facts from stored artifacts only."""

    def describe(self) -> WidgetMeta:
        """Metadata for the AI: title, description, why-relevant template, scope."""
```

- Each `build()` works only on `ctx` (resolved artifacts) — **never raw data, never the
  LLM**.
- A failing `build()` is caught by the engine, the widget is skipped (logged), and the
  dashboard still renders. No 5xx from a widget error.

### 6.2 `DashboardContext` (`widgets/context.py`)

A dataclass carrying the resolved artifacts the widgets read:

```python
@dataclass
class DashboardContext:
    project: ProjectRead
    scope: Literal["dataset", "project"]
    dataset: DatasetRead | None          # for dataset scope
    dataset_version_id: int | None
    profiles: dict[int, DatasetProfile]  # dataset_id -> profile
    understandings: dict[int, DatasetUnderstanding]
    eda_results: dict[int, EdaResult]    # accepted charts only
    sql_history: list[SqlQueryRecord]
    reports: list[ReportRead]
    lineage: dict[int, list[DatasetRead]]  # root_id -> version chain
```

`engine.assemble_context()` builds this from the repo + storage adapter, reading the
*stored* profile/understanding/eda — never reparsing uploaded files (standing rule).

### 6.3 `build_catalog` (deterministic) — `widgets/catalog.py`

Runs `availability()` then `build()` for every registered widget whose
`applies_to_scopes` includes the current scope. Returns a `Catalog`:
`list[CatalogEntry]` where each entry has `widget.type`, `describe()` metadata, and the
deterministic `WidgetData`. This is the candidate set the AI chooses from.

### 6.4 `propose_dashboard` (best-effort AI) — `proposer.py`

Sends the catalog **metadata only** (widget types, titles, descriptions, scope — never
the `WidgetData` payloads, never raw data) to `complete_json`, asking for:
```json
{
  "widget_order": ["kpi_cards", "recommended_charts", ...],
  "groups": [{"title": "...", "widget_types": [...]}],
  "ai_summary": {
    "executive": "...",
    "per_widget": {"recommended_charts": "..."},
    "next_analyses": ["..."]
  }
}
```
Constraints: `widget_order` must be a permutation/subset of available catalog types;
unknown types are dropped; `ai_available=True`.

**Deterministic fallback** (`_fallback_spec`): all available widgets in a fixed
deterministic order, no groups, template summaries (`ai_summary=None` or a simple
rule-based string), `ai_available=False`. The UI shows a "rule-based dashboard" banner
(consistent with cleaning/reports).

### 6.5 `render(spec, ctx)` — `engine.py`

Resolves the saved `DashboardSpec` against the live `DashboardContext`:
1. Start from `spec.widget_order` (or fallback order).
2. Drop any `spec.hidden_widgets`.
3. For each remaining type, call `get_widget(type).build(ctx)` → `WidgetData`.
4. Apply `spec.groups` for presentation grouping.
5. Return `DashboardView` = ordered `list[{type, data, meta}]` + `spec` (notes/summary).

Because `render` always re-resolves from `ctx`, the dashboard reflects live artifacts
even months after generation (unless a future snapshot feature freezes a payload copy).

## 7. Widget catalog

### M1 — dataset scope, core widgets

| Widget | Data source | Notes |
|---|---|---|
| `kpi_cards` | `profile` | rows, columns, null %, duplicate count, quality score |
| `data_quality` | `profile.data_quality_issues` | issues list with severity |
| `recommended_charts` | `eda` (accepted charts) | reuses `ChartRenderer` |
| `ai_insights` | `understanding` + AI per-widget cards | insight bullets + AI "why this matters" |
| `sql_widget` | `sql_queries` (this dataset) | recent queries, reuses `ChartRenderer`/results |

### M2 — project scope + remaining widgets

| Widget | Data source | Scope |
|---|---|---|
| `project_kpis` | aggregate of project datasets | project |
| `dataset_summaries` | per-dataset profile/status cards | project |
| `recent_reports` | `reports` table | project |
| `activity_feed` | derived from datasets/queries/reports timestamps | project |
| `cleaning_history` / `version_timeline` | `lineage` | dataset |
| `recommended_next` | AI `next_analyses` + suggestions | both |

Each is an independent registry entry. Future widgets (tables, timelines, SQL/report/
activity widgets) are added by dropping a new module into `widgets/` and registering it —
no engine change (your explicit extensibility requirement).

## 8. API routes — `app/api/routes/dashboards.py` (under `/api/v1/dashboards`)

Owner-guarded throughout (reuse `get_current_user` + project ownership check). All
deterministic-first; AI is best-effort so no route 5xxes on LLM failure.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/generate` | body `{scope, project_id, dataset_id?}`; **409** if dataset scope but unprofiled; creates a `Dashboard` row (initial spec via `propose_dashboard`, or deterministic fallback). Returns `DashboardRead`. |
| `GET` | `/list?project_id=&scope=` | owner's dashboards for a project. |
| `GET` | `/{id}` | returns `DashboardRead` **plus** resolved `DashboardView` (live data). |
| `PATCH` | `/{id}` | save HITL edits: `widget_order`, `hidden_widgets`, `user_notes`, `title`. |
| `POST` | `/{id}/regenerate` | re-run `propose_dashboard` on the live catalog; update spec. |
| `DELETE` | `/{id}` | delete the dashboard. |

**On-demand during M1/M2 (no persistence yet):** `POST /preview` with
`{scope, project_id, dataset_id?}` returns a `DashboardView` directly from
`build_catalog` + `propose_dashboard` without writing a row. **M3 keeps `/preview` as a
non-persisted, ephemeral endpoint** (useful for a quick look without saving) and adds
the persistent CRUD above (`generate` writes a `Dashboard` row; `get` returns the saved
spec plus the live-resolved view).

### Schemas — `app/schemas/dashboard.py`
`DashboardSpec`, `DashboardGenerateRequest`, `DashboardPatchRequest`, `DashboardRead`,
`WidgetData`, `DashboardView`, `CatalogEntry`. `dashboard` JSON column typed as
`DashboardSpec`.

## 9. Frontend

- `lib/types.ts` — `DashboardSpec`, `DashboardWidget`, `DashboardRead`, `DashboardView`,
  `WidgetData`, `CatalogEntry`, request/response types.
- `lib/api.ts` — `dashboardsApi` (generate / list / get / patch / regenerate / delete /
  preview).
- `components/dashboard-renderer.tsx` — maps `widget.type` → component; resolves the live
  `DashboardView`; **reuses `ChartRenderer`** for charts/SQL widgets. Scope-independent.
- `components/dashboard-editor.tsx` (M3) — HITL: toggle widget visibility (accept/reject),
  reorder (up/down), edit per-widget `user_notes`, **Regenerate**, **Save** (PATCH).
- **Entry points (M3):** a **Dashboard** button on each profiled dataset card (sibling of
  the existing Report button) and a **Dashboard** button in the project workspace header
  (project scope). Owner view at `app/dashboards/[id]/page.tsx` (editor + render) serving
  both scopes.
- Renderer styling reuses the existing `Card` primitives and Tailwind tokens.

## 10. AI role & fallback (recap)

1. Deterministic `build_catalog` produces every widget's facts + metadata.
2. AI only **selects, orders, groups** widgets and **writes prose** (`ai_summary`) from
   catalog metadata — never raw data, never widget computation.
3. On any LLM/validation failure → `_fallback_spec` (all widgets, fixed order, template
   summaries, `ai_available=False`). Dashboard always renders.

## 11. Error handling

- Failing `build()` → widget skipped + logged, dashboard still renders.
- `propose_dashboard` best-effort → deterministic fallback.
- `409` before profile (dataset scope); `422` on bad scope/dataset/project; owner-guarded;
  no raw data leaves the backend.

## 12. Testing & verification

- **Backend unit tests** (`tests/test_dashboard_*.py`): widget `build()` determinism,
  `build_catalog` assembly, `propose_dashboard` fallback, `render()` resolves live data,
  schema validation.
- **E2E (TestClient):** `generate` → 409 before profile; preview returns widgets;
  accept/reject persists (`hidden_widgets`); `regenerate` updates spec; `delete` removes.
- **Frontend:** `tsc --noEmit`, `next lint`, `next build` pass.
- **Manual e2e:** dataset dashboard (KPIs + charts + insights + SQL) and project dashboard
  (project KPIs + dataset summaries + reports + activity) render and persist edits.

## 13. Milestone breakdown

### M1 — Engine + dataset-scope core (design approved 2026-07-17)
- `app/services/dashboard/` package: `DashboardWidget` ABC, registry, `DashboardContext`,
  `build_catalog`, `propose_dashboard` + `_fallback_spec`, `render`, `assemble_context`.
- M1 widgets: `kpi_cards`, `data_quality`, `recommended_charts`, `ai_insights`,
  `sql_widget`.
- On-demand `POST /preview` (dataset scope) → `DashboardView`.
- `components/dashboard-renderer.tsx` (read-only) reusing `ChartRenderer`.
- Backend unit tests + `py_compile`.

### M2 — Project scope + remaining widgets
- Project-scope context assembly (aggregate artifacts across project datasets).
- Remaining widgets: `project_kpis`, `dataset_summaries`, `recent_reports`,
  `activity_feed`, `cleaning_history`/`version_timeline`, `recommended_next`.
- `POST /preview` extended to project scope; AI curation across project catalog.
- Renderer handles project-scope widgets.
- Tests for project catalog + render.

### M3 — Persistence + HITL editor + entry points
- `dashboards` table + migration + `Dashboard` model + `DashboardSpec` schema.
- Full CRUD routes: `generate` / `list` / `get` (with resolved view) / `patch` /
  `regenerate` / `delete`, owner-guarded.
- `components/dashboard-editor.tsx` (accept/reject, reorder, notes, regenerate, save).
- Entry points: Dashboard button per profiled dataset + project header; owner page
  `app/dashboards/[id]/page.tsx`.
- End-to-end verification (TestClient + frontend build + manual e2e).

## 14. Future extensions (designed-for, not built)

- **Public share link** (`/dashboards/share/{token}`) — reuse Reports' share pattern.
- **Dashboard versioning** (`parent_dashboard_id`).
- **Snapshot/export** (freeze `WidgetData` payloads; PDF/PNG export).
- **Dashboard analytics** (views/downloads counters).
- **Additional widget types** (tables, timelines, custom SQL/report/activity widgets) —
  drop-in modules, no engine change.

## 15. Consistency with existing patterns

- Mirrors **Reports**: persistent asset, owner-guarded CRUD, `spec` JSON config,
  renderer resolves references (live data), AI narration best-effort with fallback.
- Mirrors **cleaning `CleaningOp`**: plugin `DashboardWidget` registry; `preview`/`apply`
  analogue is `build_catalog`/`render` (deterministic, never diverge).
- Mirrors **EDA `propose_charts`**: AI selects from a deterministic candidate catalog,
  constrained to known types, with a deterministic fallback.
- Reuses **`ChartRenderer`** for charts/SQL widgets — no second charting implementation.
- Reads only **stored** profile/understanding/eda/lineage — never reparses files.
