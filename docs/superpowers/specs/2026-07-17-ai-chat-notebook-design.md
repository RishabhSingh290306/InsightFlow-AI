# Design Spec: AI Chat & Notebook (Sprint 5)

**Date:** 2026-07-17
**Status:** Design approved
**Owner:** InsightFlow AI maintainer
**Depends on:** Sprints 1–4 (Cleaning, EDA/SQL, Insights+Reports, Dashboard
Recommendations) — reuses their engines unchanged.

---

## 1. Goal

Give users a **conversational data analyst** they can talk to about their data.
The AI orchestrates the platform's existing deterministic engines (SQL, EDA,
cleaning, dashboards, reports) to answer natural-language questions, proposes
artifacts the human approves, and streams its answer live. A conversation can be
**saved as a notebook** — a durable, editable, shareable project asset — following
the exact HITL + best-effort contracts already proven across EDA, Reports, and
Dashboards.

This closes the platform's vision: *deterministic facts → AI interpretation →
human approval → deterministic execution*, surfaced through a natural-language
interface rather than a series of separate panels.

### In scope (this sprint)
- A chat panel anchored to a **dataset** or a **project** (question router).
- Real **token streaming** (SSE) of the AI's prose answer.
- AI proposes, human approves, for four artifact types: **SQL**, **EDA charts**,
  **cleaning suggestions**, **dashboard/report recommendations**.
- A **persisted, shareable notebook** (new `notebooks` table, modeled on
  `reports`) with CRUD + public read-only share link.

### Out of scope (future extensions, noted not built)
- Multi-frame / cross-dataset **joins** inside one SQL query (DuckDB over one
  in-memory frame only). Project-scope questions use aggregates/metadata, not
  joins. A future "register N tables" execution path could enable this.
- Real-time collaborative editing of a notebook (multiple users).
- Notebook versioning / fork history (`parent_notebook_id` column is designed-for
  but not implemented).
- Voice / multimodal input.

---

## 2. Core Principle (unchanged)

> Deterministic code computes facts. AI interprets those facts. The human
> approves. Deterministic code executes.

- The LLM **never** sees raw data. Every AI call receives only structured facts
  (profile, understanding, EDA candidates, dashboard context) plus an action
  catalog.
- Every AI step is **best-effort** with a deterministic fallback. No chat turn
  ever returns a 5xx because the LLM was unavailable.
- Proposed artifacts are **proposals only**. Execution (SQL run, cleaning apply,
  chart accept) requires an explicit human action.

---

## 3. Architecture & Data Flow

A **notebook is a saved chat session**. The chat UI *is* the notebook editor.
Each user message triggers a two-call AI turn:

```
User sends message
  │  POST /api/v1/chat/message  (SSE)
  ▼
build_chat_context(session, project, dataset?, user)
  → structured facts only (profile/understanding/EDA + project DashboardContext)
  ▼
CALL A — plan_turn()  → complete_json (best-effort)
  → { summary: str, actions: Action[] }
  ▼
CALL B — stream_narrative()  → complete_stream  (NEW primitive, real tokens)
  → SSE `event: token` chunks of conversational prose, live
  ▼
executor.run(action) for each proposed action  (deterministic, reuses engines)
  → SSE `event: artifact` per result
  ▼
SSE `event: done`  → persist user + assistant ChatTurn into notebooks.turns
```

### 3.1 Turn contract

`Action` (from CALL A) is a discriminated object:

```json
{ "type": "sql",        "question": "why did revenue drop in Q3?",
  "dataset_id": "<uuid|null>" }
{ "type": "chart",      "hints": ["revenue","region"], "dataset_id": "<uuid>" }
{ "type": "cleaning",   "dataset_id": "<uuid>" }
{ "type": "dashboard",  "scope": "dataset|project", "dataset_id": "<uuid|null>" }
{ "type": "report",     "scope": "dataset|project", "dataset_id": "<uuid|null>" }
```

`ChatArtifact` (emitted by the executor, persisted in the turn):

```json
{ "type": "sql",      "proposal": SqlProposal,        "executed": null,
  "status": "proposed" }
{ "type": "chart",    "specs": [ChartSpec, ...],      "accepted_ids": [],
  "status": "proposed" }
{ "type": "cleaning", "operations": [...],            "status": "proposed" }
{ "type": "dashboard","catalog": [CatalogEntry,...],  "status": "proposed" }
{ "type": "report",   "scope": "...",                 "status": "proposed" }
```

