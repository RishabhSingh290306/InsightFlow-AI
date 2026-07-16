"""Application configuration loaded from environment variables.

All settings are read from the environment (or a local `.env` file) via
pydantic-settings. The concrete *backend* (local Postgres vs Supabase) is
deliberately deferred — see `app/core/database.py`. The values here stay
backend-agnostic so flipping the provider later is a localized change.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Application
    PROJECT_NAME: str = "InsightFlow AI"
    API_V1_PREFIX: str = "/api/v1"
    ENVIRONMENT: str = "development"

    # CORS — comma-separated list of allowed origins
    BACKEND_CORS_ORIGINS: str = "http://localhost:3000"

    # Database — currently a Postgres connection string. The data-access layer
    # in `app/core/database.py` is the single swap point for Supabase later.
    DATABASE_URL: str = "postgresql://postgres:password@localhost:5432/insightflow"

    # Redis / Celery (AI workflow orchestration — used from Sprint 1+)
    REDIS_URL: str = "redis://localhost:6379/0"

    # Auth
    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day

    # Google OAuth (optional — wired behind an interface, provider chosen later)
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    FRONTEND_URL: str = "http://localhost:3000"

    # OpenRouter (provider-agnostic AI access)
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"

    # Supabase (only used if we switch to Supabase as the backend)
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    SUPABASE_BUCKET: str = "dataset-uploads"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.BACKEND_CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance (one per process)."""
    return Settings()


settings = get_settings()
