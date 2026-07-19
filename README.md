# InsightFlow AI 📊

> **An AI-powered Data Analyst Operating System** — upload a dataset and let AI handle
> understanding, cleaning, EDA, SQL, visualization, insights, dashboards, and reports,
> *while you stay in control*.

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-15-black" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/FastAPI-009688" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Python-3.11%2B-3776AB" alt="Python 3.11+" />
  <img src="https://img.shields.io/badge/AI-Gemini-4285F4" alt="Gemini" />
  <img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License" />
</p>

## ✨ What it does

InsightFlow turns the manual data-analysis grind into an AI-driven pipeline. You bring the data;
InsightFlow does the heavy lifting and surfaces clear, actionable results — with a human approval
step on every AI action.

- 🧠 **AI Dataset Understanding** — auto-detects column types, data-quality issues, and target columns
- 🧹 **Human-in-the-Loop Cleaning** — AI proposes operations; you approve, reject, or tweak each one
- 📈 **Exploratory Data Analysis** — summary stats, distributions, correlation heatmaps
- 💬 **Natural-Language SQL** — ask a question, get SQL, run it, see results
- 📊 **Visualization Generator** — charts recommended from your data's shape
- 💡 **Business Insights** — observations with confidence scores and evidence
- 📋 **Dashboard Recommendations** — full layouts: KPI cards, trends, geo-maps
- 📓 **Interactive Notebook** — a persistent record of every analysis step
- 🤖 **AI Chat** — converse with your dataset to drill deeper
- 📄 **Report Export** — polished PDF and Markdown reports

## 🧭 Core principle

> **Deterministic code computes facts → AI interprets & proposes → Human approves → Deterministic code executes.**

- Deterministic Python (pandas) is the single source of truth and never depends on the LLM.
- The LLM only *interprets* structured facts and *proposes* actions from a fixed catalog — it never
  sees raw data and never mutates it.
- Every AI step is best-effort with a deterministic fallback, so the workflow never breaks because
  the model is down.

## 🏗️ Architecture

A **modular monolith** monorepo. The frontend and backend are deployed separately but talk over a
versioned REST API.

```
┌─────────────────┐          ┌──────────────────────┐
│  Next.js 15 FE  │  /api/*  │    FastAPI Backend   │
│    (Vercel)     │ ───────► │      (Railway)       │
│  server-side    │ ◄─────── │  AI workflows        │
│    rewrite      │  proxy   │  (Gemini)            │
└─────────────────┘          └──────────────────────┘
                                         │
                                         ▼
                                PostgreSQL + Storage
```

- **Backend:** FastAPI + SQLModel + Alembic; pandas for data work; httpx client for the configured AI
  provider.
- **Frontend:** Next.js 15 (App Router), React 18, TypeScript, Tailwind v3, shadcn-style primitives.
- **API contract:** everything under `/api/v1`; the Vercel frontend proxies `/api/*` to Railway
  server-side (no browser CORS).

## 📁 Project structure

```
.
├── backend/            # FastAPI app (Python 3.11+, SQLModel)
│   ├── app/
│   │   ├── core/       # config, database (abstracted), security
│   │   ├── models/     # SQLModel tables
│   │   ├── schemas/    # Pydantic request/response models
│   │   ├── services/   # AI + data workflows (llm, profiling, cleaning, ...)
│   │   ├── db/         # repository base (single DB-access layer)
│   │   └── api/        # routers (auth, projects, datasets, ...) + deps
│   └── Dockerfile
├── frontend/           # Next.js 15 App Router (TypeScript, Tailwind, shadcn)
│   ├── app/            # routes, layout, global styles
│   ├── components/     # ui primitives + feature components
│   └── lib/            # api client, auth, utils
├── docs/               # Design specs & architecture decisions
└── docker-compose.yml  # postgres + redis + backend + frontend (local dev)
```

> **Backend note:** the data-access layer is isolated in `backend/app/core/database.py` and
> `backend/app/db/base.py` so we can switch between local Postgres and Supabase later without
> touching models or routes.

## 🚀 Quick start

### Option A — Docker (full stack, local)

```bash
docker-compose up --build
```

### Option B — Manual

**Backend**

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # fill in your values
uvicorn app.main:app --reload
```

Migrations run automatically on startup (`alembic upgrade head`), so a fresh database is created and
versioned with no extra step. To manage them manually:

```bash
cd backend
./.venv/Scripts/python.exe -m alembic upgrade head                              # apply
./.venv/Scripts/python.exe -m alembic revision --autogenerate -m "describe"    # new
./.venv/Scripts/python.exe -m alembic history                                  # show
```

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

## 🌐 Deployment

The app ships as a **split deploy**:

| Layer     | Platform | Notes                                                          |
|-----------|----------|----------------------------------------------------------------|
| Frontend  | Vercel   | Next.js 15, Root Directory = `frontend`                        |
| Backend   | Railway  | FastAPI service with a stable public URL                       |
| Database  | Supabase | PostgreSQL                                                     |
| Storage   | Supabase | dataset uploads                                                |
| AI        | Gemini   | `LLM_PROVIDER=gemini`; OpenRouter also supported               |

The Vercel frontend rewrites `/api/*` and `/health` to the Railway backend using `INTERNAL_API_URL`
(from `frontend/.env.production`), so the backend URL stays server-side and there is no CORS surface.
`LLM_PROVIDER` selects the AI backend — set `LLM_PROVIDER=openrouter` + `OPENROUTER_API_KEY` to
switch providers. Vercel's Deployment Protection is disabled so API routes return JSON rather than
SSO redirects.

## 🧩 Tech stack

| Layer      | Technology                                                  |
|------------|-------------------------------------------------------------|
| Frontend   | Next.js 15 (App Router), React 18, ShadCN UI, Tailwind CSS  |
| Backend    | FastAPI (Python 3.11+), SQLModel                           |
| AI         | Gemini / OpenRouter (provider-agnostic via `llm.py`)        |
| Task Queue | Celery + Redis                                              |
| Database   | PostgreSQL (Supabase)                                       |
| Storage    | Supabase Storage / AWS S3                                   |
| Deploy     | Vercel (frontend) + Railway (backend)                       |

## 📚 Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — system shape, core principle, swap points
- [PROJECT_PROGRESS.md](./PROJECT_PROGRESS.md) — status, sprints, roadmap
- [DEVELOPMENT_LOG.md](./DEVELOPMENT_LOG.md) — architectural decisions & lessons learned

## 📄 License

MIT
