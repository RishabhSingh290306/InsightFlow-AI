# Design: Conversational Investigation / Follow-up Questions (SQL)

**Date:** 2026-07-17
**Status:** Approved
**Depends on:** the SQL Generation milestone (Sprint 2, M2) — `app/services/sql/` engine,
proposer, insights, routes, `sql_queries` history table, and the `SqlPanel` UI. This is an
**additive** milestone on top of it; no re-architecture.

## Context & goal

The SQL milestone ends the loop at one answer: the user asks a question, the AI generates +
executes SQL, shows the table, draws a chart, and writes insights — then stops. Each query is
an isolated island.

This milestone turns those islands into a **conversational investigation**: after a result, the
AI proactively suggests follow-up questions built on what was just learned (e.g. *"Which region
generated the highest revenue?"* → *"Why is the South region outperforming others?"*). Each
answered follow-up extends the chain, so the panel reads like a vertical chat thread instead of a
stack of unrelated queries.

```
User asks a business question
  → AI generates + executes SQL (existing loop)
  → table + chart + insights are shown (existing)
  → AI proposes 2–4 follow-up questions, aware of the full chain so far
  → User clicks a follow-up chip
  → Next turn is generated WITH chain context (proactive), appended below
  → (human still reviews/edits/executes each turn — HITL unchanged)
```

### Non-goals (this milestone)
- No new dataset version is created. SQL stays read-only analysis of an existing version.
- No extra LLM "summary narration" beyond the existing insights + the new follow-up questions.
- AI Chat (full conversational UI) is a later milestone; this one extends the focused SQL panel
  into a multi-turn thread. The single SQL engine is still the only place SQL is generated or run.
- Follow-ups **propose** the next SQL; they never auto-execute. HITL is preserved exactly.

## Design decisions (confirmed with maintainer)

1. **Loop depth = Multi-turn chain.** The AI maintains the investigation thread: each follow-up
   is generated aware of the prior question + SQL + result summary, and each answered follow-up
   builds on the chain.
2. **UI model = Chat-style thread.** A vertical thread where each turn shows the question, the
   SQL, the result table, the chart, the insights, and follow-up chips. Clicking a chip appends
   the next turn below (carrying the chain context).
3. **History link = Link turns in history.** A nullable `parent_query_id` on `sql_queries` links
   each turn to the one it followed up, so history can reconstruct and display whole
   investigations (and the panel can rehydrate a thread after a refresh).

## Core principles (inherit from the SQL milestone)

1. **One SQL engine.** All SQL generation/execution still flows through `app/services/sql/`.
2. **Deterministic execution, best-effort AI.** Generation + insights + follow-up *suggestion*
   are best-effort (deterministic fallback, never a 5xx). Validation + execution stay fully
   deterministic.
3. **Read-only sandbox.** Every turn runs against the in-memory DataFrame (DuckDB), never a live
   DB.
4. **AI sees facts, not data.** The LLM receives the `DatasetProfile` + the chain's question/SQL/
   result-summary only — never raw rows.
5. **HITL = review + edit + execute.** The human always sees and can edit the SQL before it
   runs; only an explicit Execute runs it. **Follow-up chips auto-generate SQL for the next turn
   but never auto-run it.**

## Architecture

```
frontend (sql-panel, now a thread of Turns)
   │  POST /sql/generate {dataset_id, question, chain?}
   ▼
app/services/sql/proposer.py   generate_sql(question, profile, understanding?, chain?)
   │  (chain summary injected into the prompt so follow-up SQL is informed)
   ▼
frontend (editable SQL + explanation + viz)
   │  POST /sql/run {dataset_id, sql, business_question, ..., parent_query_id?}
   ▼
app/services/sql/engine.py        validate_sql + execute_query   (unchanged)
   ▼
app/services/sql/insights.py     interpret_result(question, sql, result_summary, chain?, profile)
                                    → (insights: list[str], followups: list[str], ai_available: bool)
   ▼
SqlQuery persisted (parent_query_id links the chain) + SqlResult (followup_questions added)
```

### Why a single combined interpretation call?

The existing `generate_insights` already sends a result summary to the LLM. Follow-up *suggestion*
needs the same context plus the chain. Rather than two round-trips, we make **one** best-effort
call that returns both `insights` and `followup_questions`. This halves latency/cost, keeps a
single failure surface, and shares one deterministic fallback (templated insights + empty
followups). The existing `generate_insights` is replaced/extended by `interpret_result`.

## Schemas (`app/schemas/sql.py`)

```python
class SqlChainTurn(BaseModel):          # context wire for chain-aware generation
    business_question: str
    sql: str
    result_summary: str                 # 1-line summary of the prior result

class SqlVisualization(BaseModel):      # unchanged
    chart_type: str
    rationale: str
    x: str | None = None
    y: str | None = None

class SqlProposal(BaseModel):           # POST /sql/generate response (adds chain)
    business_question: str
    sql: str
    explanation: str
    confidence: float
    suggested_visualization: SqlVisualization | None = None
    ai_available: bool = True

class SqlGenerateRequest(BaseModel):    # NEW body for POST /sql/generate
    dataset_id: int
    question: str
    chain: list[SqlChainTurn] | None = None

class SqlRunRequest(BaseModel):        # body for POST /sql/run (adds parent_query_id)
    dataset_id: int
    sql: str
    edited: bool = False
    business_question: str | None = None
    explanation: str | None = None
    suggested_visualization: SqlVisualization | None = None
    parent_query_id: int | None = None

class SqlResult(BaseModel):            # POST /sql/run response (adds followup_questions)
    columns: list[str]
    rows: list[dict]
    row_count: int
    truncated: bool
    duration_ms: float
    insights: list[str] = []
    insights_ai_available: bool = True
    followup_questions: list[str] = []          # NEW: proactive next-step suggestions
    followups_ai_available: bool = True         # NEW: follows the ai_available convention
    persisted_id: int | None = None             # echoed for history linkage
```

**Note:** `POST /sql/generate` previously took a loose `{dataset_id, question}` body. It now takes
a typed `SqlGenerateRequest` (with optional `chain`). The frontend is the only caller and is
updated in lockstep, so this is not a breaking external contract.

`SqlQueryRecord` (history shape, see below) gains `parent_query_id: int | None`.

## Persistence (history linkage)

`sql_queries` table (already exists) gets one new nullable column:

| column | type | notes |
|--------|------|-------|
| `parent_query_id` | int `FK sql_queries.id`, indexed, nullable | null for the first turn of an investigation; set to the persisted id of the turn this one followed up. Enables reconstructing whole investigations in history and rehydrating a thread. |

New Alembic migration (revision after `e6f7a8b9c0d1`) adds the column + index. Owner-guarded:
you can only follow up from your own queries (the run route verifies the parent, if supplied,
belongs to the same owner/project or is rejected with 422).

`SqlQuery` model (`app/models/sql_query.py`) gains:
```python
parent_query_id: int | None = Field(default=None, foreign_key="sql_queries.id", index=True)
```

## Backend service (`app/services/sql/`)

- **`engine.py`** — unchanged (`validate_sql`, `execute_query`, `suggest_chart`).
- **`proposer.py`** — `async generate_sql(question, profile, understanding=None, chain=None) ->
  SqlProposal`. When `chain` is provided, a compact summary of it (each turn's
  question → result-summary) is injected into the prompt so the generated SQL is informed by the
  investigation so far. Validation + best-effort fallback unchanged.
- **`insights.py`** — replace `generate_insights` with
  `async interpret_result(question, sql, result_summary, profile, chain=None) ->
  tuple[list[str], list[str], bool]` returning `(insights, followup_questions, ai_available)`.
  - Sends the question, the executed SQL, the result summary (row count, columns, a few sample
    rows, basic stats), the `DatasetProfile`, and the chain context (prior turns) to
    `complete_json`, asking for `{insights: [...], followup_questions: [...]}`.
  - `followup_questions` are concrete, answerable, chain-aware next steps (2–4). They must be
    phrased as standalone business questions (the UI will re-seed them as the next `question`).
  - Best-effort: on any LLM failure / bad JSON → deterministic fallback:
    `insights = ["Returned N rows across M columns."]` (templated from the summary) and
    `followup_questions = []`, `ai_available=False`. Never raises.
- **`__init__.py`** — exports `generate_sql`, `validate_sql`, `execute_query`, `interpret_result`
  (drop the now-renamed `generate_insights` export). This remains the single SQL engine surface
  the future AI Chat reuses.

## Endpoints

All mounted at `/api/v1` on the existing `sql.router` (no new router).

| Method | Path | Change |
|--------|------|--------|
| `POST` | `/sql/generate` | Body is now `SqlGenerateRequest` (typed, optional `chain`). Forwards `chain` into `generate_sql`. |
| `POST` | `/sql/run` | Body gains `parent_query_id`. After execution + `interpret_result`, persists the `SqlQuery` with `parent_query_id`, and returns `SqlResult` including `followup_questions` + `followups_ai_available`. |
| `GET`  | `/sql/history` | Unchanged (already owner/per-project, searchable). History UI will use `parent_query_id` to render chains. |
| `DELETE` | `/sql/history/{id}` | Unchanged. |

Owner guards unchanged. `parent_query_id`, when supplied, must reference a query owned by the same
user (422 otherwise).

## Frontend

- **`lib/types.ts`** — add `SqlChainTurn`, `SqlGenerateRequest`, `SqlResult.followup_questions`
  / `followups_ai_available`, `SqlQueryRecord.parent_query_id`.
- **`lib/api.ts`** — `sqlApi.generate(req: SqlGenerateRequest)` (POST typed body); `sqlApi.run`
  gains optional `parent_query_id` on its request. `history`/`remove` unchanged.
- **`components/sql-panel.tsx`** — reworked from single-result to a **thread**:
  - Local `turns: Turn[]` state. Each `Turn` = `{ question, sql, proposal, result, viz,
    insights, followups }`.
  - **Ask** input + Generate → `sqlApi.generate({dataset_id, question, chain})` where `chain` is
    the prior turns' `{business_question, sql, result_summary}`. Human reviews/edits SQL, clicks
    **Execute** → `sqlApi.run` (with `parent_query_id` = the parent turn's persisted id, if any)
    → append a new `Turn`.
  - Each turn renders: the question, a collapsible/editable SQL block, the results table, the
    `ChartRenderer` chart, the insights bullets, and a row of **follow-up chips** (from
    `result.followup_questions`).
  - **Clicking a follow-up chip** seeds the next `question`, builds the `chain` from all prior
    turns, and **auto-triggers generate** (proactive) — on success a new turn is appended with
    the proposed SQL shown for review; it is **never** auto-executed. (HITL preserved.)
  - **History**: the searchable list now reflects the chain — turns with a `parent_query_id` are
    indented/threaded under their parent; clicking a query reloads it (and its ancestors) into a
    fresh thread.
- **`app/projects/[id]/page.tsx`** — unchanged (SQL button already opens `<SqlPanel>`).

## Safety checklist (HITL + sandbox preserved)

- [x] Every turn runs against the in-memory DataFrame (DuckDB), never a live DB.
- [x] `validate_sql` still enforces single statement, SELECT/WITH only, no DDL/DML, single
      `dataset` table, column whitelist.
- [x] Execution still capped by `max_rows` + threaded `timeout_s`.
- [x] **Follow-up chips auto-generate the next SQL but never auto-execute it.** The human always
      reviews/edits/executes — unchanged HITL.
- [x] Chain context sent to the LLM contains only question/SQL/result-summary + profile — never
      raw rows.
- [x] Owner-guarded everywhere; `parent_query_id` verified to belong to the same owner.

## Future compatibility

- **One SQL engine.** AI Chat (later) reuses `generate_sql` + `validate_sql` + `execute_query` +
  `interpret_result` — no second system. The `chain` concept maps directly onto a chat message
  history, so this milestone is the foundation for full AI Chat.
- **Reusable `ChartSpec`/`ChartRenderer`.** Each turn's suggested viz reuses the EDA
  `ChartSpec`/`ChartRenderer` contract.
- **History as investigations.** Persisted `SqlQueryRecord`s form reconstructable investigation
  trees via `parent_query_id` (future: re-run a whole branch, pin to a dashboard, cite in AI
  Chat / Reports).

## Verification

1. `py_compile` all changed backend files.
2. **Insights/interpreter unit checks** (`tests/test_sql_interpret.py`):
   - With `complete_json` monkeypatched to return `{insights:[...], followup_questions:[...]}`
     → `interpret_result` returns both lists, `ai_available=True`.
   - With `complete_json` raising → `(templated_insights, [], False)`.
   - With `complete_json` returning malformed JSON (missing keys) → `([], [], False)` or
     templated insights + empty followups, never raises.
3. **Proposer chain checks** (extend `tests/test_sql_proposer.py`):
   - `generate_sql` with a non-empty `chain` includes chain context in the prompt it builds
     (assert via a captured prompt or a monkeypatched `complete_json` receiving the chain).
4. **TestClient e2e** (Postgres):
   - `POST /sql/generate` with a `chain` returns a `SqlProposal`.
   - `POST /sql/run` with valid SQL returns `SqlResult` with `followup_questions` (possibly empty
     on fallback) and `followups_ai_available`; a `SqlQueryRecord` is persisted with
     `parent_query_id` when supplied.
   - `parent_query_id` pointing at another user's query → 422; absent → null parent stored.
   - `GET /sql/history?project_id=` lists rows; rows carry `parent_query_id` for linkage.
5. **Frontend:** `tsc --noEmit`, `next lint`, `next build`; `sql-panel` smoke-renders the
   ask→execute→followups→click-chip→next-turn flow (manual or lightweight), confirming a chip
   appends a reviewed (not auto-executed) turn.
6. **Docs:** tick the new milestone in `PROJECT_PROGRESS.md`; add a `DEVELOPMENT_LOG.md` entry;
   commit (no push — maintainer pushes).

## Out of scope (future milestones)

Full AI Chat conversational UI (free-form messages, not just SQL follow-ups), dashboards pinning
SQL-result charts, report embedding of investigations, export of query-result branches — these
**consume** the single SQL engine + the `chain`/`parent_query_id` machinery and are built later.
