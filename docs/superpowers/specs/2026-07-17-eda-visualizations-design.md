# Design: EDA + Visualizations (Sprint 2, M1)

**Date:** 2026-07-17
**Status:** Approved
**Depends on:** M1/M2/M3 cleaning workflow (Sprint 1), dataset `profile`/`understanding`,
Git-like versioning.

## Context & goal

InsightFlow AI is an AI-powered data-analyst platform (FastAPI backend + Next.js 15
frontend, modular monolith). Sprint 1 shipped the HITL cleaning workflow: deterministic
pandas computes facts, the LLM proposes from a fixed catalog, the human approves, and
deterministic code executes into a new immutable dataset version.

This milestone adds **Exploratory Data Analysis (EDA) + Visualizations** as the next
building block. From a profiled dataset's `DatasetProfile`, the backend deterministically
computes statistics and **chart-ready data**, selects chart *types*, and emits a universal
**`ChartSpec`**. The LLM only writes *prose* (title, business question, explanation,
recommended reason, confidence) and recommends a relevant subset. The human **accepts or
rejects** each recommended chart. Accepted charts persist on the dataset and become reusable
assets for future modules (Dashboard Builder, AI Reports, Notebook, AI Chat, Export Engine).

### Non-goals (this milestone)
- No chart-configuration UI (swap type / change axes / aggregations / styling). Deferred to
  later milestones or exposed naturally through AI Chat.
- No user-created charts from scratch. The human curates AI recommendations only.
- No new dataset version is created — EDA is read-only analysis of an existing version.

## Core principles

1. **Backend = facts only.** The deterministic EDA engine computes statistics, selects chart
   types, and prepares `data`. The LLM only interprets and proposes prose. The backend never
   imports React or any presentation code.
2. **One spec, many consumers.** `ChartSpec` is the single visualization contract. Every
   downstream module consumes accepted `ChartSpec`s without regenerating chart data.
3. **Best-effort AI.** Every LLM step has a deterministic fallback; the workflow never returns
   a 5xx because of an AI issue. `ai_available` flags the fallback.
4. **HITL = accept/reject only.** Mirrors the cleaning workflow. The human decides which
   visualizations become project assets; they do not configure charts.
5. **Read-only.** EDA is computed from and stored on the dataset version it describes. It never
   mutates the dataset's data or creates a new version.

## Universal chart specification

Defined in `app/schemas/eda.py`. Every visualization — present and future — conforms to this
single model so the frontend `ChartRenderer` and all consumers stay stable.

```python
class ChartSpec(BaseModel):
    id: str                         # uuid, stable for this computation
    chart_type: Literal[
        "bar", "line", "scatter", "histogram", "pie", "box", "heatmap"
    ]
    title: str
    subtitle: str | None = None
    business_question: str          # what this chart answers
    explanation: str                # plain-English description of the chart
    recommended_reason: str         # why the AI (or fallback) recommended it
    confidence: float               # 0-1
    axis_config: dict               # {x, y, x_label, y_label, ...} (flexible)
    data: list[dict]                # chart-ready rows (bins / counts / points / matrix)
    metadata: dict                  # source columns, aggregation, summary stats
    accepted: bool = False          # persisted human decision
```

`EdaResult` wraps the stored analysis:

```python
class EdaResult(BaseModel):
    ai_available: bool
    charts: list[ChartSpec]
```

`data` is the rendered-unit-ready payload (e.g. histogram → `[{bin, count}]`, heatmap →
`[{x, y, value}]`, box → `[{label, min, q1, median, q3, max}]`, scatter →
`[{x, y}]`). The frontend maps `chart_type` → the correct Recharts component and feeds it
`data` directly.

## Backend engine (`app/services/eda/`)

### `engine.py` — deterministic candidate builder
Input: the loaded dataframe + its `DatasetProfile`. Output: a list of `ChartSpec` candidates
with `data` computed and prose fields **blank** (filled later by the proposer). Candidate
rules:

