# Design: SQL Generation (Sprint 2, M2)

**Date:** 2026-07-17
**Status:** Approved
**Depends on:** dataset `profile`/`understanding` (Sprint 1 / M1), dataset storage/loading,
the EDA `ChartSpec` contract (M1) for suggested visualizations, the hybrid profiling +
OpenRouter workflow.

## Context & goal

InsightFlow AI should feel like collaborating with an **AI Data Analyst**, not browsing a
library of pre-generated queries. For SQL, the workflow is a tight **Question → SQL** loop:

```
User asks a business question
  → AI interprets intent and generates SQL
  → AI explains the SQL
  → User reviews and edits the SQL (editable before execution)
  → Deterministic engine validates + executes safely
  → Results are displayed (with execution time)
  → The most appropriate visualization is suggested
  → AI-generated business insights are produced
```

This milestone builds that loop. Crucially it defines **one SQL engine for the whole
application**: the AI Chat module (later milestone) must reuse this exact pipeline rather
than introducing a second SQL system. There is exactly one place SQL is generated
(`app/services/sql/proposer.py`) and exactly one place it is validated/executed
(`app/services/sql/engine.py`).

### Non-goals (this milestone)
- **No new dataset version is created.** SQL is read-only analysis of an existing version,
  like EDA. The `origin`/lineage machinery stays for transformations only.
- No arbitrary SQL playground free-for-all — every executed query is tied to a business
  question and persisted to a searchable project history.
- No natural-language *result* explanation beyond the structured insight bullets.
- AI Chat UI is a later milestone; this milestone only builds the reusable engine + a
  focused Question→SQL panel that proves it out.

## Core principles

1. **One SQL engine.** All SQL generation and execution flows through `app/services/sql/`.
   No other module generates or runs SQL.
2. **Deterministic execution, best-effort AI.** SQL *generation* and *insight* prose are
   best-effort (deterministic fallback, never a 5xx). SQL *validation + execution* is fully
   deterministic and always succeeds-or-returns-a-clear-error.
3. **Read-only sandbox.** Every query runs against the in-memory pandas DataFrame for that
   dataset version — **never a live database**. Only read-only statements are allowed.
   This directly resolves the "SQL sandbox security considerations pending" known issue.
4. **AI sees facts, not data.** The LLM receives the `DatasetProfile` (column names, types,
   sample values, stats) + the user's question — never the raw rows.
5. **HITL = review + edit + execute.** The human always sees and can edit the SQL before it
   runs; nothing executes without an explicit user action.

## Architecture

```
frontend (sql-panel)
   │  POST /sql/generate {dataset_id, question}
   ▼
app/services/sql/proposer.py   generate_sql(question, profile, understanding?)
   │  (best-effort; sends profile + question to complete_json; returns
   │   sql + explanation + confidence + suggested_visualization + ai_available)
   ▼
frontend (editable SQL + explanation + viz + Execute button)
   │  POST /sql/run {dataset_id, sql, question?, explanation?, suggested_visualization?, insights?}
   ▼
app/services/sql/engine.py
   ├─ validate_sql(sql, allowed_columns)   # SELECT-only, no DDL/DML, cols whitelisted
   └─ execute_query(df, sql, timeout, max_rows)   # duckdb over the in-memory frame
   ▼
app/services/sql/insights.py  generate_insights(...)   # best-effort prose on the result
   ▼
SqlQueryRecord persisted (history)  +  SqlResult returned to frontend
```

### Execution engine decision (recommended: DuckDB)

| Option | Pros | Cons |
|--------|------|------|
| **DuckDB** (queries the pandas frame in-process) | Industry-standard SQL; fast; columnar; can register a DataFrame as a relation and run arbitrary `SELECT`/`WITH`; no server; trivially sandboxed (no network, no FS). Easy timeout via threading. | Extra dependency. |
| **pandasql** (`sqldf` over sqlite) | Lightweight, familiar. | Slower, sqlite dialect quirks, weaker parsing, harder to enforce read-only cleanly. |
| **Real DB (Postgres)** | Real dialect. | **Rejected:** network/FS access, harder to sandbox, mixes app data with user queries, violates "never a live database." |

