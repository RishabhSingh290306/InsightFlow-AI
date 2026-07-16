# InsightFlow AI

**An AI-powered Data Analyst Operating System**

InsightFlow AI transforms the manual data analysis workflow into an automated, AI-driven pipeline. Upload a dataset and watch as AI handles dataset understanding, cleaning, EDA, SQL analysis, visualization, business insights, dashboard recommendations, and report generation — all while keeping you in control.

## Features

- **AI Dataset Understanding** — Automatic detection of column types, data quality issues, and target columns
- **Human-in-the-Loop Cleaning** — AI proposes cleaning operations; you approve, reject, or modify each
- **Exploratory Data Analysis** — Summary statistics, distribution charts, correlation heatmaps
- **Natural Language SQL** — Ask questions, get SQL, execute it, see results
- **Visualization Generator** — AI-recommended charts based on data characteristics
- **Business Insights** — Actionable observations with confidence scores and evidence
- **Dashboard Recommendations** — Complete dashboard layouts (KPI cards, trends, geo-maps)
- **Interactive Notebook** — Persistent record of every analysis step
- **AI Chat** — Converse with your dataset to drill deeper
- **Report Export** — Professional PDF and Markdown reports

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), ShadCN UI, Tailwind CSS |
| Backend | FastAPI (Python 3.12), SQLModel |
| AI Engine | Modular AI workflows via OpenRouter (provider-agnostic) |
| Task Queue | Celery + Redis |
| Database | PostgreSQL (Supabase) |
| Storage | Supabase Storage / AWS S3 |
| Deployment | Docker, Vercel (frontend), Render (backend) |

## Architecture

InsightFlow uses a **modular monolith** architecture — all features live in one deployable application but are organized into independent modules. The AI layer is built around discrete, testable workflows rather than monolithic prompts.

```
Next.js 15 Frontend
        |
        v
FastAPI Backend (REST)
        |
        v
Celery Task Queue --> AI Workflow Services
        |
        v
PostgreSQL + Supabase Storage
```

## Monorepo Layout

```
.
├── backend/            # FastAPI app (Python 3.12, SQLModel)
│   ├── app/
│   │   ├── core/       # config, database (abstracted), security
│   │   ├── models/     # SQLModel tables (User, Project)
│   │   ├── schemas/    # Pydantic request/response models
│   │   ├── db/         # repository base (single DB-access layer)
│   │   └── api/        # routers (auth, users, projects) + deps
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/           # Next.js 15 App Router (TypeScript, Tailwind, ShadCN)
│   ├── app/            # routes, layout, global styles
│   ├── components/     # ui primitives + feature components
│   ├── lib/            # api client, auth, utils
│   ├── Dockerfile
│   └── package.json
├── docs/               # Design specs & architecture decisions
├── docker-compose.yml  # postgres + redis + backend + frontend
└── .env.example        # copy to .env for local/dev
```

> **Backend note:** the data-access layer is isolated in `backend/app/core/database.py`
> and `backend/app/db/base.py` so we can switch between local Postgres and Supabase
> later without touching models or routes. See `DEVELOPMENT_LOG.md` for the decision.

## Getting Started

### Prerequisites

- Node.js 20+
- Python 3.12+
- PostgreSQL (or Supabase account)
- Redis (for Celery)
- OpenRouter API key

### Backend Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
cp .env.example .env  # fill in your values
uvicorn app.main:app --reload
```

Migrations run automatically on startup (`alembic upgrade head`), so a fresh
database is created and versioned with no extra step. To manage them manually:

```bash
cd backend
./.venv/Scripts/python.exe -m alembic upgrade head   # apply migrations
./.venv/Scripts/python.exe -m alembic revision --autogenerate -m "describe change"  # new migration
./.venv/Scripts/python.exe -m alembic history         # show applied versions
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

### Docker (Full Stack)

```bash
docker-compose up --build
```

## Development

This project follows professional Git practices:
- Conventional Commits (`feat:`, `fix:`, `docs:`, etc.)
- Small, logical commits per feature
- CI/CD via GitHub Actions
- Documentation updates on every major change

See [DEVELOPMENT_LOG.md](./DEVELOPMENT_LOG.md) for architectural decisions and lessons learned.
See [PROJECT_PROGRESS.md](./PROJECT_PROGRESS.md) for current status and roadmap.

## License

MIT
