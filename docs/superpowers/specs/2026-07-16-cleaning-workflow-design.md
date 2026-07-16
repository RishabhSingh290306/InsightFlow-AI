# InsightFlow AI — Human-in-the-Loop Cleaning Workflow & Unified Dataset Versioning

**Status:** Approved — 2026-07-16
**Author:** InsightFlow AI team
**Milestone:** Cleaning Workflow (roadmap 2026-08-13)

## 1. Summary

This document specifies two tightly related capabilities:

1. **Unified dataset versioning (lineage).** Datasets become an immutable,
   Git-like version graph. The original upload is never mutated; every
   transformation produces a **new version node** that points back to its parent.
   All future data-producing workflows (cleaning, feature engineering, SQL,
   manual edits) reuse this single mechanism.
2. **Human-in-the-loop (HITL) cleaning workflow.** AI proposes cleaning
   operations from the stored profile; the human reviews, edits parameters, and
   approves each operation like a pull request; a deterministic engine executes
   only the approved operations and writes the result as a new version.

### Guiding principle

> **Deterministic code computes facts → AI interprets & proposes → Human
> approves → Deterministic code executes → new immutable version.**

The LLM only ever *proposes* operations from a fixed catalog. It never touches
data. All computation — impact estimation, preview, and execution — is
deterministic pandas. AI is best-effort: if it is unavailable, a rule-based plan
is derived from the profile's quality issues, and cleaning still works.

## 2. Scope

**In scope (this deliverable):**

- Unified version-lineage data model (parent/root pointers, origin, recipe).
- Plugin-based deterministic cleaning engine + operation registry.
- AI plan proposal (best-effort) constrained to the registry catalog.
- Deterministic, stateless preview (dry-run) endpoint.
- Apply endpoint that creates a new immutable version and re-profiles it.
- Version history **list** UI per lineage, and the PR-style cleaning review UI.

**Designed-for but deferred (later milestones):**

- Visual diffs, side-by-side version comparison, restore/branch UI.
- Additional operations (outliers, text normalization, encoding, currency,
  feature engineering) — the plugin interface makes each a drop-in.

## 3. Data model — unified lineage (Option A)

Each version **is** a `Dataset` row (extend the existing table rather than
introduce a separate `DatasetVersion` table). This reuses profiling,
understanding, storage, and the existing version counter with minimal rework and
keeps a single storage model.

New columns on `datasets` (Alembic revision, `down_revision = b2c3d4e5f60`):

| Column | Type | Meaning |
|---|---|---|
| `parent_id` | `int NULL` FK `datasets.id` | Version this row was derived from. `NULL` for uploads. |
| `root_id` | `int NULL` FK `datasets.id` | Original upload of the lineage (self for a root). `WHERE root_id = ?` lists a full lineage. |
| `origin` | `str` (default `"upload"`) | `"upload"` \| `"cleaning"`; future: `"sql"`, `"feature_eng"`, `"manual"`. |
| `recipe` | `JSON NULL` | Executed recipe for derived versions (see §6). `NULL` for uploads. |

**Backfill** existing rows on migration: `origin="upload"`, `parent_id=NULL`,
`root_id = id`. (A data migration sets `root_id = id` for existing uploads.)

**Version numbering.** The integer `version` continues along the chain: original
= v1, first cleaned = v2, etc. The UI labels v1 as "Original" and derived
versions by their origin (e.g., "Cleaned"). `name_stem` is inherited from the
parent so a lineage stays grouped.

**Immutability.** The original file and every prior version's file are never
overwritten. Cleaning always writes a new file via the storage adapter.

## 4. Operation registry — plugin interface

New package `app/services/cleaning/`. Each operation is an independent module
implementing one ABC so new operations are added without modifying the engine.

`app/services/cleaning/base.py`:

