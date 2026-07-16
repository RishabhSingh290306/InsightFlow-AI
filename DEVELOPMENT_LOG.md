# Development Log: InsightFlow AI

## 2026-07-16 — Project Kickoff & Architectural Planning

### Architecture Decision: Modular Monolith

**Decision:** Use a modular monolith architecture instead of microservices.

**Rationale:**
- Single deployable artifact simplifies portfolio demonstration
- Easier to showcase clean module boundaries in code reviews
- Lower operational overhead for demo purposes
- Can later extract services if product scales

**Trade-offs:**
- Requires disciplined code organization
- Single point of failure (mitigated by health checks)

### Architecture Decision: Next.js 15 (App Router)

**Decision:** Next.js 15 with App Router over plain React.

**Rationale:**
- Built-in server components reduce client bundle size
- File-system routing mirrors our modular backend structure
- Excellent for SEO when we add public case studies
- Strong ecosystem for authentication (next-auth)
- Single preview deployments on Vercel for portfolio

**Trade-offs:**
- Learning curve for Server Actions
- Migration complexity (not a concern for new codebase)

### Architecture Decision: FastAPI over Node.js/Express

**Decision:** FastAPI (Python) instead of Node.js/Express.

**Rationale:**
- Natural fit for data science libraries (pandas, numpy, polars)
- Async-first performance for LLM API calls
- Automatic OpenAPI docs reduce documentation burden
- Type safety with Pydantic models
- Single language (Python) reduces context switching

**Trade-offs:**
- Python async ecosystem smaller than Node
- Deployment options more limited (mitigated by Docker)

### Architecture Decision: Celery + Redis for Task Queue

**Decision:** Celery with Redis for AI workflow orchestration.

**Rationale:**
- Decouples long-running LLM calls from HTTP requests
- Enables retry logic and failure handling per workflow
- Scales horizontally when needed
- Familiar to most Python developers

**Trade-offs:**
- Another service to manage (Redis)
- Overhead for small workloads (acceptable for portfolio)

### Initial Project Structure

Created monorepo with:
```
src/
  api/          # FastAPI endpoints
  services/     # AI workflow modules
  models/       # SQLModel definitions
  tasks/        # Celery task definitions
app/            # Next.js frontend
components/     # Shared UI components
lib/            # Utility functions
docs/           # Documentation
infra/          # Terraform / deployment
tests/          # Test suite
```

## Future Log Entries

- AI workflow design decisions
- UI component architecture
- Testing strategy evolution
- Performance optimizations
- Lessons learned during implementation