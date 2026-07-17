# Insights + Reports — Design Spec

**Date:** 2026-07-17
**Status:** Design approved
**Milestone:** Sprint 3, M1–M3 (Insights + Reports)
**Supersedes / relates to:** EDA + Visualizations (`2026-07-17-eda-visualizations-design.md`),
SQL Generation (`2026-07-17-sql-generation-design.md`), Cleaning Workflow
(`2026-07-16-cleaning-workflow-design.md`), Conversational Investigation
(`2026-07-17-conversational-investigation-design.md`)

---

## 1. Goal

Turn the per-dataset and per-project analysis already produced by InsightFlow into a
**curated, AI-narrated, interactive report** that a human can edit and then share or
export. The report aggregates the *accepted* artifacts a user has already generated —
profile, understanding, EDA charts, cleaning lineage, and SQL history — into a
professional document, lets the human review and reshape it (human-in-the-loop), and
produces a **public, read-only, interactive share link** plus PDF and Markdown exports.

This closes the loop of the platform's core principle:

> **Deterministic code computes facts. AI interprets those facts. The human approves.
> Deterministic code executes.**

The report is the *consumption* layer: it never recomputes analysis and never exposes
raw data. It only assembles and presents artifacts the human has already accepted.

---

## 2. Principles (carried from the rest of the app)

- **Report JSON is the canonical representation.** Every report is one ordered list of
  `Section` objects stored as JSON. The renderer is **presentation-only** — it resolves
  artifact references against already-stored data and never computes or mutates anything.
- **The assembly service constructs reports.** `app/services/reporting/` is the *only*
  place a `Report` is built, and it builds from **accepted** project artifacts (EDA
  charts with `accepted == True`, executed SQL records, cleaning recipes, profiles).
- **AI interprets, never computes.** Prose sections (executive summary, recommendations,
  section intros) are best-effort AI narration over *structured* artifacts. Every AI step
  has a deterministic templated fallback and sets `ai_available = False` on failure — no
  5xx, no empty report.
- **Human-in-the-loop is preserved.** The AI drafts; the human reviews, edits, reorders,
  removes, renames, and adds notes; only then is the report shared or exported. The AI
  never exports on the human's behalf.
- **Public share is strictly read-only and scoped.** The share endpoint returns *only*
  the report's own fields. No auth, no mutation verbs, no other datasets/projects/users.

---

## 3. Scope

### In scope (this milestone)

| Capability | Notes |
|------------|-------|
| **Configurable scope** | A report can be generated for **one dataset** (`scope="dataset"`) **or** a **whole project** (`scope="project"`). |
| **Report assembly** | Deterministic assembly of accepted artifacts into the 10 default sections; best-effort AI prose + fallback. |
| **Interactive editing (HITL)** | Edit text, remove sections, reorder sections, rename titles, add custom-note sections. Edits apply live before export. |
| **HTML rendering** | One `report_to_html(report)` powers the editor, the public share view, and the PDF source. |
| **PDF export** | Print the HTML via a print stylesheet (`window.print()`). Browser-print fidelity (portfolio-grade). |
| **Markdown export** | `report_to_markdown(report)` — prose + data tables; charts embedded as PNG snapshots or described. |
| **Public read-only sharing** | `GET /reports/share/{token}` — unauthenticated, read-only, branded share page with footer. |

### Explicitly out of scope (extension points — see §11)

Report versioning, report analytics (views/downloads), rich report metadata (AI model,
dataset version), and additional export formats (DOCX, HTML). The schema and contracts
are designed so these slot in later **without redesign**.

---

## 4. Default report sections

The assembly service produces these sections, in order. Each is editable.

