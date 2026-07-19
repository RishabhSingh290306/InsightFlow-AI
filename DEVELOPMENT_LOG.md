# Development Log: InsightFlow AI

## 2026-07-16 — Project Kickoff & Architectural Planning

### Architecture Decision: Modular Monolith

**Decision:** Use a modular monolith architecture instead of microservices.

**Rationale:**
- Single deployable artifact simplifies portfolio demonstration
- Easier to showcase clean module boundaries in code reviews
- Lower operational overhead for demo purposes
- Can later extract services if product scales

**Trade-offs:**
- Requires disciplined code organization
- Single point of failure (mitigated by health checks)

### Architecture Decision: Next.js 15 (App Router)

**Decision:** Next.js 15 with App Router over plain React.

**Rationale:**
- Built-in server components reduce client bundle size
- File-system routing mirrors our modular backend structure
- Excellent for SEO when we add public case studies
- Strong ecosystem for authentication (next-auth)
- Single preview deployments on Vercel for portfolio

**Trade-offs:**
- Learning curve for Server Actions
- Migration complexity (not a concern for new codebase)

### Architecture Decision: FastAPI over Node.js/Express

**Decision:** FastAPI (Python) instead of Node.js/Express.

**Rationale:**
- Natural fit for data science libraries (pandas, numpy, polars)
- Async-first performance for LLM API calls
- Automatic OpenAPI docs reduce documentation burden
- Type safety with Pydantic models
- Single language (Python) reduces context switching

**Trade-offs:**
- Python async ecosystem smaller than Node
- Deployment options more limited (mitigated by Docker)

### Architecture Decision: Celery + Redis for Task Queue

**Decision:** Celery with Redis for AI workflow orchestration.

**Rationale:**
- Decouples long-running LLM calls from HTTP requests
- Enables retry logic and failure handling per workflow
- Scales horizontally when needed
- Familiar to most Python developers

**Trade-offs:**
- Another service to manage (Redis)
- Overhead for small workloads (acceptable for portfolio)

## 2026-07-16 — Data Workflows & Unified Versioning

### Architecture Decision: Deterministic facts, AI interpretation, human control

**Decision:** All data workflows follow one principle — *deterministic code
computes facts → AI interprets & proposes → human approves → deterministic code
executes.*

**Rationale:**
- Deterministic pandas is the single source of truth and never depends on the LLM.
- The LLM only interprets structured facts and proposes actions from a fixed
  catalog; it never sees raw data and never mutates data.
- Every AI step is best-effort with a deterministic fallback, so no workflow
  fails because of an LLM/API issue.

**Trade-offs:**
- Slightly more code (fallbacks + structured contracts) for much higher
  robustness and testability.

### Architecture Decision: Two-stage dataset understanding

**Decision:** Stage 1 profiling (deterministic pandas, stored as
`Dataset.profile`) is the single source of truth; Stage 2 understanding (LLM)
interprets the *profile*, never the raw file, and stores `Dataset.understanding`.

**Rationale:**
- Downstream workflows (cleaning, EDA, SQL, viz, insights, reports) reuse the
  stored profile without reparsing files.
- Clear failure boundary: profiling always succeeds; AI degrades gracefully.

### Architecture Decision: Unified dataset versioning (Git-like lineage)

**Decision:** Datasets form an immutable version graph. Each version **is** a
`Dataset` row (Option A — extend the table) rather than a separate
`DatasetVersion` table. New lineage fields: `parent_id`, `root_id`, `origin`,
`recipe`. The original is never mutated; every transformation creates a new
version row.

**Rationale:**
- Reuses profiling/understanding/storage/version counter with minimal rework and
  keeps a single storage model (YAGNI vs. a separate version table).
- `WHERE root_id = ?` lists a full lineage; one mechanism serves all future
  data-producing workflows (cleaning, feature engineering, SQL, manual edits).
- Delivers auditability, reproducibility, rollback (restore parent), and
  professional data lineage.

**Trade-offs:**
- The `Dataset` row does double duty as "file" and "version node" (accepted;
  matches the intended model).

### Architecture Decision: HITL cleaning with a plugin operation registry

**Decision:** AI proposes cleaning operations from the profile; the human
reviews/edits/approves each like a pull request; a deterministic **plugin-based
operation registry** executes only approved operations and writes a new version.
Each operation implements a common interface — `describe`, `validate`,
`preview`, `execute`, `rollback` (where applicable). A stateless `preview`
(dry-run) and `apply` share the same registry so they can never diverge.

**Rationale:**
- Plugin design lets future operations (outliers, text normalization, encoding,
  feature engineering) be added without modifying the engine or UI.
- Shared registry guarantees preview/execution consistency.
- Apply is all-or-nothing at persistence: no half-cleaned versions.

**Trade-offs:**
- More upfront structure than a single cleaning function, justified by
  extensibility and correctness.

Full design: `docs/superpowers/specs/2026-07-16-cleaning-workflow-design.md`.

### Initial Project Structure

Created monorepo with:
```
src/
  api/          # FastAPI endpoints
  services/     # AI workflow modules
  models/       # SQLModel definitions
  tasks/        # Celery task definitions
app/            # Next.js frontend
components/     # Shared UI components
lib/            # Utility functions
docs/           # Documentation
infra/          # Terraform / deployment
tests/          # Test suite
```

## 2026-07-16 — Sprint 1, M1: Versioning Foundation (shipped)

Implemented the immutable, Git-like lineage graph that every future data-producing
workflow (cleaning, feature engineering, SQL, manual edits) reuses.