Artifact `status` transitions on human action: `proposed` → `executed` /
`accepted` / `rejected` / `opened`. The status + any execution result are stored
back in the turn so the notebook is durable and re-openable.

### 3.2 Fallback (any LLM failure)

`plan_turn` failure → deterministic `_fallback_turn`:
- `actions = [ { type: "sql", question: <user question>, dataset_id: <current> } ]`
  (only if a frame exists; otherwise an empty action list + a text-only answer).
- `summary` = rule-based ("I can help by running a SQL query against this
  dataset. Here's a starting point."), `ai_available = False`.
- Narrative: dripped as a **single** `event: token` (no streaming LLM needed).
- `stream_narrative` failure mid-stream → emit `event: error` with a graceful
  message; the already-streamed tokens remain; the turn is still persisted with
  `ai_available = False`.

---

## 4. Backend Components

### 4.1 New LLM primitive — `app/services/llm.py`

```python
async def complete_stream(
    system_prompt: str, user_prompt: str, model: str | None = None
) -> AsyncGenerator[str, None]:
    """Yield text deltas from OpenRouter's streaming chat completion.
    Raises on missing key / connection error so callers can fall back."""
```

- Mirrors `complete_json` headers/refs, but `json={"model": ..., "messages": [...],
  "stream": True}` (no `response_format`).
- Iterates the SSE `data:` lines; for each, parse JSON and yield
  `choices[0].delta.content` (skip `None`/finish markers / `[DONE]`).
- Keep `complete_json` untouched for CALL A and all other engines.

### 4.2 New package — `app/services/chat/`

- **`context.py`** — `build_chat_context(session, project, dataset, user) -> ChatContext`:
  loads the dataset `profile` + `understanding` + `eda` (if present), and
  `dashboard.assemble_context(...)` for project scope. Returns a plain structured
  object (no pandas frame, no raw rows) ready to serialize into prompts. Reuses
  existing loaders; **does not** reparse files.
- **`orchestrator.py`**:
  - `plan_turn(ctx, question, history) -> (actions, summary, ai_available)` —
    CALL A. Sends `{catalog, facts, question, prior_turns}` to `complete_json`,
    constrained to the action types above; `_validate_plan` drops actions that
    reference unknown datasets/columns. On any failure → `_fallback_turn`.
  - `stream_narrative(ctx, question, actions) -> AsyncGenerator[str]` — CALL B.
    Sends the question + chosen actions + facts to `complete_stream`; yields
    tokens. On failure raises (caller drips a fallback message).
- **`executor.py`** — `run_action(ctx, action) -> ChatArtifact`:
  - `sql` → `sql.proposer.generate_sql(question, profile, understanding)` →
    `SqlProposal` (HITL: not executed).
  - `chart` → `eda.engine.build_candidates(df, profile)` then select by `hints`
    (AI names candidate ids where possible; heuristic top-K fallback) →
    `ChartSpec[]`.
  - `cleaning` → `cleaning.planner.propose_plan(profile, understanding)` →
    operations.
  - `dashboard` → `dashboard.proposer.propose_dashboard(ctx, scope)` →
    `CatalogEntry[]`.
  - `report` → returns `scope` only (the actual report is produced via the
    existing Reports `generate` endpoint when the human clicks **Generate**; the
    chat artifact is a proposal/link, never an auto-generated report).
  - All calls are best-effort; a failed engine call yields an artifact with
    `status: "error"` and a message, never a raised 5xx.

**No existing engine is modified for chat** — chat only imports and calls them.

### 4.3 Schemas — `app/schemas/chat.py`

- `ChatAction`, `ChatArtifact` (discriminated unions by `type`), `ChatTurn`
  (ordered list element of `notebooks.turns`), `NotebookBase`,
  `NotebookCreate`, `NotebookRead`, `NotebookDetailRead` (turns attached),
  `NotebookShareRead` (title/scope/turns/ai_available/generated_at only),
  `NotebookPatchRequest` (title), `ChatMessageRequest`
  (`notebook_id?`, `project_id`, `dataset_id?`, `content`, `parent_message_id?`),
  `SSEEvent` shapes documented in §5.

### 4.4 Model + migration — `app/models/notebook.py`

`notebooks` table (modeled on `reports`):

| column | type | notes |
|--------|------|-------|
| `id` | UUID PK | |
| `project_id` | UUID FK → projects | indexed |
| `owner_id` | UUID FK → users | indexed |
| `scope` | str | `dataset` \| `project` |
| `dataset_id` | UUID FK → datasets | nullable, indexed |
| `title` | str | |
| `turns` | JSON | ordered `ChatTurn[]` (config + artifact state only; no raw rows) |
| `share_token` | str | unique, indexed |
| `ai_available` | bool | **True only if every persisted turn used AI**; set `False` if any turn fell back to the deterministic path |
| `created_at`/`updated_at` | timestamps | `updated_at` bumps on every turn append |
| `generated_at` | timestamp | set on the **first** assistant turn (first AI generation); `NULL` until then |

A dedicated table (not a JSON column on `Dataset`/`Project`) so a project holds
multiple notebooks + history. `turns` is `dict | None` via
`sa_column=Column(JSON)` (same SQLModel requirement as `dashboards`).

### 4.5 Routes — `app/api/routes/chat.py` (mounted at `/api/v1`)

- `POST /chat/message` — **`media_type="text/event-stream"`** SSE, owner-guarded.
  Body `ChatMessageRequest`. Creates a notebook if `notebook_id` absent (title
  derived from first question), appends the user turn + streams the assistant
  turn, persists both into `turns`, returns `done` with `notebook_id`/`message_id`.
  `parent_message_id` (optional) links a follow-up turn to its parent for history
  rendering; `NULL` for a top-level message. It is stored on the assistant
  `ChatTurn` and used only for UI threading — it does not change execution.
- `GET /notebooks?project_id=` — owner list.
- `POST /notebooks` — create (explicit, for "New chat").
- `GET /notebooks/{id}` — owner; returns `NotebookDetailRead` (turns attached).
  **403** if exists but another user's; **404** if absent.
- `PATCH /notebooks/{id}` — rename/title only (HITL edit surface for now).
- `DELETE /notebooks/{id}` — 204.
- `GET /notebooks/share/{token}` — **public, no auth dependency**; returns
  `NotebookShareRead` only (no owner PII, no project linkage, no mutation verbs,
  no other notebooks reachable). Bad token → 404.

**Artifact execution reuses existing endpoints** (no new execution routes):
- SQL Run → `POST /sql/run` (validates + executes + persists to `sql_queries`);
  the chat panel stores the returned `SqlResult` back into the turn's SQL
  artifact.
- Chart accept → local state, rendered via `ChartRenderer`.
- Cleaning apply → `POST /datasets/{id}/cleaning/apply`.
- Dashboard/report → link to their generate/create flows.

---

## 5. SSE Protocol

`POST /chat/message` returns `text/event-stream`. Events:

```
event: token
data: {"text": "Looking at your Q3 data, "}

event: token
data: {"text": "revenue fell mainly because…"}

event: artifact
data: {"artifact": { "type": "sql", "proposal": {...}, "status": "proposed" }}

event: artifact
data: {"artifact": { "type": "chart", "specs": [...], "status": "proposed" }}

event: done
data: {"notebook_id": "<uuid>", "message_id": "<uuid>",
       "ai_available": true, "title": "Q3 revenue drop"}

event: error
data: {"message": "The assistant response was interrupted; showing a rule-based answer.",
       "ai_available": false}
```

- `token` events append to the streaming assistant bubble.
- `artifact` events append artifact cards to the same turn.
- `done` finalizes; the panel persists nothing client-side (server already wrote
  `turns`) — it just reconciles `notebook_id`/`message_id` and stops the spinner.
- `error` is non-fatal: already-received tokens stay; the turn is saved with
  `ai_available = False`.

Frontend consumes via `fetch` + `ReadableStream` reader (EventSource cannot POST
a body) — same pattern the panel uses to parse SSE frames.

---

## 6. Frontend

- **`lib/types.ts`** — `ChatTurn`, `ChatArtifact` (union by `type`), `Notebook*`,
  SSE event types, `ChatAction`.
- **`lib/api.ts`** — `chatApi.message(req): AsyncIterable<SSEEvent>` (POST + stream
  reader) and `notebooksApi` (list/create/get/patch/delete) beside `chatApi`.
- **`components/chat-panel.tsx`** (core):
  - Message list; streaming text appended live into the assistant bubble.
  - Per-artifact cards: **SQL** (editable SQL + Run/Edit → inline `SqlResult`
    table + `ChartRenderer` viz, reusing the SQL panel's result UI); **charts**
    (accept/reject, `ChartRenderer`); **cleaning** (operation review like the
    cleaning panel → Apply); **dashboard/report** (Generate/Open link).
  - Follow-up suggestion chips (reuse SQL M3's `followup_questions` pattern) that
    proactively draft the next message (never auto-send).
  - Dataset / project scope switch (entered from either entry point).
- **`components/notebook-share.tsx`** + **`app/notebooks/share/[token]/page.tsx`**
  — read-only render of `NotebookShareRead`, branded footer ("Generated with
  InsightFlow AI · Analyze your own dataset →"), no mutation.
- **`app/notebooks/[id]/page.tsx`** (owner) — loads `get(id)`, back-to-project
  link, rename.
- **Entry points** in `app/projects/[id]/page.tsx`: a **Chat** button in the
  project header (project scope) and per profiled dataset card (dataset scope) —
  mirroring the Dashboard entry points.

---

## 7. Error Handling

- Every AI step best-effort with deterministic fallback (EDA `propose_charts` /
  Reports `narrate_report` / Dashboard `propose_dashboard` contract).
- SSE failures surface as `event: error`, never an HTTP 5xx where avoidable; the
  stream closes gracefully and the turn is still persisted.
- Owner guards: `notebooks` GET/PATCH/DELETE return **403** if the row belongs to
  another user, **404** if absent (matching the dashboards convention).
- Public share returns only safe fields; bad token 404.

---

## 8. Testing

**Backend (`pytest`):**
- `orchestrator.plan_turn` — parses valid intent; `_validate_plan` drops unknown
  datasets/columns; `_fallback_turn` produces a SQL action when a frame exists and
  `ai_available = False` otherwise.
- `executor.run_action` — each `type` maps to the correct engine call and returns
  the right `ChatArtifact` shape; an engine failure yields `status: "error"`.
- `llm.complete_stream` — yields deltas; raises on missing key.
- SSE endpoint e2e (TestClient, Postgres): register → project → dataset (profiled)
  → open SSE `/chat/message` → assert streamed tokens received, artifacts emitted,
  `notebooks` row created with correct `turns`, owner-guard 403 on another user's
  notebook, public `share/{token}` returns safe fields only, bad token 404, LLM
  unavailable → fallback path persists `ai_available = False`.

**Frontend:**
- `tsc --noEmit` + `next lint` + `next build` (every milestone).

**Browser verification (`tests/manual_chat_e2e.py` style or manual):**
- Drive a real chat turn end-to-end: stream prose → SQL Run inline → chart
  accept → save notebook → open share link (read-only, branded).

---

## 9. Milestone Decomposition

### M1 — Chat foundation + streaming + SQL (vertical slice)
- [ ] `llm.complete_stream` primitive (+ test).
- [ ] `notebooks` table migration + model + `Notebook*` schemas.
- [ ] `chat/context.py`, `chat/orchestrator.py` (`plan_turn` + `stream_narrative`),
      `chat/executor.py` (SQL path).
- [ ] `POST /chat/message` SSE route (intent + streaming + SQL artifact).
- [ ] `notebooks` CRUD + `share/{token}` routes.
- [ ] Frontend: types, `chatApi` SSE consumer, `chat-panel` (streaming + inline
      SQL Run reusing `sql/run`), public share page, dataset/project entry points.
- [ ] Tests + browser e2e.

### M2 — Full action surface
- [ ] Extend intent catalog + `executor` to propose **charts** (EDA), **cleaning**
      (planner), **dashboard** + **report** artifacts.
- [ ] `chat-panel` renders each artifact with HITL (charts accept/reject via
      `ChartRenderer`; cleaning review + Apply; dashboard/report Generate/Open
      links); persist artifact state in turns.
- [ ] Tests + `tsc`/`lint`/`build`.

### M3 — Routing, notebook management & verification
- [ ] Cross-dataset project routing: question → correct frame / project aggregates
      (single-frame SQL only; cross-dataset joins deferred).
- [ ] Notebook list/manage page + pin/rename/regenerate; owner page
      `app/notebooks/[id]`.
- [ ] End-to-end browser verification (stream → SQL run → chart accept → save →
      share link).

---

## 10. Architecture Decisions (summary)

- **Notebook == chat session**, persisted as a `notebooks` row with `turns` JSON
  (config + artifact state only, never raw rows) — reuses the proven Reports
  persistence/editor pattern.
- **Two-call turn** (intent `complete_json` + narrative `complete_stream`) gives
  real token streaming while keeping artifact selection structured and
  constraint-checked — best balance of live UX, reliability, and catalog safety.
- **Chat only calls existing engines**; zero engine modifications. Extensibility
  comes from adding `Action` types + executor branches, exactly like the widget
  registry pattern.
- **HITL preserved end-to-end**: artifacts are proposals; execution reuses the
  existing guarded endpoints (`sql/run`, `cleaning/apply`).
