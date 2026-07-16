# Project Progress: InsightFlow AI

## Completed Features

| Feature | Status | Notes |
|---------|--------|-------|
| Repository initialization | ✅ Done | Git repo, .gitignore, .env.example |
| Documentation structure | ✅ Done | README.md, DEVELOPMENT_LOG.md, PROJECT_PROGRESS.md, design spec |
| Project skeleton | ✅ Done | Monorepo: `backend/` (FastAPI) + `frontend/` (Next.js 15) + `docker-compose.yml` |
| Backend scaffold | ✅ Done | FastAPI app, config, abstracted DB layer, security, User/Project models, auth + projects routers |
| Frontend scaffold | ✅ Done | Next.js 15 App Router, Tailwind + ShadCN primitives, API client, home page w/ live health check |
| Local dev infra | ✅ Done | Docker Compose (postgres, redis, backend, frontend) + per-service Dockerfiles |
| CI pipeline | ✅ Done | GitHub Actions: backend compile+test, frontend lint+build |
| Auth + Projects UI | ✅ Done | Login/register, auth-guarded projects, workspace, design tokens |
| Dataset upload & versioning | ✅ Done | Storage adapter, multipart upload, pandas metadata, stem versioning |
| AI Dataset Understanding | ✅ Done | Two-stage: deterministic profiling + best-effort OpenRouter interpretation |

## Current Sprint

**Sprint 1 — Cleaning Workflow & Unified Versioning** *(design approved 2026-07-16)*

Design: `docs/superpowers/specs/2026-07-16-cleaning-workflow-design.md`

- [x] **M1 — Versioning foundation:** lineage columns (`parent_id`/`root_id`/`origin`/`recipe`) + migration + backfill, `DatasetRead` fields, `GET /lineage`, version history list UI
- [ ] **M2 — Cleaning engine + registry:** plugin base, registry, v1 operations (missing values, duplicates, type conversion, rename/drop columns), deterministic `preview`
- [ ] **M3 — AI planner + apply + UI:** best-effort `propose_plan` (+ fallback), `apply` (new immutable version + re-profile), PR-style review UI, end-to-end verification

**Sprint 0 — Foundations** *(complete)*

- [x] Initialize Next.js 15 project with App Router (Tailwind + ShadCN primitives)
- [x] Set up FastAPI backend with SQLModel
- [x] Configure Docker Compose for local development (postgres + redis + backend + frontend)
- [x] Implement basic authentication — email/password JWT (Google OAuth scaffolded, pending backend decision)
- [x] Create database schema migrations (Alembic — `create_all` replaced by versioned migrations run on startup)

## Next Tasks

### Immediate (Next 2-3 days)
1. Set up Next.js frontend with Tailwind and ShadCN UI
2. Configure Supabase backend for PostgreSQL and file storage
3. Implement user authentication flow
4. Create project/workspace data model

### Short-term (Next 1-2 weeks)
1. Dataset upload and versioning service
2. AI Dataset Understanding workflow
3. Human-in-the-loop cleaning UI
4. Basic EDA visualization components

### Medium-term (Next 2-4 weeks)
1. SQL generation and execution sandbox
2. Visualization recommendation engine
3. Business insight generation
4. Report generation and export

## Technical Debt

- None yet (project in early stages)

## Known Issues

- OpenRouter API cost management not yet implemented
- SQL sandbox security considerations pending

## Future Improvements

1. **AI Quality Assurance Module** — Audit AI decisions
2. **Custom Workflow Builder** — User-defined analysis paths
3. **Collaboration Features** — Comments, version sharing
4. **Integration Connectors** — Power BI, Tableau, Google Sheets
5. **Advanced Analytics** — Forecasting, clustering, anomaly detection
6. **Version Control for Data** — Git-like data versioning

## Architecture Decisions Log

See [ARCHITECTURE.md](./ARCHITECTURE.md) and [DEVELOPMENT_LOG.md](./DEVELOPMENT_LOG.md)
for detailed rationale on:
- Modular monolith vs microservices
- FastAPI vs Node.js/Express
- Next.js 15 vs alternative frontends
- OpenRouter vs direct provider APIs
- Celery task queue design
- Deterministic facts / AI interpretation / human control principle
- Two-stage dataset understanding (profiling → AI interpretation)
- Unified dataset versioning (Git-like lineage; version-as-`Dataset`-row)
- HITL cleaning with a plugin operation registry

## Milestone Timeline

| Milestone | Target Date | Status |
|-----------|-------------|--------|
| Repository + CI/CD | 2026-07-16 | ✅ Complete |
| Auth + Project CRUD | 2026-07-23 | ✅ Complete |
| Dataset Upload | 2026-07-30 | ✅ Complete |
| AI Understanding | 2026-08-06 | ✅ Complete |
| Cleaning Workflow | 2026-08-13 | In Progress |
| EDA + Visualizations | 2026-08-20 | Pending |
| SQL Generation | 2026-08-27 | Pending |
| Insights + Reports | 2026-09-03 | Pending |
| Dashboard Recommendations | 2026-09-10 | Pending |
| AI Chat & Notebook | 2026-09-17 | Pending |
| Portfolio Polish | 2026-09-24 | Pending |