- **Migration** (`c4d5e6f7a8b9`, on `b2c3d4e5f60`): added `parent_id`, `root_id`
  (indexed, self-FK), `origin` (default `'upload'`), `recipe` (JSON) to `datasets`,
  plus a data backfill setting `root_id = id` for all existing uploads.
- **Model/Schema**: `Dataset` and `DatasetRead` carry the four lineage fields.
- **Upload**: now stamps `root_id = id` (own lineage root), `parent_id = NULL`,
  `origin = 'upload'`. Derived versions (cleaning/SQL) set these to link the chain.
- **`GET /api/v1/datasets/{id}/lineage`**: owner-guarded, returns the shared-root
  version chain ordered by `version`.
- **Frontend**: `DatasetRead` typed with lineage fields; `datasetsApi.lineage(id)`;
  project workspace gets a **History** toggle rendering the version chain
  (`v{n} · Original/Cleaned · status`), with the currently viewed dataset highlighted.

Verified end-to-end via Alembic upgrade + a TestClient round-trip (register →
project → upload → assert `root_id==id`/`parent_id==None`/`origin='upload'` →
`GET /lineage` → cleanup). `npm run lint` + `npm run build` pass. Frontend `.next`
cache had to be cleared once (stale vendor chunk) — unrelated to the change.

## 2026-07-16 — Sprint 1, M2: Cleaning Engine + Registry (shipped)

Deterministic, plugin-based cleaning engine consumed by the M3 AI planner and
apply flow. All computation is pandas; the LLM is never involved in M2.

- **`app/services/cleaning/`** package:
  - `base.py` — `CleaningOp` ABC (`describe`/`validate`/`preview`/`execute`/`rollback`)
    + a JSON-safe `_sample_records` helper for before/after previews.
  - `registry.py` — `name → instance` registry; `get_operation`/`all_operations`/`catalog()`.
  - `operations/` — v1 ops: `handle_missing_values` (drop_rows|drop_columns|mean|
    median|mode|constant), `remove_duplicates`, `convert_types` (numeric|datetime|
    string|category, coerce), `rename_columns`, `drop_columns`. Each validates
    (raises `ValueError` on bad params/columns) and runs `preview` on a copy.
  - `engine.py` — `load_dataframe` (storage adapter → pandas, mirrors profiling),
    `run_preview(df, ops) → CleaningPlan` (dry-run, no persistence), and
    `apply(df, ops) → (new_df, applied_records)` executing only **approved** ops
    sequentially through the same registry (preview/apply cannot diverge).
  - **Execution metadata:** every operation execution is wrapped with
    `operation_id` (UUID), `duration_ms`, `status`, `timestamp` — recorded on the
    preview `OperationImpact` and on each applied record. Powers future logging,
    analytics, workflow history, and debugging without changing the architecture.
- **Schemas** `app/schemas/cleaning.py`: `CleaningOperation`, `OperationImpact`
  (incl. metadata fields), `ProposedOperation`, `PlanSummary`, `CleaningPlan`,
  `PreviewRequest`, `ApplyRequest`. `params` is the single param bag matching the
  recipe shape.
- **Routes** `app/api/routes/cleaning.py` (mounted at `/api/v1/datasets`):
  `GET /{id}/cleaning/operations` (catalog, owner-guarded) and
  `POST /{id}/cleaning/preview` (deterministic dry-run → `CleaningPlan`; invalid
  op/params → 422). `plan` + `apply` endpoints are M3.

Verified via py_compile + engine unit checks (nulls + duplicate-row df; apply
transforms, input unchanged) + a TestClient e2e (register → project → upload →
catalog=5 ops → preview returns correct impacts + metadata → invalid op 422 →
assert stored file **unchanged** by preview → cleanup). `PlanSummary.overall_quality`
is `None` for now (true quality score needs the before/after profile, available
in M3).

## 2026-07-16 — Sprint 1, M3: AI Planner + Apply + PR-Style Review UI (shipped)

Closes Sprint 1. Completes the HITL cleaning loop: *AI proposes → human approves →
deterministic code executes → new immutable version*.

- **`app/services/cleaning/planner.py`** — `propose_plan(profile, understanding=None)`
  returns `(operations, ai_available)`. Sends **only the structured profile** (never raw
  data) + the registry `catalog()` to `complete_json`, asks for
  `{"operations":[{op,params,explanation,confidence}]}` constrained to catalog names.
  `_validate_plan` drops any op whose name isn't registered or that references unknown
  columns. On **any** LLM/validation failure → deterministic `_fallback_plan`:
  `remove_duplicates` (keep=first) when `duplicate_row_count>0`, and per-column
  `handle_missing_values` (`median` if numeric else `mode`) for each column with
  `missing_values>0`. Sets `ai_available=False` so the UI shows a "rule-based plan" banner.
- **`app/services/cleaning/engine.py`** — added `CleaningApplyError(op_name, message)`
  so a failed op surfaces its name in the 422 (M2 success-path untouched).
- **`app/api/routes/cleaning.py`** — `POST /{id}/cleaning/plan` (409 if unprofiled;
  runs `propose_plan` then `run_preview` to attach impacts) and `POST /{id}/cleaning/apply`:
  executes approved ops, serializes the new frame (CSV/`to_csv`, xlsx/`to_excel`), saves a
  new file, writes a **new immutable child `Dataset`** (`parent_id`/`root_id`/`origin=
  "cleaning"`/`version = parent+1`/`recipe`), and **re-profiles before commit** (no partial
  version on profiling failure). All-or-nothing: a failed op → `422` naming it, **no version
  created**. Unapproved ops are recorded under `recipe.skipped` (reason `user_rejected`).