```python
class CleaningOp(ABC):
    name: str        # stable registry key, e.g. "handle_missing_values"
    label: str       # human label, e.g. "Handle Missing Values"
    category: str    # grouping, e.g. "missing", "duplicates", "types", "columns"

    def describe(self, params: dict) -> dict: ...
        # catalog entry: label, param schema, human-readable summary of effect

    def validate(self, df, params: dict) -> list[str]: ...
        # returns non-fatal warnings; raises ValueError on invalid params/columns

    def preview(self, df, params: dict) -> OperationImpact: ...
        # dry-run on a COPY of df; computes impact + samples; never mutates input

    def execute(self, df, params: dict) -> tuple[DataFrame, dict]: ...
        # returns (new_df, applied_record) for the recipe

    def rollback(self, df, record: dict) -> DataFrame | None: ...
        # where applicable; default returns None (data-level rollback is
        # "restore parent version", since versions are immutable)
```

`app/services/cleaning/registry.py` maps `name -> CleaningOp` instance and
exposes `get_operation(name)`, `all_operations()`, and `catalog()` (list of
`describe()` outputs for the UI and the AI prompt).

### v1 operations (`app/services/cleaning/operations/`)

| Module | `name` | Params |
|---|---|---|
| `missing_values.py` | `handle_missing_values` | `strategy` (`drop_rows`\|`drop_columns`\|`mean`\|`median`\|`mode`\|`constant`), `columns`, `fill_value` |
| `duplicates.py` | `remove_duplicates` | `subset` (columns or all), `keep` (`first`\|`last`) |
| `convert_types.py` | `convert_types` | `column`, `to_type` (`numeric`\|`datetime`\|`string`\|`category`), `errors` (`coerce`) |
| `columns.py` | `rename_columns` | `mapping` (`{old: new}`) |
| `columns.py` | `drop_columns` | `columns` (list) |

Adding outliers / text-norm / encoding later = one new module + one registry
entry; preview, apply, and the UI pick it up automatically.

## 5. Services & flow

- `app/services/cleaning/planner.py` — `propose_plan(profile, understanding)`:
  sends the profile + registry `catalog()` to the LLM (`complete_json`) and asks
  for operations **constrained to the catalog**. Each returned op is validated
  against the registry and the real columns; invalid ops are dropped. On any LLM
  failure it returns a **deterministic fallback plan** built from the profile's
  `data_quality_issues` / `missing_values` / `duplicate_row_count`
  (`ai_available = false`).
- `app/services/cleaning/engine.py` —
  - `run_preview(df, operations) -> CleaningPlan`: loops `op.preview()` and
    aggregates a plan summary. Deterministic; no persistence.
  - `apply(df, operations) -> tuple[DataFrame, recipe]`: executes **approved**
    ops **sequentially through the same registry**; builds the recipe.

## 6. API — routes (`app/api/routes/cleaning.py`, owner-guarded)

| Method & path | Purpose |
|---|---|
| `GET /api/v1/datasets/{id}/cleaning/operations` | Registry catalog for the UI. |
| `POST /api/v1/datasets/{id}/cleaning/plan` | AI propose + dry-run impacts → `CleaningPlan`. Requires the dataset to be profiled (else 409 asking to Analyze first). |
| `POST /api/v1/datasets/{id}/cleaning/preview` | Dry-run an edited plan → impacts + summary. Deterministic, **no persistence**. |
| `POST /api/v1/datasets/{id}/cleaning/apply` | Execute approved ops → **new child version**, re-profile it, return `DatasetRead` + recipe. |
| `GET /api/v1/datasets/{id}/lineage` | The version chain (`root_id` group), ordered, for the history list. |

`OperationImpact` returned by preview (per op): `rows_affected`,
`cols_affected`, `estimated_changes`, `warnings` (list), `execution_time_ms`,
`confidence`, `preview_before`, `preview_after` (sample rows).

`PlanSummary`: `overall_quality`, `estimated_improvement`, `estimated_time_ms`,
`operation_count`, `affected_rows`.

### Apply semantics (explicit)

- Rejected operations are **not** executed and are recorded in the recipe under
  `skipped` with a reason (`"user_rejected"`).
- Edited parameters override AI defaults; the executed params are what get
  recorded.
- The pipeline runs in memory. If an approved op **raises**, apply **aborts
  without creating a version** and returns `422` naming the failed op. No
  half-cleaned version is ever persisted (all-or-nothing at persistence).
- On full success: write the new file via the storage adapter, create the child
  `Dataset` (`parent_id`, `root_id`, `origin="cleaning"`, `version = parent+1`,
  `recipe`), then run Stage-1 profiling on the new version so it is immediately
  analyzable.