1. **Cover Page** — title, scope (dataset name / project name), generated-at timestamp.
2. **Executive Summary** — AI-narrated synthesis of the whole analysis (fallback: templated).
3. **Dataset Overview** — rows/cols, types, preview, potential target column (per dataset for project scope).
4. **Data Quality Report** — missing values, duplicates, null %, quality issues (from `profile.data_quality_issues`).
5. **Cleaning Summary** — applied operations from the cleaning `recipe` + lineage (if any derived versions exist).
6. **Exploratory Data Analysis** — accepted `ChartSpec`s with chart-ready `data` (rendered via `ChartRenderer`).
7. **SQL Analysis** — executed `sql_queries` records (question, SQL, explanation, insights, suggested viz).
8. **Business Insights** — aggregated AI insights from understanding + SQL results.
9. **Recommendations** — AI-narrated next steps (fallback: templated from cleaning/quality recs).
10. **Appendix** — version lineage (`root_id`/`parent_id` chain), analysis timeline (created/cleaned/EDA/SQL timestamps).

Plus a `custom` section type for human-added notes.

---

## 5. Architecture

```
                 accepted artifacts (already stored)
   profile · understanding · eda(accepted) · cleaning recipe · sql_queries · lineage
                                  │
                                  ▼
                 app/services/reporting/  (ASSEMBLY — builds Report JSON)
                   assemble_report(scope, project_id, dataset_id?)
                     ├─ deterministic factual sections  (profile/quality/cleaning/eda/sql/lineage)
                     └─ best-effort AI prose  ──► complete_json  ──► fallback (ai_available=False)
                                  │
                                  ▼
                         Report  (canonical JSON: ordered Section[])
                                  │  stored on `reports` table (share_token, scope, owner/project)
                                  ▼
                 app/services/reporting/render.py  (RENDERER — presentation only)
                   report_to_html(report)  ──►  editor view · public share view · PDF (print)
                   report_to_markdown(report) ──► Markdown export
```

The renderer **resolves artifact references** (chart id, sql id, lineage) against data
already embedded in the `Report` JSON or fetched read-only from the owning dataset/query
row. It never re-profiles, re-runs SQL, or calls the LLM.

---

## 6. Data model

### 6.1 `reports` table (new Alembic migration)

```text
reports
  id            PK
  project_id    FK -> projects.id        (indexed)
  owner_id      FK -> users.id           (indexed)
  scope         str  ("dataset" | "project")
  dataset_id    FK -> datasets.id  NULL  (set when scope="dataset")
  title         str
  sections      JSON  (ordered ReportSection[])
  share_token   str   UNIQUE, indexed     (secrets.token_urlsafe(32))
  ai_available  bool  (False when prose fell back to templated)
  created_at    datetime
  updated_at    datetime
  generated_at  datetime
```

Rationale: a dedicated table (not a JSON column on `Dataset`/`Project`) because a project
needs **multiple reports + history**, a clean **share_token** with revocation/expiry later,
and future **analytics/versioning** columns — all impossible with a single column.

### 6.2 `Section` contract (the stable unit — `app/schemas/report.py`)

```python
class SectionType(str, Enum):
    COVER = "cover"
    EXECUTIVE_SUMMARY = "executive_summary"
    DATASET_OVERVIEW = "dataset_overview"
    DATA_QUALITY = "data_quality"
    CLEANING_SUMMARY = "cleaning_summary"
    EDA = "eda"
    SQL_ANALYSIS = "sql_analysis"
    BUSINESS_INSIGHTS = "business_insights"
    RECOMMENDATIONS = "recommendations"
    APPENDIX = "appendix"
    CUSTOM = "custom"

class SectionBlock(BaseModel):
    # One of: prose | chart_ref | sql_ref | table | lineage | custom_note
    kind: str
    text: str | None = None            # editable prose / note
    ref_id: str | None = None          # chart_spec id or sql_query id
    payload: dict = {}                 # resolved artifact data (chart data, sql rows meta, table)

class ReportSection(BaseModel):
    id: str                            # stable uuid (lets human reorder/remove safely)
    type: SectionType
    title: str                         # editable (rename)
    blocks: list[SectionBlock] = []

class Report(BaseModel):
    id: int
    project_id: int
    owner_id: int
    scope: str
    dataset_id: int | None = None
    title: str
    sections: list[ReportSection]
    share_token: str
    ai_available: bool
    created_at: datetime
    updated_at: datetime
    generated_at: datetime
```

