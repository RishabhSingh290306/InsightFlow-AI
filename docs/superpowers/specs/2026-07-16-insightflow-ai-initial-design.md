# InsightFlow AI - Initial Design Document

## Overview

InsightFlow AI is an AI-powered data analysis platform that automates the entire data workflow while keeping users in control. This document captures the initial architecture design and technical decisions.

## Architecture Decisions

### Frontend: Next.js 15 (App Router)

**Chosen:** Next.js 15 with App Router over plain React.

**Rationale:**
- Production-grade routing with file-system conventions
- Built-in server components reduce client bundle size
- Vercel deployment ready with instant previews
- Professional portfolio showcase with modern React patterns

### Backend: FastAPI (Python)

**Chosen:** FastAPI over Node.js/Express.

**Rationale:**
- Native integration with pandas, numpy, and data science libraries
- Automatic OpenAPI documentation reduces doc overhead
- Type-safe with Pydantic models
- Aligns with AI workflow implementation language

### Architecture Style: Modular Monolith

**Chosen:** Modular monolith over microservices.

**Rationale:**
- Single deployable artifact for portfolio demonstration
- Clear module boundaries demonstrate software engineering skills
- Can later extract services if product scales
- Reduced operational complexity for showcase

### AI Layer: Modular Workflows

**Chosen:** Independent workflow modules instead of monolithic prompts.

**Rationale:**
- Each stage testable independently
- Clear failure boundaries and retry logic
- Portfolio-quality code organization
- Demonstrates understanding of AI pipeline design

## Core Modules

1. **Authentication Module** - Email + Google OAuth
2. **Projects Module** - Workspace management
3. **Datasets Module** - Upload, versioning, metadata
4. **AI Understanding Module** - Column detection, quality analysis
5. **AI Cleaning Module** - Proposals with user approval
6. **EDA Module** - Statistical summaries, visualizations
7. **SQL Module** - Natural language to SQL generation
8. **Visualization Module** - Chart recommendations
9. **Insights Module** - Business insight generation
10. **Reports Module** - PDF/Markdown export

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | Next.js 15, Tailwind, ShadCN | Professional UI/UX |
| Backend | FastAPI, Python 3.12 | API layer |
| AI | Celery + Redis | Task orchestration |
| Database | PostgreSQL (Supabase) | Persistence |
| Storage | Supabase Storage | File uploads |
| AI Provider | OpenRouter | Model abstraction |

## Next Steps

1. Initialize Next.js frontend project
2. Set up FastAPI backend
3. Create database schema
4. Implement authentication flow