**Chosen: DuckDB.** The dataset DataFrame is registered as a relation named `dataset`; the
LLM is told the table is called `dataset` and may reference only the profile's columns. All
execution is in-process and read-only.

### Validation (deterministic, before execution)

`validate_sql(sql, allowed_columns) -> (ok: bool, error: str | None)`:
- **Single statement.** Reject if sqlglot finds more than one statement.
- **Read-only.** The top-level command must be `SELECT`/`WITH` (CTE). Reject any of:
  `DROP, DELETE, UPDATE, ALTER, TRUNCATE, INSERT, CREATE, REPLACE, ATTACH, DETACH, COPY,
  GRANT, REVOKE, PRAGMA, EXECUTE, CALL, MERGE, VACUUM, BEGIN, COMMIT, ROLLBACK, SET`.
- **Single table.** The only table referenced must be `dataset` (the registered frame).
  Reject references to any other relation.
- **Column whitelist.** Every column identifier must be in `allowed_columns` (the dataset's
  columns). Unknown columns → reject with the column name in the error.
- **Syntax.** sqlglot must parse cleanly; parse failure → reject with the message.
- Parsing is done with **sqlglot** (dialect `duckdb`), independent of execution, so unsafe
  queries fail fast with a clear message (returned as HTTP 422 with `detail`).

### Execution

`execute_query(df, sql, timeout_s=10, max_rows=2000) -> SqlResult`:
- Register the frame as `dataset` in a fresh DuckDB connection (no persistence).
- Run in a worker thread with `concurrent.futures` + `timeout_s`; on timeout → clear error.
- Cap returned rows at `max_rows` (apply `LIMIT` if absent, or truncate after). Set
  `truncated=True` when the result exceeded the cap.
- Return `columns`, `rows` (list of dicts, JSON-safe), `row_count`, `truncated`,
  `duration_ms`.

## Schemas (`app/schemas/sql.py`)

```python
class SqlVisualization(BaseModel):
    chart_type: str            # "bar" | "line" | "scatter" | "histogram" | "pie" | "box" | "heatmap"
    rationale: str             # why this chart fits the result
    x: str | None = None       # suggested axis/series columns
    y: str | None = None

class SqlProposal(BaseModel):          # response from POST /sql/generate
    business_question: str
    sql: str
    explanation: str
    confidence: float                 # 0-1
    suggested_visualization: SqlVisualization | None = None
    ai_available: bool = True

class SqlRunRequest(BaseModel):       # body for POST /sql/run
    dataset_id: int
    sql: str
    edited: bool = False              # True if the user modified the AI-generated SQL
    business_question: str | None = None
    explanation: str | None = None
    suggested_visualization: SqlVisualization | None = None

class SqlResult(BaseModel):           # response from POST /sql/run
    columns: list[str]
    rows: list[dict]
    row_count: int
    truncated: bool
    duration_ms: float
    insights: list[str] = []          # best-effort AI business insights
    insights_ai_available: bool = True
    # Echoed-through persistence fields for the history row:
    persisted_id: int | None = None
```

`SqlQueryRecord` (history model, see below) is the persisted shape:
`{id, project_id, dataset_id, owner_id, business_question, sql, edited (bool),
explanation, suggested_visualization, insights, columns, row_count, truncated,
duration_ms, executed_at}`. `rows` are **not** stored — only result *metadata* (per the
"Result metadata" persistence requirement), keeping history lean and searchable.

## Persistence (searchable history)

New table **`sql_queries`** (`app/models/sql_query.py`, SQLModel) — one row per executed
query:

| column | type | notes |
|--------|------|-------|
| `id` | int PK | |
| `project_id` | int FK `projects.id`, indexed | history is per-project workspace |
| `dataset_id` | int FK `datasets.id`, indexed | which version was queried |
| `owner_id` | int FK `users.id`, indexed | owner guard |
| `business_question` | str | the user's question |
| `sql` | str (text) | final executed SQL (edited if user changed it) |
| `edited` | bool | True if user modified the AI SQL before running |
| `explanation` | str | AI explanation of the SQL |
| `suggested_visualization` | JSON | chart_type + rationale |
| `insights` | JSON | list[str] business insights |
| `columns` | JSON | result column names |
| `row_count` | int | rows returned |
| `truncated` | bool | exceeded row cap |
| `duration_ms` | float | execution time |
| `executed_at` | datetime | execution timestamp |

