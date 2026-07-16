# InsightFlow AI — Architecture

This document describes the system architecture and the standing architectural
decisions. Per-feature designs live in `docs/superpowers/specs/`.

## 1. System shape

A **modular monolith** monorepo:

```
backend/   FastAPI (Python 3.11) — API, services, models, migrations
frontend/  Next.js 15 (App Router) — UI, API client
docs/      Specs and design documents
```

- **Backend:** FastAPI + SQLModel + Alembic; pandas for data work; httpx client
  for OpenRouter.
- **Frontend:** Next.js 15, React 18, TypeScript, Tailwind v3, shadcn-style
  primitives.
- **API contract:** everything under `/api/v1`; the frontend rewrites `/api/*`
  to the backend.

## 2. Core principle: deterministic facts, AI interpretation, human control

> **Deterministic code computes facts → AI interprets & proposes → Human
> approves → Deterministic code executes.**

- Deterministic Python is the single source of truth and never depends on the
  LLM.
- The LLM only interprets structured facts and proposes actions from a fixed
  catalog; it never sees raw data and never mutates data.
- Every AI step is best-effort with a deterministic fallback — no workflow fails
  because of the LLM.

## 3. Abstraction / swap points

| Concern | Swap point | Local default | Future |
|---|---|---|---|
| Database | `app/core/database.py` + `app/db/` Repository | PostgreSQL | Supabase |
| File storage | `app/core/storage.py` `StorageAdapter` | Local disk (`DATA_DIR`) | Supabase/S3 |
| AI provider | `app/services/llm.py` | OpenRouter | any OpenAI-compatible |

## 4. Data-producing workflows (two-stage AI pattern)

Established by the dataset-understanding workflow and reused everywhere:

- **Stage 1 — Profiling (deterministic).** `app/services/dataset_profiling.py`
  reads the file via the storage adapter and computes a `DatasetProfile` (types,
  missing values, duplicates, stats, quality issues, preview). Stored as JSON on
  `Dataset.profile`. Always succeeds.
- **Stage 2 — Understanding (AI, best-effort).**
  `app/services/dataset_understanding.py` sends the *profile* (never raw data) to
  the LLM and stores a `DatasetUnderstanding`. Falls back deterministically.

Downstream workflows read the stored profile; they never reparse the file.

## 5. Dataset versioning — unified lineage (Git-like)

Datasets are an **immutable version graph**. Each version *is* a `Dataset` row
(no separate version table), extended with lineage fields:

- `parent_id` — the version this row was derived from (`NULL` for uploads).
- `root_id` — the original upload of the lineage (self for a root);
  `WHERE root_id = ?` returns the whole lineage.
- `origin` — `"upload"` | `"cleaning"` (future: `"sql"`, `"feature_eng"`,
  `"manual"`).
- `recipe` — JSON record of the applied/skipped operations for reproducibility.

**Immutability:** the original and every prior version's file are never
overwritten. Every transformation writes a new file and creates a new row. One
mechanism serves all data-producing workflows (cleaning now; feature
engineering, SQL, manual edits later).

## 6. Cleaning workflow — HITL + plugin engine

- **Plugin operation registry** (`app/services/cleaning/`): each operation is an
  independent module implementing a common interface — `describe`, `validate`,
  `preview`, `execute`, `rollback` (where applicable). New operations are added
  without modifying the engine.
- **AI planner** proposes operations constrained to the registry catalog
  (best-effort; deterministic fallback from the profile).
- **Preview** is a stateless dry-run that never mutates persisted data and
  returns structured impact (affected rows/cols, estimated changes, warnings,
  execution time, confidence, before/after samples).
- **Apply** executes only user-approved operations through the *same* registry,
  all-or-nothing at persistence, then writes a new version and re-profiles it.

See `docs/superpowers/specs/2026-07-16-cleaning-workflow-design.md`.

## 7. Standing decisions (see DEVELOPMENT_LOG.md for rationale)

- Modular monolith over microservices.
- FastAPI over Node/Express (data-science ecosystem, async, Pydantic).
- Next.js 15 App Router over plain React.
- OpenRouter as a provider-agnostic AI layer.
- Alembic migrations (run on startup) over `create_all`.
- Repository + storage-adapter abstractions as the only infra swap points.
- Unified dataset lineage (Option A: version-as-`Dataset`-row) over a separate
  version table.
