# CLAUDE.md — InsightFlow AI

Guidance for AI assistants (and humans) working in this repository.

## What this project is

InsightFlow AI is an AI-powered data-analyst platform built as a **modular
monolith** monorepo:

- `backend/` — FastAPI (Python 3.11), SQLModel, Alembic, pandas, OpenRouter.
- `frontend/` — Next.js 15 (App Router), React 18, TypeScript, Tailwind v3,
  shadcn-style primitives, lucide-react.

## Core architectural principle

> **Deterministic code computes facts. AI interprets those facts. The human
> approves. Deterministic code executes.**

- Deterministic Python (pandas) computes all facts (profiling, impact, cleaning
  execution) and is the single source of truth. It never depends on the LLM.
- The LLM only **interprets** structured facts and **proposes** actions from a
  fixed catalog. It never receives raw data and never mutates data.
- Every AI step is **best-effort**: on any LLM failure the workflow falls back to
  a deterministic result and never returns a 5xx.
- Downstream workflows consume the stored `Dataset.profile` — they never reparse
  the uploaded file.

## Swap points (the only places to change infrastructure)

- **Database:** `app/core/database.py` + `app/db/` Repository pattern
  (Postgres ↔ Supabase).
- **File storage:** `app/core/storage.py` `StorageAdapter` (local ↔ Supabase/S3).
  All file reads/writes go through the adapter.

## Conventions

- All API routes are versioned under `/api/v1` (`settings.API_V1_PREFIX`).
- Next.js rewrites `/api/*` → backend `http://localhost:8000/api/*`.
- Login is form-encoded (`OAuth2PasswordRequestForm`: `username`, `password`);
  register is JSON.
- Auth token stored in `localStorage` key `insightflow_token`.
- DB schema changes go through Alembic migrations (run on startup), never
  `create_all`.

## Dataset versioning (lineage)

Datasets form an **immutable, Git-like version graph**. The original upload is
never mutated. Every transformation (cleaning, and later feature engineering,
SQL, manual edits) creates a **new `Dataset` row** with `parent_id` / `root_id` /
`origin` / `recipe`. One unified mechanism serves all data-producing workflows.
See `ARCHITECTURE.md` and `docs/superpowers/specs/`.

## Cleaning workflow (HITL)

AI proposes cleaning operations from the profile → the human reviews/edits/
approves each one like a pull request → a deterministic **plugin-based operation
registry** executes only the approved operations → the result is written as a new
version. `preview` (dry-run) and `apply` share the same registry so they can
never diverge.

## Guardrails for assistants

- **Secrets:** `backend/.env` (Postgres password, `OPENROUTER_API_KEY`) and
  `backend/.venv` are gitignored — never commit, echo in full, or place them in
  tracked files. Uploads under `data/` are gitignored.
- **Pushing:** do **not** run `git push`. The maintainer pushes manually.
- **Process:** brainstorm → write spec → implementation plan → build **one
  milestone at a time**, pausing for maintainer review after each. Avoid
  re-opening approved architecture unless a critical issue surfaces.
- **Windows / Git Bash quirks:** invoke the venv Python as
  `./.venv/Scripts/python.exe`; use `taskkill //PID <id> //F` (double slash);
  use Windows `D:/...` paths for tools that mishandle `/tmp`.

## Docs to keep current

`PROJECT_PROGRESS.md` (status/milestones), `DEVELOPMENT_LOG.md` (decision log),
`ARCHITECTURE.md` (system architecture), `docs/superpowers/specs/` (per-feature
specs).