New Alembic migration creates `sql_queries` with the FKs + indexes. History is listed per
project (and optionally filtered by `dataset_id`), with an optional free-text `q` search
over `business_question` + `sql` (ILIKE), satisfying "searchable SQL history for the
project." Owner-guarded: a user only sees their own queries.

## Backend service (`app/services/sql/`)

- **`engine.py`** — `validate_sql`, `execute_query` (DuckDB + threading timeout + row cap).
  Pure, deterministic, no LLM.
- **`proposer.py`** — `async generate_sql(question, profile, understanding=None) ->
  SqlProposal`. Sends the profile (column names/types/sample stats, **not raw rows**) + the
  question to `complete_json`, asks for `{sql, explanation, confidence,
  suggested_visualization:{chart_type, rationale}}`. Validates the returned SQL with
  `validate_sql` — if invalid, drops it and returns `ai_available=False` with an empty `sql`
  so the user can write their own (the workflow never blocks on the LLM). Best-effort
  fallback: `ai_available=False`, `sql=""`, explanation "AI unavailable — write your own SQL."
- **`insights.py`** — `async generate_insights(question, sql, result_summary, profile) ->
  (list[str], bool)`. Best-effort: sends a small result summary (row count, column names,
  a few sample rows, basic stats) to `complete_json` for 2–4 insight bullets. On failure →
  deterministic templated bullets (e.g. "Returned N rows across M columns."). Never raises.
- **`__init__.py`** — exports `generate_sql`, `validate_sql`, `execute_query`,
  `generate_insights`. This is the **single SQL engine surface** the future AI Chat reuses.

## Endpoints (mounted at `/api/v1`, new `sql.router`)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/sql/generate` | Body `{dataset_id, question}`. Owner-guarded; 409 if dataset unprofiled. Returns `SqlProposal` (best-effort; `sql` may be empty + `ai_available=False`). |
| `POST` | `/sql/run` | Body `SqlRunRequest`. Owner-guarded. `validate_sql` → 422 on unsafe/invalid; `execute_query` under timeout; `generate_insights` (best-effort); persist a `SqlQueryRecord` (using `edited` to mark manual changes); return `SqlResult` (incl. `persisted_id`). |
| `GET`  | `/sql/history` | Query params `project_id` (required), `dataset_id?`, `q?`. Owner-guarded list (newest first), optional `q` ILIKE search. |
| `DELETE` | `/sql/history/{id}` | Owner-guarded delete of a history row (404 if not found / not owned). |

Mounting mirrors cleaning/eda: add `sql` to `app/api/routes/__init__.py` and
`app/main.py` (`app.include_router(sql.router, prefix=API_PREFIX)`).

**Suggested-visualization determinism:** `generate_sql` returns a best-effort
`suggested_visualization`. After execution, the panel can reaffirm it from the **actual**
result columns using a tiny deterministic heuristic (1 numeric → histogram; 1 categorical +
1 numeric → bar; 2 numeric → scatter/line; low-card categorical alone → pie). The heuristic
lives in `engine.py` (`suggest_chart(result_columns, result_sample)`) so it's offline and
reusable. The panel shows the (possibly refined) suggestion and offers to open it in the
existing `ChartRenderer`.

## Frontend

- **`lib/types.ts`** — `SqlVisualization`, `SqlProposal`, `SqlRunRequest`, `SqlResult`,
  `SqlQueryRecord`.
- **`lib/api.ts`** — `sqlApi.generate(datasetId, question)`, `sqlApi.run(req)`,
  `sqlApi.history({projectId, datasetId?, q?})`, `sqlApi.remove(id)`.