### Recipe shape (stored on the derived `Dataset`)

```json
{
  "source_version_id": 12,
  "parent_version": 1,
  "engine_version": "1.0",
  "applied": [
    {"op": "handle_missing_values",
     "params": {"strategy": "median", "columns": ["age"]},
     "impact": {"rows_affected": 132, "cols_affected": 1}}
  ],
  "skipped": [
    {"op": "drop_columns", "params": {"columns": ["id"]}, "reason": "user_rejected"}
  ],
  "created_at": "2026-07-16T00:00:00Z"
}
```

## 7. Schemas (`app/schemas/cleaning.py`)

`CleaningOperation` (op key, columns/params, explanation, confidence, approved),
`OperationImpact`, `ProposedOperation` (operation + impact), `PlanSummary`,
`CleaningPlan` (operations, summary, `ai_available`), and request/response
models: `PreviewRequest`/`ApplyRequest` (`operations: list[CleaningOperation]`),
apply returns `DatasetRead` (new version). `DatasetRead` gains `parent_id`,
`root_id`, `origin`, `recipe`.

## 8. Frontend (`frontend/`)

- `lib/types.ts` — add `CleaningOperation`, `OperationImpact`, `CleaningPlan`,
  `PlanSummary`; extend `DatasetRead` with lineage fields.
- `lib/api.ts` — `cleaningApi.plan(id)`, `preview(id, ops)`, `apply(id, ops)`,
  `lineage(id)`, `operations(id)`.
- `app/projects/[id]/page.tsx` —
  - **Version history list** per lineage (grouped by `root_id`): `v1 Original →
    v2 Cleaned → …`, each row selectable to continue analysis from it.
  - **Clean** button opens the cleaning panel: a plan **summary header**
    (overall quality, estimated improvement, estimated time, op count, affected
    rows), then each operation as a **pull-request card** — recommendation,
    explanation, confidence badge, expected impact, before/after preview,
    editable parameters, and an approve/reject toggle.
  - Editing a parameter triggers a debounced `preview` call so impact numbers
    stay live. **Apply** creates a new version and refreshes the list.
- Styling follows the existing Flat Design tokens; the review UI is checked
  against the ui-ux-pro-max rules (accessibility, touch targets, feedback).

## 9. Error handling

- **AI proposal** is best-effort → deterministic fallback plan
  (`ai_available=false`); the UI shows "AI suggestions unavailable — showing
  rule-based plan."
- **Preview/apply** are deterministic. `validate()` surfaces per-op warnings.
- **Apply failure** aborts with `422` and the failing op; no version persisted.
- Ownership enforced by the existing `_get_owned` guard.

## 10. Verification

- Migration applies on startup; existing datasets backfilled
  (`origin="upload"`, `root_id=id`).
- End-to-end: upload → understand → `plan` → `preview` (edit a param, confirm
  impact changes) → `apply` → assert the new version row has `parent_id`,
  `root_id`, `origin="cleaning"`, `recipe`; is re-profiled; and the **original
  file is unchanged**.
- Fallback: empty `OPENROUTER_API_KEY` → `plan` returns a rule-based plan with
  `ai_available=false`; apply still works.
- Preview/execute consistency: applying the previewed plan changes exactly the
  rows/columns preview reported.
- `cd frontend && npm run build` passes.
- No secrets committed; the OpenRouter key stays only in gitignored
  `backend/.env`. `git push` is performed manually by the maintainer.

## 11. Milestones (build one at a time; review gate after each)

1. **M1 — Versioning foundation:** lineage columns + migration + backfill,
   `DatasetRead` fields, `GET /lineage`, version history list UI.
2. **M2 — Cleaning engine + registry:** plugin base, registry, v1 operations,
   `run_preview`/`apply`, `operations` + `preview` endpoints (deterministic).
3. **M3 — AI planner + apply + UI:** `propose_plan` (best-effort + fallback),
   `plan` + `apply` endpoints, PR-style review UI, end-to-end verification.

Each milestone is built, tested, documented, and committed; work pauses for
maintainer review before the next begins.