- **numeric column** →
  - `histogram`: binned counts (fixed bin count, e.g. Freedman–Diaconis or a sensible default
    like `min(50, sqrt(n))`); `data = [{bin, count}]`.
  - `box`: five-number summary (`min, q1, median, q3, max`, optional outliers);
    `data = [{label, min, q1, median, q3, max}]`.
  - summary stats recorded in `metadata` (mean, std, skew, etc.).
- **categorical column** →
  - `bar`: top-N value counts; `data = [{category, count}]`.
  - low-cardinality (≤ ~8 unique) → also a `pie`; `data = [{category, value}]`.
- **numeric pairs** →
  - `heatmap`: pairwise Pearson correlation matrix; `data = [{x, y, value}]` over all
    numeric×numeric cells (symmetric).
  - `scatter`: top-K correlated numeric pairs by `|corr|`; `data = [{x, y}]` per pair (one
    chart per pair, titled with both column names).
- **missingness** → `bar` of `missing_values` per column (from `profile.missing_values`);
  skipped if none missing.
- **target relationship** → if `potential_target_column` is set:
  - numeric target → `box` (or `bar` of mean) of target grouped by top categorical column.
  - categorical target → `bar` of target distribution, or target-vs-top-category `bar`.

Every candidate carries `metadata` with its source column(s) and aggregation so future modules
know lineage. Candidate generation is **pure pandas**, deterministic, and always succeeds.

### `proposer.py` — AI prose + recommendation (best-effort)
`propose_charts(profile, understanding, candidates) -> (charts_with_prose, ai_available)`.

- Builds a system + user prompt sending the **profile** + **understanding** (never raw data)
  and the candidate list (id + chart_type + source columns), asking for a JSON array keyed by
  candidate `id` with: `title`, `business_question`, `explanation`, `recommended_reason`,
  `confidence` (0-1), and a `recommended: bool` flag suggesting which to surface.
- Validates returned ids against candidate ids; drops unknown/extra entries.
- **Fallback** (missing key / API error / bad JSON / `OPENROUTER_API_KEY` unset): keep **all**
  candidates, fill prose from templates (business question derived from column name + chart
  type; explanation "shows the distribution of `<col>`"; recommended_reason "automatically
  generated from the profile"); confidence derived from data quality (e.g. lower if many
  missing values). Sets `ai_available = False`.

The proposer mirrors `app/services/cleaning/planner.py`'s structure (catalog/validate/fallback)
and reuses `app/services/llm.py::complete_json`.

## Endpoints (mounted at `/api/v1/datasets`, like cleaning)

| Method | Path | Purpose |
|--------|------|---------|
| `POST`   | `/{id}/eda`      | Owner-guarded; requires `dataset.profile`. Loads df, builds candidates, runs proposer, **stores** `EdaResult` on `dataset.eda`, returns it. 409 if unprofiled. |
| `GET`    | `/{id}/eda`      | Returns stored `EdaResult` (404 if not computed yet). Owner-guarded. |
| `PATCH`  | `/{id}/eda`      | Body `{accepted_ids: [...]}`. Flips `accepted` on matching charts, persists, returns updated `EdaResult`. Owner-guarded. |

This maps to the cleaning workflow's propose → review → persist cycle:
`POST /eda` (propose) → UI review → `PATCH /eda` (persist accepted). Unlike cleaning, nothing
is "executed" — accept/reject only records the human's curation.

## Persistence

New nullable JSON column `eda` on `Dataset` (mirrors `profile` / `understanding`). An Alembic
migration adds it. `eda` stores the full `EdaResult` (recommended charts + `accepted` flags)
for the version it was computed from. Accepted charts are reusable by reading the dataset —
no new table needed (YAGNI; a dedicated `analyses` table can be added later only if
cross-dataset aggregation is required).

Storage adapter and DB access follow the existing swap points (`app/core/storage.py`,
`app/db` Repository).

## Frontend

