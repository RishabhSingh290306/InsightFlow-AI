"""FastAPI application entrypoint.

Run locally with:  uvicorn app.main:app --reload
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.routes import auth, chat, cleaning, dashboards, datasets, eda, projects, reports, sql, users
from app.core.config import settings
from app.core.database import engine, run_migrations
from app.core.log import configure_logging, get_logger
from app.core.ratelimit import (
    RateLimiter,
    RateLimitMiddleware,
)

logger = get_logger("app.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    # Apply database migrations on boot (idempotent — see app/core/database.py).
    run_migrations()
    if settings.ENVIRONMENT.lower() == "production":
        if not settings.OPENROUTER_API_KEY and not settings.GEMINI_API_KEY:
            logger.warning(
                "No LLM API key configured in production; all AI features will "
                "silently fall back to deterministic results."
            )
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="0.1.0",
    description="InsightFlow AI — AI-powered data analyst backend.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    """Defensive HTTP response headers (clickjacking, MIME-sniffing, referrer
    leakage, and a baseline CSP that confines scripts/connect to same-origin)."""
    response = await call_next(request)
    response.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
        "font-src 'self'; connect-src 'self'; frame-ancestors 'none'; "
        "base-uri 'self'; form-action 'self'; object-src 'none'",
    )
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    # Defense-in-depth against cross-origin resource leaks / legacy Flash policy pulls.
    response.headers.setdefault("Cross-Origin-Resource-Policy", "same-origin")
    response.headers.setdefault("X-Permitted-Cross-Domain-Policies", "none")
    # HSTS only when served over HTTPS in production — browsers ignore it on http,
    # and emitting it in dev would needlessly pin the host.
    if settings.ENVIRONMENT.lower() == "production":
        response.headers.setdefault(
            "Strict-Transport-Security",
            "max-age=31536000; includeSubDomains",
        )
    return response


# Rate limits per route prefix (per client IP, sliding window).
_RATE_LIMITERS = {
    "/auth/login": RateLimiter(limit=10, window_s=60),
    "/auth/register": RateLimiter(limit=5, window_s=60),
    "/chat/message": RateLimiter(limit=30, window_s=60),
    "/datasets/projects": RateLimiter(limit=20, window_s=60),
}
app.add_middleware(
    RateLimitMiddleware, limiters=_RATE_LIMITERS, prefix=settings.API_V1_PREFIX
)


@app.get("/health", tags=["status"])
def health() -> JSONResponse:
    """Liveness/readiness probe. Verifies the DB is reachable so orchestrators
    and load balancers don't route traffic to an instance with a dead database."""
    db_ok = True
    try:
        with engine.connect() as conn:
            conn.execute(text("select 1"))
    except Exception:
        db_ok = False
    return JSONResponse(
        status_code=200 if db_ok else 503,
        content={
            "status": "ok" if db_ok else "degraded",
            "service": settings.PROJECT_NAME,
            "environment": settings.ENVIRONMENT,
            "database": db_ok,
        },
    )


# Mount API routers under the versioned prefix.
API_PREFIX = settings.API_V1_PREFIX
app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(users.router, prefix=API_PREFIX)
app.include_router(projects.router, prefix=API_PREFIX)
app.include_router(datasets.router, prefix=API_PREFIX)
app.include_router(cleaning.router, prefix=API_PREFIX)
app.include_router(eda.router, prefix=API_PREFIX)
app.include_router(sql.router, prefix=API_PREFIX)
app.include_router(reports.router, prefix=API_PREFIX)
app.include_router(dashboards.router, prefix=API_PREFIX)
app.include_router(chat.router, prefix=API_PREFIX)