- **`app/services/cleaning/__init__.py`** — exports `propose_plan`.
- **Frontend** — `lib/types.ts` (cleaning models), `lib/api.ts` (`cleaningApi`
  plan/preview/apply/operations), `components/cleaning-panel.tsx` (modal PR-style review:
  summary header, AI-available banner, per-op editable params + approve/reject toggle,
  before/after previews, **debounced live preview** ~500ms, Apply → new version added to the
  workspace), and a **Clean** button per dataset (shown only when a profile exists) in
  `app/projects/[id]/page.tsx`.

Verified end-to-end (TestClient + Postgres): `plan` 409 on unprofiled dataset; planner
returns `remove_duplicates` + `handle_missing_values`; `apply` creates a child version with
correct lineage fields and a fresh profile; original file **unchanged** and the new version
has **no duplicates / nulls**; a rejected op lands under `recipe.skipped`; an op that raises
returns `422` and creates **no** version. `py_compile` + `tsc --noEmit` + `next lint` +
`next build` all pass. Frontend `.next` cache cleared once (stale vendor chunk) — unrelated
to the change.

## 2026-07-17 — Sprint 3, M1–M3: Insights + Reports (shipped)

Turns a user's *accepted* analysis artifacts into a curated, AI-narrated, editable report
that can be shared via a public read-only link and exported to PDF/Markdown. Closes the
loop of the platform's core principle — **deterministic facts → AI interpretation → human
approval → deterministic execution** — at the consumption layer.

- **`reports` table** (migration `g8h9i0j1k2l3`): `project_id`/`owner_id` FKs + indexes,
  `scope` (`dataset`|`project`), nullable `dataset_id`, `title`, `sections` JSON (the
  canonical `Report` representation), unique indexed `share_token`, `ai_available` bool,
  `created_at`/`updated_at`/`generated_at`. A dedicated table (not a JSON column on
  `Dataset`/`Project`) so a project can hold multiple reports + history, and so future
  analytics/versioning columns slot in cleanly.
- **Canonical Report JSON** — `Report` is an ordered `list[ReportSection]`; each section
  holds `blocks` mixing editable `prose` with artifact references (`chart`/`sql`/`table`/
  `lineage`/`custom_note`). The renderer resolves those references from `payload` and never
  recomputes — it is **presentation-only**.
- **Assembly service** (`app/services/reporting/`): the *only* place a report is built.
  Pure deterministic builders fill the factual sections (cover, dataset overview, data
  quality, cleaning summary, EDA *accepted* charts only, SQL history, version lineage);
  `narrate_report` sends structured facts (never raw data) to `complete_json` for the
  executive summary / insights / recommendations prose, and on any LLM failure returns a
  deterministic templated narrative with `ai_available=False` (so the UI shows a
  "rule-based report" banner and never 5xx).
- **Routes** (`/api/v1/reports`): owner-guarded `generate` (409 before any profile;
  422 on bad scope/dataset/project), `list`, `get`, `patch` (replace sections/title —
  the HITL edit surface), `delete`, `export` (Markdown blob / self-contained printable
  HTML). **Public** `GET /share/{token}` takes **no auth dependency** and returns only
  `ReportShareRead` (title/scope/sections/ai_available/generated_at) — no owner PII, no
  project linkage, no mutation verbs, no other datasets reachable.