- **`lib/types.ts`** — `ChartSpec`, `EdaResult`, `EdaAcceptRequest { accepted_ids: string[] }`.
- **`lib/api.ts`** — `edaApi`: `generate(id)`, `get(id)`, `accept(id, accepted_ids)`.
- **`components/chart-renderer.tsx`** — universal, data-driven renderer. `switch(chart_type)`:
  - `bar`, `line`, `scatter`, `pie` → native Recharts (`<BarChart>`, `<LineChart>`,
    `<ScatterChart>`, `<PieChart>`).
  - `histogram` → Recharts `<BarChart>` over bin-count `data` (categorical x-axis).
  - `box` → small **custom SVG** component driven by the five-number-summary `data` (Recharts
    has no native box plot).
  - `heatmap` → small **custom SVG/grid** component driven by the `{x, y, value}` matrix
    (Recharts has no native heatmap).
  - All wrapped in a responsive `ResponsiveContainer`, themed via existing design tokens
    (Tailwind classes / CSS variables), with tooltips.
- **`components/eda-panel.tsx`** — EDA view (tab or modal) for a dataset:
  - Summary stat cards (row/col counts, null %, duplicates) + data-quality issues.
  - Recommended chart cards: `ChartRenderer` preview + business question + explanation +
    recommended reason + **confidence badge** + **Accept / Reject** buttons.
  - Accepted charts stay visually marked; Accept calls `edaApi.accept(id, accepted_ids)`.
  - On open: if no stored `eda`, call `edaApi.generate` first.
- **`app/projects/[id]/page.tsx`** — an **EDA** button per dataset card, shown only when
  `dataset.profile` exists (parallel to the existing Analyze/Clean buttons), opening the panel.
- **Dependency:** add `recharts` (v2, compatible with React 18.3 / Next 15) to
  `frontend/package.json`.

## Data flow (end to end)

1. User clicks **EDA** on a profiled dataset → `edaApi.generate(id)`.
2. Backend `POST /eda`: loads df via storage adapter, runs `engine.build_candidates`, runs
   `proposer.propose_charts`, stores `EdaResult` on `dataset.eda`, returns it.
3. Frontend renders summary + chart cards via `ChartRenderer`.
4. User **accepts/rejects** charts → `edaApi.accept(id, accepted_ids)` → `PATCH /eda` flips
   `accepted` flags and persists.
5. Accepted `ChartSpec`s remain on the dataset and are consumable by future modules.

## Verification

1. `py_compile` all changed backend files.
2. **Engine unit checks:** histogram bin counts sum to row count; correlation heatmap matrix is
   symmetric and diagonal ≈ 1; missingness bar counts match `profile.missing_values`; box
   five-number summary ordering correct.
3. **TestClient e2e (Postgres):**
   - `POST /eda` on a profiled dataset returns `ChartSpec`s with computed `data` + prose;
     `ai_available` reflects key presence.
   - **Fallback** path (no `OPENROUTER_API_KEY`) returns all candidates with templated prose
     and `ai_available=False`.
   - `POST /eda` on an **unprofiled** dataset → 409.
   - `PATCH /eda` with `accepted_ids` flips `accepted` and persists; `GET /eda` returns it.
   - Owner guard: another user → 403/404.
4. **Frontend:** `tsc --noEmit`, `next lint`, `next build`; `ChartRenderer` smoke-renders each
   of the seven chart types.
5. **Docs:** tick Sprint 2 M1 in `PROJECT_PROGRESS.md`; add a `DEVELOPMENT_LOG.md` entry; commit
   (no push — maintainer pushes).

## Reuse by future modules

Accepted `ChartSpec`s are the canonical visualization asset:
- **Dashboard Builder** — lays out accepted charts.
- **AI Reports** — embeds accepted charts as figures.
- **Notebook** — references accepted charts by id.
- **AI Chat** — can cite/return accepted charts in answers.
- **Export Engine** — serializes accepted charts (image/PDF) without recomputing `data`.

Because `data` and `metadata` are stored with each spec, none of these recompute the
underlying statistics.

## Out of scope (future milestones)

Chart-config UI (type/axis/aggregation/styling editing), adding brand-new user-defined charts,
dashboards, reports, notebook, AI chat, export — these **consume** accepted `ChartSpec`s and
are built in later milestones.
