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

## Future Log Entries

- AI workflow design decisions
- UI component architecture
- Testing strategy evolution
- Performance optimizations
- Lessons learned during implementation