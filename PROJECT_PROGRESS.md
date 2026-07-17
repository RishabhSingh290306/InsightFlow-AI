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
| Insights + Reports | ✅ Done | Canonical Report JSON + assembly service; AI-narrated, HITL-editable; public read-only share link; PDF/Markdown export |

## Current Sprint

**Sprint 1 — Cleaning Workflow & Unified Versioning** *(design approved 2026-07-16)*

Design: `docs/superpowers/specs/2026-07-16-cleaning-workflow-design.md`

- [x] **M1 — Versioning foundation:** lineage columns (`parent_id`/`root_id`/`origin`/`recipe`) + migration + backfill, `DatasetRead` fields, `GET /lineage`, version history list UI
- [x] **M2 — Cleaning engine + registry:** plugin base, registry, v1 operations (missing values, duplicates, type conversion, rename/drop columns), deterministic `preview`
- [x] **M3 — AI planner + apply + UI:** best-effort `propose_plan` (+ fallback), `apply` (new immutable version + re-profile), PR-style review UI, end-to-end verification

**Sprint 2 — EDA + Visualizations** *(design approved 2026-07-17)*

Design: `docs/superpowers/specs/2026-07-17-eda-visualizations-design.md`

- [x] **M1 — EDA + Visualizations:** deterministic `build_candidates` + best-effort `propose_charts` (fallback), universal `ChartSpec`, `POST/GET/PATCH /eda` (stored on `dataset.eda`), Recharts `ChartRenderer` + accept/reject `eda-panel`, end-to-end verification
- [x] **M2 — SQL Generation:** Question→SQL loop; `app/services/sql/` single engine (DuckDB read-only sandbox + sqlglot validation, best-effort `generate_sql`/`generate_insights`), `POST/GET/DELETE /sql/{generate,run,history}`, `sql_queries` history table, `sql-panel` (ask→edit→execute→results→history) reusing `ChartRenderer`
- [x] **M3 — Conversational Investigation (follow-up questions):** additive on M2 — multi-turn chain + chat-style `sql-panel` thread UI + `parent_query_id`-linked history; combined `interpret_result` (insights + follow-ups, one best-effort call); `generate_sql` gains `chain` context; HITL preserved (follow-up chips auto-generate the next SQL, never auto-execute)

**Sprint 3 — Insights + Reports** *(design approved 2026-07-17)*

Design: `docs/superpowers/specs/2026-07-17-insights-reports-design.md`

- [x] **M1 — Report assembly + storage + API:** `reports` table + migration; `Report` JSON canonical (ordered `Section[]`); assembly service (deterministic factual sections + best-effort AI prose/`ai_available` fallback, scoped `dataset`/`project`); owner-guarded `generate`/`list`/`get`/`patch`/`delete`/`export`; public read-only `share/{token}` endpoint returning only safe fields
- [x] **M2 — Editor UI + export:** `report-renderer` (presentation-only, reuses `ChartRenderer`), `report-editor` (edit/reorder/remove/rename/custom-note, live preview), PDF (browser `window.print()`) + Markdown export, copy share link; Generate Report entry points on the project workspace (per-dataset + per-project)
- [x] **M3 — Public share view:** `/reports/share/[token]` read-only, branded footer ("Generated with InsightFlow AI · Analyze your own dataset →"), download buttons, no mutation/data leak

**Sprint 4 — Dashboard Recommendations** *(design approved 2026-07-17)*

Design: `docs/superpowers/specs/2026-07-17-dashboard-recommendations-design.md`

- [x] **M1 — Engine + dataset-scope core:** `app/services/dashboard/` package (widget ABC, registry, context, `build_catalog`, `propose_dashboard` + deterministic fallback, `render`); M1 widgets (`kpi_cards`, `data_quality`, `recommended_charts`, `ai_insights`, `sql_widget`); on-demand `POST /preview` (dataset scope); `dashboard-renderer` (read-only, reuses `ChartRenderer`); backend unit tests
- [x] **M2 — Project scope + remaining widgets:** project-scope context assembly; remaining widgets (`project_kpis`, `dataset_summaries`, `recent_reports`, `activity_feed`, `version_timeline`, `recommended_next`); `POST /preview` extended to project scope; renderer handles project widgets; tests
- [ ] **M3 — Persistence + HITL editor + entry points:** `dashboards` table + migration + `Dashboard` model + `DashboardSpec` schema; full CRUD (`generate`/`list`/`get`+view/`patch`/`regenerate`/`delete`, owner-guarded); `dashboard-editor` (accept/reject, reorder, notes, regenerate, save); entry points (Dashboard button per dataset + project header) + owner page `app/dashboards/[id]`; end-to-end verification

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
| Cleaning Workflow | 2026-08-13 | ✅ Complete |
| EDA + Visualizations | 2026-08-20 | ✅ Complete |
| SQL Generation | 2026-08-27 | ✅ Complete |
| Conversational Investigation | 2026-07-24 | ✅ Complete |
| Insights + Reports | 2026-09-03 | ✅ Complete |
| Dashboard Recommendations | 2026-09-10 | 🟢 M1+M2 shipped; M3 pending |
| AI Chat & Notebook | 2026-09-17 | Pending |
| Portfolio Polish | 2026-09-24 | Pending |