The `ReportSection`/`SectionBlock` model is the contract every renderer and exporter
consumes. Adding DOCX/HTML later means adding a serializer — **not** changing this model.

---

## 7. Assembly service — `app/services/reporting/`

`assemble_report(*, scope, project_id, dataset_id=None, profile, understanding, eda,
sql_history, lineage) -> Report`

- **Deterministic factual sections** built directly from stored artifacts:
  - *Dataset Overview / Data Quality / Cleaning Summary / EDA / SQL Analysis / Appendix*
    pull from `profile`, `understanding`, `eda.charts` (only `accepted == True`),
    cleaning `recipe` + `lineage`, `sql_queries` records, and the version chain.
- **Best-effort AI prose** for *Executive Summary*, *Business Insights*, *Recommendations*,
  and section intros: send the structured artifacts (never raw data) to `complete_json`,
  constrained to a JSON shape (`{executive_summary, insights[], recommendations[],
  section_intros{}}`). On any LLM/validation failure → deterministic templated prose and
  `ai_available = False`.
- **Scope handling**:
  - `scope="dataset"` → that dataset's profile/understanding/eda + SQL where
    `dataset_id == this` + its lineage.
  - `scope="project"` → all datasets' profiles/understandings/eda (accepted charts) +
    all project SQL records + all lineages; dataset-scoped sections repeat per dataset.

The service is **pure with respect to mutation** — it reads artifacts and returns a
`Report`; persistence is the route's job.

---

## 8. Rendering & export — `app/services/reporting/render.py`

- **`report_to_html(report) -> str`** — presentation-only. Walks `sections`, renders each
  block: prose as text, `chart_ref` via the chart spec (`ChartRenderer` contract), `sql_ref`
  as a code block + insights, `table` as an HTML table, `lineage` as an ordered list. One
  function feeds the in-app editor (edit mode toggled off), the public share view, and the
  PDF print source. **No business logic, no artifact computation.**
- **`report_to_markdown(report) -> str`** — prose + data tables; charts embedded as PNG
  snapshots (rendered once via the storage adapter) or described textually when no image.
- **PDF** — the share/editor HTML is printed via a dedicated print stylesheet
  (`@media print`) using `window.print()`. No server-side PDF dependency. Charts render as
  SVG/Recharts in the HTML and print natively.
- **Extensibility** — `report_to_docx()` / `report_to_html_doc()` are future serializers
  over the same `Report` model (§11).

---

## 9. API — `app/api/routes/reports.py` (mounted at `/api/v1/reports`)