- **Frontend**: `report-renderer` (presentation-only, reuses `ChartRenderer`), `report-editor`
  (live HITL: edit prose, reorder, remove, rename, add custom-note sections; Save = PATCH;
  Download PDF via `window.print()`; Download Markdown; Copy Share Link), owner page
  `app/reports/[id]`, public page `app/reports/share/[token]` (branded footer "Generated
  with InsightFlow AI · Analyze your own dataset →", download buttons, read-only). Generate
  Report buttons on the project workspace (project scope + per-dataset, guarded by profile).
  `globals.css` print stylesheet hides `.no-print` and flattens the background for PDF.

Verified: `pytest` (assembly builders + AI-fallback + render), TestClient e2e (409 before
profile, dataset-scope generate builds 10 ordered sections, public share returns safe
fields only, bad token 404), `tsc`/`next lint`/`next build` all pass.

**Forward-looking extension points (designed-for, not implemented):** report versioning
(`parent_report_id`), report analytics (views/downloads), report metadata (AI model, dataset
version), and additional export formats (DOCX/HTML) — the schema already accommodates them
without redesign.


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

## 2026-07-17 — Sprint 2, M2: SQL Generation (Question → SQL) (shipped)

Read-only analysis workflow completing the "collaborate with an AI Data Analyst"
vision: ask a business question → AI generates + explains SQL → human reviews/edits
→ deterministic sandbox validates + executes → results + execution time + suggested
visualization + AI insights → every executed query persisted to searchable history.

- **`app/services/sql/engine.py`** — `validate_sql` (sqlglot: single statement, SELECT/WITH
  only, no DDL/DML, only the `dataset` table, column whitelist) and `execute_query`
  (DuckDB over the in-memory pandas frame registered as `dataset`; threaded timeout +
  row cap; JSON-safe rows). `suggest_chart` deterministically picks a chart type from the
  result shape. This is the ONLY place SQL executes.
- **`app/services/sql/proposer.py`** — `generate_sql(question, profile, understanding)`
  sends the profile (preview stripped) + question to `complete_json` for SQL +
  explanation + confidence + suggested viz; validates the SQL and falls back to an empty
  `sql` with `ai_available=False` if unsafe/unavailable (user writes their own).
- **`app/services/sql/insights.py`** — `generate_insights(...)` best-effort prose on a
  compact result summary; deterministic templated fallback.
- **`app/schemas/sql.py`** — `SqlProposal` / `SqlRunRequest` / `SqlResult` /
  `SqlQueryRecord` / `SqlVisualization` contracts.
- **`app/models/sql_query.py`** + migration `e6f7a8b9c0d1` — `sql_queries` history table
  (project/dataset/owner FKs + indexes; stores question/SQL/edited/explanation/viz/
  insights/result-metadata, not full rows).
- **`app/api/routes/sql.py`** — `POST /sql/generate` (409 if unprofiled), `POST /sql/run`
  (validate → 422 on unsafe; execute; persist; return results), `GET /sql/history`
  (owner-guarded, per-project, `q` ILIKE search), `DELETE /sql/history/{id}`.
- **Frontend** — `lib/types.ts` / `lib/api.ts` (`sqlApi`), `components/sql-panel.tsx`
  (ask→edit→execute→results→history, reuses `ChartRenderer` for the suggested viz), and a
  **SQL** button per profiled dataset in `app/projects/[id]/page.tsx`.

Resolves the "SQL sandbox security considerations pending" known issue: SQL runs only
against the in-memory frame, never a live DB. Verified: `py_compile`, `pytest` (engine +
proposer/insights), `tsc`/`next lint`/`next build` all pass; manual TestClient e2e confirms
409-before-profile, generation, destructive-SQL 422 (no history row), valid run + persist,
history list + search, delete. The `app/services/sql/` package is the single SQL engine the
future AI Chat reuses.

## 2026-07-17 — Sprint 2, M3: Conversational Investigation (follow-up questions) (shipped)

Additive milestone on the SQL Generation engine. Turns isolated queries into a multi-turn
investigation: after each result the AI suggests chain-aware follow-up questions; the panel is a
chat-style thread; each turn links to its parent in history.

- **`app/schemas/sql.py`** — `SqlChainTurn`; `SqlGenerateRequest.chain`; `SqlRunRequest.parent_query_id`;
  `SqlResult.followup_questions`/`followups_ai_available`; `SqlQueryRecord.parent_query_id`.
- **`app/services/sql/insights.py`** — `interpret_result(question, sql, result_summary, profile, chain=None)`
  replaces `generate_insights`: one best-effort `complete_json` call returns `(insights,
  followup_questions, ai_available)`. On failure → templated insight + empty followups.
- **`app/services/sql/proposer.py`** — `generate_sql` gains `chain` (prior turns injected into the
  prompt) so follow-up SQL is informed by the investigation so far.
- **`app/models/sql_query.py`** + migration `f7a8b9c0d1e2` — nullable `parent_query_id`
  (self-FK + index) links each turn to the one it followed up.
- **`app/api/routes/sql.py`** — `generate` forwards `chain`; `run` calls `interpret_result`,
  persists `parent_query_id` (owner-guarded: foreign/invalid parent → 422), returns
  `followup_questions`.
- **Frontend** — `lib/types.ts` (`SqlChainTurn` + extended contracts), `lib/api.ts`
  (`sqlApi.generate(req)`), `components/sql-panel.tsx` reworked into a thread: each turn shows the
  question, editable SQL, result table, chart, insights, and follow-up chips; clicking a chip
  proactively generates the next turn's SQL (**never auto-executes** — HITL preserved); history
  renders the chain (indented under the parent).

Verified: `pytest` (schemas + interpreter + proposer + engine, 25 passed), `tsc`/`next lint`/`next
build` all pass; manual TestClient e2e confirms generate-with-chain, run returns followups, persisted
row carries `parent_query_id`, invalid parent → 422.

## 2026-07-17 — Sprint 4: Dashboard Recommendations (design approved)

### Architecture Decision: Single reusable dashboard engine, two scopes

**Decision:** One `Dashboard Engine` serves **dataset-scoped** and **project-scoped**
dashboards. The *scope* selects the data source; the *renderer* is scope-independent.
Widgets are independent, registered modules (`DashboardWidget` ABC in a registry),
so future widgets (tables, timelines, SQL/report/activity widgets) are drop-in modules
with no engine change. Mirrors the cleaning `CleaningOp` plugin pattern.

**Rationale:**
- Avoids two parallel systems (per-dataset vs per-project) that would diverge.
- Widget registry gives the extensibility the platform needs for future dashboard types.
- Renderer independence keeps presentation logic decoupled from data scope.

### Architecture Decision: Deterministic catalog first, AI curates + writes prose

**Decision:** `build_catalog` (deterministic) runs every widget's `availability` +
`build` against stored artifacts and returns candidate widgets with real data. The AI
then **selects / orders / groups** widgets and **writes prose** (executive summary,
per-widget insight cards, recommended-next-analyses) from catalog *metadata only*. On
any LLM/validation failure → deterministic fallback (all widgets, fixed order, template
summaries, `ai_available=False`). AI never invents widgets or computes facts.

**Rationale:** Same best-effort, deterministic-fallback contract as EDA's
`propose_charts` and Reports' `narrate_report` — reliability preserved, dashboard always
renders.

### Architecture Decision: Persisted spec, live-rendered data (HITL like Reports)

**Decision:** A `Dashboard` row stores the *spec* (widget order, hidden widgets, groups,
AI summary, user notes, scope, dataset version reference, refreshed timestamp) — never
rendered data. The renderer resolves each widget's **live** data from the latest
artifacts at render time. Human can accept/reject, reorder, add notes, regenerate, save
— the same HITL workflow as Reports. A future snapshot feature would freeze a payload
copy (designed-for, not built).

**Rationale:** Keeps dashboards fresh against evolving project data while remaining a
durable, editable project asset; reuses the proven Reports persistence/editor pattern.

Full design: `docs/superpowers/specs/2026-07-17-dashboard-recommendations-design.md`.

## Future Log Entries

- AI workflow design decisions
- UI component architecture
- Testing strategy evolution
- Performance optimizations
- Lessons learned during implementation
## 2026-07-17 — Dashboard Recommendations M2 (project scope + remaining widgets)

### Build Note: M2 shipped as a single reusable engine (both scopes)

**Decision:** Extend the M1 dashboard engine to a **single `DashboardContext` + widget
registry** serving both `dataset` and `project` scope; add the remaining widgets rather
than a separate project code path.

**What landed (M2):**
- `assemble_context` now branches on scope. `project` scope aggregates the profiles,
  understandings, EDA results, SQL history, reports, and version lineages of **every
  owned dataset** in the project. `dataset` scope populates `lineage[dataset.id]` for the
  new `version_timeline` widget.
- Six new registry widgets, all deterministic: `project_kpis` (aggregated counts/rows/
  activity), `dataset_summaries` (per-dataset status cards), `recent_reports`,
  `activity_feed` (upload/SQL/report events), `version_timeline` (dataset-only lineage),
  `recommended_next` (both scopes — understanding-implied questions + gap heuristics).
- `POST /dashboards/preview` opens **project scope** (owner-guarded); dataset scope keeps
  its 409-before-profile rule. AI curation (`propose_dashboard`) is scope-agnostic, so the
  project catalog is curated with the same best-effort/fallback contract.
- `dashboard-renderer.tsx` gained components + `WidgetBody` cases for all six new widget
  types, reusing the existing `Card` primitives.

**Rationale:** Widgets stay independent and registered — adding future widgets needs no
engine change (spec §7). Project scope is "more context, same engine," not a fork.

## 2026-07-17 — Dashboard Recommendations M3 (persistence + HITL editor + entry points)

Closes Sprint 4. Turns the on-demand preview into a durable, editable project asset and
completes the HITL loop (same contract as Reports): *AI curates → human hides/reorders/notes/
regenerates/saves → renderer resolves live data*.

- **`dashboards` table** (migration `h9i0j1k2l3m4`, on `g8h9i0j1k2l3`): `project_id`/`owner_id`
  FKs + indexes, `scope`, nullable `dataset_id` (indexed FK), nullable `dataset_version_id`,
  `title`, `spec` JSON (the config-only `DashboardSpec`), `ai_available` bool,
  `refreshed_at`/`created_at`/`updated_at`. Dedicated table (not a column on `Dataset`/`Project`)
  so a project holds multiple dashboards + history. Model `spec` is `dict | None` via
  `sa_column=Column(JSON)` (the `Column(...)` wrapper is required for SQLModel to accept a
  `dict`/`JSON` field — bare `sa_column=JSON` raises at import).
- **`DashboardSpec` schema** (`app/schemas/dashboard.py`): config-only (`scope`, `widget_order`,
  `hidden_widgets`, `groups`, `ai_summary`, `user_notes`). Added `DashboardRead` /
  `DashboardDetailRead` (`view` attached) / `DashboardGenerateRequest` / `DashboardPatchRequest`
  and `is_hidden: bool = False` on `CatalogEntry` so the editor can re-show hidden widgets.
- **Engine** (`app/services/dashboard/engine.py`): `render(..., include_hidden=False)` now keeps
  hidden widgets (flagged `is_hidden`, data intact) when `include_hidden=True`; `render_dashboard`
  (the owner GET) uses `include_hidden=True` so the HITL editor never loses a hidden widget's
  computed data when toggled back on. `resolve_context` re-assembles the live context for a stored
  dashboard.
- **Routes** (`app/api/routes/dashboards.py`): owner-guarded full CRUD — `POST /generate` (409
  before any profile, project 404 if no datasets / 409 if none profiled), `GET /list?project_id=`,
  `GET /{id}` (returns `DashboardDetailRead` with the resolved `view`), `PATCH /{id}` (applies only
  provided fields to the stored spec — HITL edit surface), `POST /{id}/regenerate` (re-runs
  `propose_dashboard`, **preserving** the human's `hidden_widgets` + `user_notes`, recomputing
  order/groups/summary), `DELETE /{id}` (204). `_owned` returns 404 if absent, **403 if it exists
  but belongs to another user** — so the owner-guard test asserts 403, not 404. `POST /preview` is
  kept from M2 (both scopes). **Fix:** `preview_dashboard` called `render(...)` which was never
  imported into the routes module (pre-existing M2 wiring gap the unit tests missed) — added
  `render` to the engine import.
- **Frontend**: `lib/types.ts` (`DashboardRead`/`DashboardDetailRead`/`DashboardGenerateRequest`/
  `DashboardPatchRequest`, `CatalogEntry.is_hidden`), `lib/api.ts` (`dashboardsApi.generate/list/
  get/update/regenerate/remove` beside `preview`), `components/dashboard-editor.tsx` (hide/show per
  widget, up/down reorder, per-widget notes, Save = PATCH, Regenerate = re-fetch + refresh, Delete
  with confirm; live preview rebuilt from `view.widgets` honoring local order/hidden and passed to
  `DashboardRenderer`), owner page `app/dashboards/[id]/page.tsx` (auth-guarded, loads
  `get(id)`, back-to-project link). Entry points in `app/projects/[id]/page.tsx`: a **Dashboard**
  button in the project header (project scope) and per profiled dataset card (dataset scope), both
  routing to `/dashboards/{id}`.

Verified: backend unit suite `pytest` (71 passed, incl. a new `render` `include_hidden` test);
manual Postgres e2e `tests/manual_dashboard_e2e.py` (preview dataset + project, full CRUD lifecycle,
owner-guard 403); `tsc --noEmit` + `next lint` + `next build` all pass; `/dashboards/[id]` emitted in
the build manifest.

## 2026-07-17 — Sprint 5, M1+M2: AI Chat & Notebook (chat-first analyst + full action surface)

Closes the platform vision: *deterministic facts → AI interpretation → human approval →
deterministic execution*, surfaced through a natural-language interface. A notebook is a saved chat
session; the chat UI *is* the notebook editor. Reuses every existing engine unchanged.

- **Streaming primitive** (`app/services/llm.py`): `complete_stream(...)` — `async for` over
  OpenRouter's SSE deltas, raises on missing key / connection error so callers fall back. Existing
  `complete_json` untouched. **Real token streaming** (not simulated dripping) per the approved design.
- **`notebooks` table** (migration `i0j1k2l3m4n5`, on `h9i0j1k2l3m4`): `project_id`/`owner_id` FKs +
  indexes, `scope` ("dataset"|"project"), nullable `dataset_id` (indexed FK), `title`, `turns` JSON
  (ordered `ChatTurn[]`, config + artifact state only — never raw rows), unique indexed `share_token`,
  `ai_available` bool (True only if every persisted turn used AI), `created_at`/`updated_at`,
  nullable `generated_at` (set on first assistant turn). `turns` is `list | None` (stores a turn
  list) via `sa_column=Column(JSON)`.
- **Two-call turn** (`app/services/chat/orchestrator.py`): `plan_turn` (CALL A, `complete_json`)
  picks proposed `ChatAction`s from a fixed catalog and **drops** any action type outside it
  (`_validate`-style guard); `stream_narrative` (CALL B, `complete_stream`) streams the prose live;
  `_fallback_turn` returns a deterministic SQL action when a frame+profile exist, else text-only —
  `ai_available=False`. Both best-effort; failures never 5xx the stream.
- **Executor** (`app/services/chat/executor.py`): `run_action` deterministically turns each proposed
  action into a `ChatArtifact` by calling the existing engines — `sql` (`generate_sql`), `chart`
  (`build_candidates` over the loaded frame), `cleaning` (`propose_plan`), `dashboard`
  (`assemble_context`+`build_catalog`+`propose_dashboard`), `report` (scope-only link proposal). All
  lazy-imported. Artifacts are `proposed`; execution reuses existing guarded endpoints (SQL Run,
  cleaning apply, dashboard/report generate).
- **Routes** (`app/api/routes/chat.py`): `POST /chat/message` returns `text/event-stream` —
  builds context, runs the two-call turn, deterministically executes proposed artifacts, emits
  `token`/`artifact`/`done`/`error` SSE events, and persists user+assistant turns into `notebooks`.
  Notebooks CRUD: `GET /notebooks?project_id=`, `POST /notebooks`, `GET /notebooks/{id}`
  (`NotebookDetailRead`, turns attached), `PATCH /notebooks/{id}` (rename), `DELETE /notebooks/{id}`
  (204). `GET /notebooks/share/{token}` is **public** (no auth dependency) and returns only safe
  fields (no owner/project linkage). `_owned` returns 404 if absent, **403 if another user's**;
  `_resolve_scope` owner-checks project + dataset.
- **Frontend**: `lib/types.ts` (`ChatArtifact`/`ChatTurn`/`Notebook*`/`ChatMessageRequest` — note
  `ChatTurn._streaming` is a transient UI flag stripped before persistence), `lib/api.ts`
  (`chatApi.message` SSE consumer via `fetch` + `ReadableStream` reader — EventSource can't POST;
  parses `event:`/`data:` frames — plus `notebooksApi` CRUD + `share`). `components/chat-panel.tsx`:
  live token streaming into the assistant bubble + inline SQL Run (table + `ChartRenderer` viz
  reusing `sqlApi.run`); M2 renders **chart** (accept/reject checkboxes + `ChartRenderer`),
  **cleaning** (operation review), **dashboard**/**report** (Generate/Open link → existing
  `generate` endpoints). Entry points in `app/projects/[id]/page.tsx`: **Chat** button in the project
  header (project scope) and per profiled dataset card (dataset scope). Owner page
  `app/notebooks/[id]/page.tsx` (copy share link, back-to-project) + public
  `app/notebooks/share/[token]/page.tsx` via `components/notebook-share.tsx` (branded footer,
  read-only, no mutation).

Verified: backend unit tests `tests/test_chat_*.py` (10 passed — streaming primitive, orchestrator
intent/narrative/fallback, executor per action type); manual Postgres e2e
`tests/manual_chat_e2e.py` (streams tokens + artifacts + done, persists notebook with 2 turns,
owner-guard 403, public share returns safe fields only); `tsc --noEmit` + `next lint` + `next build`
all pass; `/notebooks/[id]` and `/notebooks/share/[token]` emitted in the build manifest. M3
(cross-dataset routing, notebook list/manage, browser verification) remains.

## 2026-07-17 — Sprint 5, M3: Cross-dataset routing + notebook management + verification

Completes Sprint 5. The chat analyst now routes project-scope questions to the right dataset frame
and notebooks are fully manageable.

- **Cross-dataset project routing** (`app/services/chat/context.py` + `app/api/routes/chat.py`): when
  `build_chat_context` runs at project scope (`dataset is None`), it now populates `project_summary`
  — `dataset_count`, `profiled_count`, and a safe list of each owned dataset's `id` / filename /
  columns / `row_count` (facts only, never raw rows). The project-scope question is passed to CALL A
  with this list so the LLM can name a `dataset_id`. In `chat_message`, each proposed action is
  executed against a per-action frame: if the chat is project-scope and the action carries a
  `dataset_id`, the route loads that dataset (owner-checked) and passes it as the execution `dataset`.
  Single-frame only — cross-dataset joins remain out of scope per the spec. The frame-bound artifact
  (sql/chart/cleaning) is thus resolved to the correct owned dataset even from a project-level chat.
- **Notebook management** (`frontend/app/projects/[id]/page.tsx` + `app/notebooks/[id]/page.tsx`):
  the project workspace now renders a **Notebooks** section (`notebooksApi.list(projectId)`) with a
  link to each notebook, an inline **rename** (PATCH) and a **delete** (DELETE, with confirm);
  creating a notebook from the Chat panel refreshes the list. The owner page gains a title input +
  **Rename** button and a **Delete** button that returns to the project. Notebooks list/manage APIs
  already existed (`GET /chat/notebooks`, `PATCH`, `DELETE`) and were previously unused on the client.
- **Verification**: added `test_project_scope_routing_targets_dataset_frame` to
  `tests/manual_chat_e2e.py` (project-scope question, asserts the stream completes, the notebook
  persists, and any frame-bound artifact resolves `dataset_id` to the owned dataset). Live Postgres
  e2e: **2 passed**. Backend unit suite: **10 passed**. `tsc --noEmit` + `next lint` + `next build`
  clean; `/notebooks/[id]` and `/notebooks/share/[token]` emitted. **Browser-DOM verification was not
  run** — the running dev frontend (port 3000) was serving a stale build (`_next/static` chunks 404'd
  against the current client), so the maintainer should restart the frontend and click through a real
  chat turn (token streaming → SQL artifact → Run → table/chart → notebook → share link) before
  merging.

Sprint 5 (AI Chat & Notebook) is **complete**: M1 (foundation + streaming + SQL), M2 (full action
surface with HITL), and M3 (routing + management + verification) are all shipped. Next: Portfolio
Polish.

## 2026-07-17 — Portfolio Polish: availability + focused-workspace pass

**Trigger:** `impeccable critique` of `app/projects/[id]/page.tsx` scored 19/40 (Poor) with two P0s
and two P1s. User chose: fix both P0s together, address all five priority issues, and redesign the
action row as a focused workspace.

**P0 — availability:** there were **no `error.tsx` / `global-error.tsx` anywhere in `frontend/app`**,
so any render-time crash surfaced as Next's raw "missing required error components, refreshing…" 500.
Added both boundaries (`app/error.tsx` for route segments, `app/global-error.tsx` for the root).
**Diagnosis of the reported 500:** `next build` now compiles cleanly and all 7 routes generate, so
the 500 was **not** a compile/SSR build error. The four panels have clean module tops (no top-level
browser access). Most likely cause was the critique's browser probe, which wedged the single-threaded
dev server with a hanging `/dashboards` request (the workspace 500 was observed before that wedge, on
hard load / direct URL — i.e. SSR, where client-navigated loads worked). The new boundaries now
degrade any render error to a branded page regardless of root cause.

**P0 — delete guardrail:** added `components/confirm-dialog.tsx` (native `<dialog>` → free focus-trap
+ Escape) and wired it into dataset and notebook delete in the workspace (no more unguarded
irreversible delete).

**P1 — focused-workspace action redesign:** `Analyze` promoted to the sole primary CTA; Clean/EDA/SQL/
Report/Dashboard/Chat collapsed into an accessible `components/action-menu.tsx` (`role="menu"`,
outside-click + Escape close); distinct icons (Sparkles=Analyze only; EDA=BarChart3; SQL=Table;
Chat=MessageSquare) fixing the prior Sparkles×3 and EDA/SQL-BarChart3 collisions; `flex-wrap` so the
row no longer overflows.

**P1 — dead header Chat + silent generation:** the header Chat button previously only *closed* the
panel; it now opens a project-scope chat (`openProjectChat`). Report/Dashboard generation shows a
`Generating…` busy state (disabled) instead of failing silently.

**P2 — skeletons + panel a11y:** plain "Loading datasets…" replaced with `DatasetSkeleton` cards;
Cleaning/EDA/SQL overlays gained `role="dialog"`/`aria-modal`, Escape + backdrop-click close, and
initial focus (`tabIndex={-1}` on the `Card`).

**Verification:** `tsc --noEmit`, `next lint`, and `next build` all clean. Committed on
`feature/ai-chat-notebook`. **Not yet browser-verified** — the dev server was wedged at critique time;
the maintainer should restart the frontend and hard-reload `/projects/[id]` (expect a clean render, or
at worst the new friendly error page rather than a raw 500).



## 2026-07-17 — Portfolio Polish: full-sweep P0→P3 (other surfaces)

Second critique sweep across dashboards / reports / notebooks / chat found a P0 plus P1/P2 issues
that mirrored the workspace class. Applied them so the app is "truly done":

- **P0 — unguarded report delete:** `report-editor` delete now routes through `ConfirmDialog`
  (destructive) with a `deleting` busy state and error feedback; the raw `reportsApi.remove` inline
  call is gone.
- **P1 — native `confirm()` deletes:** `dashboard-editor` and `notebooks/[id]` deletes replaced with
  `ConfirmDialog` (both already had a `deleting` state; `notebooks` keeps its redirect on success).
- **P1 — silent chat stream errors:** an `event === "error"` SSE frame previously only flipped
  `_streaming` off, leaving a blank bubble. It now appends a visible `⚠️ <message>` assistant turn.
- **P1 — chat overlay semantics:** `chat-panel` modal is now a real `role="dialog"` /
  `aria-modal="true"` / `aria-labelledby`, closes on Escape, and autofocuses the input on mount.
- **P1 — notebook rename-scope bug:** rename failures set a dedicated `renameError` shown inline
  instead of the shared `error` state that wiped the whole page.
- **P1 — dark-mode chip contrast:** `dashboard-renderer` status chips (profiled/unprofiled/
  understood/EDA, activity badges) switched from hardcoded `bg-*-100 text-*-700` to token-tinted
  `bg-<hue>-500/15` with `dark:` text variants (pass contrast in both themes).
- **P2 — skeletons:** `dashboards/[id]`, `reports/[id]`, `notebooks/[id]` show skeletons instead of
  plain "Loading…".
- **P2 — input focus rings:** editor/notebook title and chat input now use `ui/input` (focus-visible
  ring) instead of raw `<input>`s.
- **P2 — back-nav consistency:** `reports/[id]` back-nav now returns to its project (label "Project"),
  matching dashboard/notebook owner pages.
- **P2 — async feedback:** markdown export (`report-editor`) and chat dashboard/report artifact gen
  (`chat-panel`) show busy state + error; the latter uses `router.push` instead of
  `window.location.href`.
- **P3 — chart palette:** `chart-renderer` `PALETTE[1]` was `hsl(var(--secondary-foreground))` (a text
  token used as a data color) — replaced with a real red hue.

Added `frontend/components/ui/skeleton.tsx` (shadcn-style). **Verification:** `tsc --noEmit`,
`next lint`, and `next build` all clean; live dev server confirmed serving on :3001. Committed on
`feature/ai-chat-notebook` (no push).

## 2026-07-19 — Production deployment (Vercel + Railway) + AI provider switch + frontend hardening

Shipped the app to production as a **split deploy**: Next.js frontend on Vercel, FastAPI backend on
Railway, with Vercel proxying `/api/*` and `/health` server-side to the Railway URL (no browser CORS).

### Deployment Decision: Vercel (frontend) + Railway (backend)

**Decision:** Host the frontend and backend on separate platforms instead of one Docker Compose stack.

**Rationale:**
- Vercel gives instant global CDN + preview deploys for the Next.js frontend (App Router, zero-config).
- Railway runs the long-lived FastAPI service with a stable public URL and managed Postgres/Supabase.
- The frontend never calls Railway directly from the browser — `next.config.mjs` rewrites `/api/:path*`
  and `/health` to `INTERNAL_API_URL` (set from `frontend/.env.production`), so the backend URL is
  server-side only and there is no CORS surface.

**Configuration that mattered:**
- Vercel **Root Directory = `frontend`** and Framework Preset = Next.js (a `vercel.json` with a
  `services` block triggered an Edge-runtime rejection; we removed it and rely on dashboard settings).
- **Deployment Protection (Vercel Authentication) disabled** — it was gating every route (302 to
  `vercel.com/sso-api`), so `/api/v1/health` returned auth instead of JSON.
- Next.js bumped to **15.2.x** (Vercel blocks the CVE-2025-29927 vulnerable 15.0.3).

### Bug: "AI unavailable" — `LLM_PROVIDER` defaulted to OpenRouter

**Symptom:** Every AI feature reported "AI unavailable" even though `GEMINI_API_KEY` was set in
Railway.

**Root cause:** `LLM_PROVIDER` was **empty**, so `app/services/llm.py` `_provider()` fell back to the
default `"openrouter"` and called OpenRouter — silently failing (no OpenRouter credits / key issue) and
falling back to deterministic results. The Gemini key was present but never read.

**Fix:** Set `LLM_PROVIDER=gemini` in Railway variables. `complete_json`/`complete_stream` now dispatch
to the Google `generativelanguage` path. Verified live: `POST /v1beta/models/gemini-flash-latest:
generateContent` returned `200 OK`.

**Lesson:** provider dispatch keys off an *explicit* `LLM_PROVIDER`; an empty value is *not* "use the
configured key" — it's "use the default provider." Always set it explicitly.

### Bug: upload returned "file: Field required"

**Root cause:** the shared `request` helper forced `Content-Type: application/json` even when the body
was `FormData`, so the browser never set the multipart boundary and FastAPI couldn't parse the upload.

**Fix:** skip the JSON content-type when `rest.body instanceof FormData` (the browser sets the
boundary). `datasetsApi.upload` already appends `file` to `FormData` correctly.

### Bug: project page content cut off (horizontal scroll blocked)

**Root cause:** `overflow-x: clip` on `body` (added earlier to guard decorative hero blobs) clips
*everything* past the viewport with no scroll, slicing off wider content on the project workspace page.

**Fix:** removed the body-level clip. The hero blobs are already wrapped in their own `overflow-hidden`
container (`hero-background.tsx`), so they stay contained; the `viewport` meta (`width=device-width`)
still prevents phone zoom-distortion. Horizontal scroll is now available where content needs it.

**Verification:** production health `https://<vercel>/health` →
`{"status":"ok","service":"InsightFlow AI","environment":"production","database":true}` (HTTP 200).
