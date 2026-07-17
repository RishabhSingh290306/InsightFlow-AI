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

## Future Log Entries

- AI workflow design decisions
- UI component architecture
- Testing strategy evolution
- Performance optimizations
- Lessons learned during implementation