- **`components/sql-panel.tsx`** (new) — modal, like `eda-panel`/`cleaning-panel`:
  1. **Ask** input: business question + Generate (calls `sqlApi.generate`).
  2. **Review/Edit**: editable SQL `<textarea>`, explanation, confidence badge, suggested
     visualization chip.
  3. **Execute**: runs `sqlApi.run`; on validation error shows the clear message; on success
     shows a results table (rows + columns, truncated note), execution time, and the
     suggested visualization (rendered via `ChartRenderer`); insights bullets below.
  4. **History**: a searchable list (local filter over `sqlApi.history`) of past queries for
     the project; click to reload question/SQL. Each executed query is auto-persisted.
- **`app/projects/[id]/page.tsx`** — a **SQL** button per dataset card, shown when
  `d.profile` exists (parallel to Analyze/Clean/EDA), opening `<SqlPanel>`.

Add dependency **`duckdb`** (backend) and **`sqlglot`** (backend) to `backend/requirements.txt`
/ venv.

## Safety checklist (closes the known issue)

- [x] SQL runs only against the in-memory DataFrame (DuckDB relation), never a live DB.
- [x] `validate_sql` enforces single statement, SELECT/WITH only, no DDL/DML, single allowed
      table (`dataset`), column whitelist, clean parse.
- [x] Execution capped by `max_rows` and a wall-clock `timeout_s` (threaded).
- [x] Validation errors returned as 422 with a clear, specific `detail` (column/statement).
- [x] Nothing executes without an explicit user Execute action; AI never auto-runs SQL.
- [x] Owner-guarded everywhere; history is per-user, per-project.

## Future compatibility

- **One SQL engine.** AI Chat (later) imports `generate_sql` + `validate_sql` +
  `execute_query` + `generate_insights` from `app/services/sql/` — no second system.
- **Reusable `ChartSpec`/`ChartRenderer`.** Suggested visualizations reuse the EDA
  `ChartSpec` contract and `ChartRenderer`, so an accepted SQL result chart slots into
  future Dashboards/Reports without new chart code.
- **History as assets.** Persisted `SqlQueryRecord`s are searchable, reusable query assets
  (future: re-run, pin to a dashboard, cite in AI Chat / Reports).

## Verification

1. `py_compile` all changed backend files.
2. **Engine unit checks** (`tests/test_sql_engine.py`):
   - `validate_sql` rejects `DROP`/`DELETE`/`UPDATE`/`INSERT`/`CREATE`/multi-statement/
     other-table references/unknown columns; accepts a valid `SELECT`/CTE over `dataset`.
   - `execute_query` returns correct columns/rows for a known frame; `truncated=True` when
     result exceeds `max_rows`; running an unsafe statement raises a clear validation error
     before execution; timeout path is covered (optional).
3. **Proposer unit checks** (`tests/test_sql_proposer.py`):
   - With `complete_json` monkeypatched to return valid SQL → `SqlProposal.sql` populated,
     `ai_available=True`.
   - With `complete_json` raising → `ai_available=False`, `sql=""` (user can self-write).
   - With `complete_json` returning SQL referencing an unknown column → `validate_sql`
     catches it → `ai_available=False`.
4. **TestClient e2e** (Postgres):
   - `POST /sql/generate` on an unprofiled dataset → 409.
   - `POST /sql/generate` on a profiled dataset returns a `SqlProposal`.
   - `POST /sql/run` with a destructive SQL → 422 with clear detail; **no** history row
     created.
   - `POST /sql/run` with valid SQL → `SqlResult` with rows; a `SqlQueryRecord` persisted;
     `GET /sql/history?project_id=` lists it; `q=` search filters it.
   - Owner guard: another user → 403/404 on history/run.
   - `DELETE /sql/history/{id}` removes the row.
5. **Frontend:** `tsc --noEmit`, `next lint`, `next build`; `sql-panel` smoke-renders the
   ask→edit→execute→results→history flow (manual or lightweight).
6. **Docs:** tick **Sprint 2 M2** in `PROJECT_PROGRESS.md`; add a `DEVELOPMENT_LOG.md`
   entry; resolve the "SQL sandbox security pending" known issue; commit (no push —
   maintainer pushes).

## Out of scope (future milestones)

AI Chat conversational UI, dashboards that pin SQL-result charts, report embedding of SQL
queries, export of query results — these **consume** the single SQL engine + history, and
are built later.
