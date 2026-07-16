"""FastAPI application entrypoint.

Run locally with:  uvicorn app.main:app --reload
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import auth, projects, users
from app.core.config import settings
from app.core.database import init_db

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="0.1.0",
    description="InsightFlow AI — AI-powered data analyst backend.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    # Dev bootstrap: create tables if they don't exist. Production uses Alembic.
    init_db()


@app.get("/health", tags=["status"])
def health() -> dict:
    return {"status": "ok", "service": settings.PROJECT_NAME, "environment": settings.ENVIRONMENT}


# Mount API routers under the versioned prefix.
API_PREFIX = settings.API_V1_PREFIX
app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(users.router, prefix=API_PREFIX)
app.include_router(projects.router, prefix=API_PREFIX)