All owner-guarded (require auth + ownership) **except** the share endpoint.

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/reports/generate` | Body: `{scope, dataset_id?, title?}`. Assembles + stores a new `Report`; returns it. 409 if no profile exists for the scope. |
| `GET`  | `/reports` | List reports for a project (owner-guarded, `project_id` query). |
| `GET`  | `/reports/{id}` | Fetch one report (owner-guarded). |
| `PATCH`| `/reports/{id}` | Edit: replace `sections` (reorder/remove/rename/edit text/add custom). Owner-guarded. Updates `updated_at`. |
| `DELETE`| `/reports/{id}` | Delete (owner-guarded). |
| `GET`  | `/reports/{id}/export?format=pdf\|markdown` | Owner-guarded. `format=markdown` returns the `.md` file; `format=pdf` returns the print-ready HTML (the browser prints it client-side via the print stylesheet — no server-side PDF dependency). |
| `GET`  | `/api/v1/reports/share/{token}` | **Public, unauthenticated, read-only.** Returns *only* the report's own fields (`sections`, `title`, `scope`, `generated_at`, `ai_available`). No owner PII, no linked mutation. |

Security note: the share route is the only publicly reachable report route. It performs no
write, returns no `owner_id`/`project_id` linkage beyond what's needed to render, and never
exposes other datasets, projects, or user data. `share_token` is `secrets.token_urlsafe(32)`.

---

## 10. Frontend

- **Entry points:** a **Generate Report** button on each dataset row (`scope="dataset"`)
  and on the project page (`scope="project"`), shown when a profile exists.
- **`components/report-renderer.tsx`** — shared, presentation-only renderer used by both
  the editor (read mode) and the public share view. Reuses `chart-renderer.tsx` for charts,
  renders SQL snippets + insights, tables, and lineage.
- **`components/report-editor.tsx`** — interactive HITL editor:
  - per-section editable prose (textareas),
  - drag-to-reorder sections,
  - remove / rename (title) / add custom-note section,
  - **live preview** (edits reflected immediately via local state),
  - **Download PDF** (print stylesheet) and **Download Markdown** buttons,
  - **Copy Share Link** (copies `…/reports/share/{token}` and shows it).
- **`app/reports/[id]/page.tsx`** — owner view: editable (`report-editor.tsx`).
- **`app/reports/share/[token]/page.tsx`** — **public, read-only** share page:
  - renders via `report-renderer.tsx`,
  - InsightFlow branding,
  - **footer:** `Generated with InsightFlow AI` + `Analyze your own dataset →` linking to
    the app homepage,
  - Download PDF / Download Markdown buttons,
  - strictly no edit/delete/SQL/cleaning controls.
- `lib/types.ts` — `ReportSection` / `SectionBlock` / `Report` / `ReportGenerateRequest`
  / `ReportUpdateRequest`. `lib/api.ts` — `reportsApi` (generate/list/get/update/delete/
  export/share).

---

## 11. Future extension points (explicitly NOT in this milestone)

Designed-for, not implemented. The schema/contracts already accommodate them:

| Extension | How it slots in (no redesign) |
|-----------|-------------------------------|
| **Report versioning** | Add `version` + `parent_report_id` to `reports`; snapshot sections on each PATCH (Git-like, like datasets). |
| **Report analytics** | Add `view_count` / `download_count` columns; increment from the share + export routes. |
| **Report metadata** | Add `meta` JSON (AI model used, dataset version id, generation params). |
| **DOCX / HTML export** | Add `report_to_docx()` / `report_to_html_doc()` serializers over the same `Report` model. |
| **Link expiry / revocation / password** | Add `expires_at` / `revoked` / `password_hash` columns; enforced in the share route. |

No current code should hard-depend on their absence.

---

## 12. Milestones (build one at a time — pause for maintainer review after each)

### M1 — Report assembly + storage + API
- `reports` table + migration; `ReportSection`/`SectionBlock`/`Report` schemas.
- `app/services/reporting/`: `assemble_report` (deterministic factual sections +
  best-effort AI prose + fallback, `ai_available`), scope handling.
- Routes: generate / list / get / patch / delete / export; owner-guarded.
- **Verify:** `py_compile` + pytest (assembly for dataset & project scope; AI-unavailable
  fallback populates templated prose; 409 before profile); manual TestClient e2e
  (generate → get → patch sections → delete).

### M2 — Interactive editor UI + export
- `report-renderer.tsx` (presentation-only, reuses `ChartRenderer`), `report-editor.tsx`
  (edit/reorder/remove/rename/custom-note, live preview), PDF (print stylesheet) + Markdown
  export, copy share link. `app/reports/[id]/page.tsx`. Types + `reportsApi`.
- **Verify:** `tsc` / `next lint` / `next build`; manual e2e (generate → edit → reorder →
  export PDF + MD → copy link).

### M3 — Public read-only share view
- `app/reports/share/[token]/page.tsx` (public, read-only, branded, footer, downloads);
  `GET /reports/share/{token}` (returns only report fields).
- **Verify:** open share link unauthenticated → renders; confirm **no** owner PII, **no**
  mutation routes reachable, **no** other datasets/projects leaked; downloads work.

---

## 13. Testing summary

- **Backend:** assembly unit tests (dataset + project scope) assert every default section
  is populated from *accepted* artifacts; AI-failure path yields templated prose with
  `ai_available=False`; `report_to_markdown`/`report_to_html` non-empty and resolve chart/SQL
  refs; public share returns the report and **only** the report's own fields.
- **Frontend:** `tsc` / `lint` / `build`; manual e2e of generate → edit → export → share.
- No workflow returns a 5xx due to LLM/export failure.
