"""Application configuration loaded from environment variables.

All settings are read from the environment (or a local `.env` file) via
pydantic-settings. The concrete *backend* (local Postgres vs Supabase) is
deliberately deferred — see `app/core/database.py`. The values here stay
backend-agnostic so flipping the provider later is a localized change.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic import model_validator
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
    # The default is a *non-credential placeholder*; production REQUIRES an
    # explicit DATABASE_URL (enforced in `_validate_production`).
    DATABASE_URL: str = "postgresql://postgres:CHANGE_ME@localhost:5432/insightflow"
    # SQL echo logs every statement WITH its bound parameter values (possible
    # PII). Off by default in every environment — enable explicitly if needed.
    DB_ECHO: bool = False

    # File storage — local disk for now. The storage adapter in
    # `app/core/storage.py` is the single swap point for Supabase Storage / S3.
    DATA_DIR: str = "./data"
    MAX_UPLOAD_MB: int = 50

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

    # LLM provider gateway — the app talks to exactly ONE LLM via
    # `app/services/llm.py`. This switches which provider that gateway uses
    # without touching any caller. "openrouter" (default) or "gemini".
    LLM_PROVIDER: str = "openrouter"

    # OpenRouter (provider-agnostic AI access)
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    OPENROUTER_MODEL: str = "openai/gpt-4o-mini"  # default; override via env

    # Gemini (Google AI Studio) — used when LLM_PROVIDER=gemini.
    GEMINI_API_KEY: str = ""
    GEMINI_BASE_URL: str = "https://generativelanguage.googleapis.com/v1beta"
    GEMINI_MODEL: str = "gemini-flash-latest"  # free-tier Flash; override via env

    # Supabase (only used if we switch to Supabase as the backend)
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    SUPABASE_BUCKET: str = "dataset-uploads"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.BACKEND_CORS_ORIGINS.split(",") if o.strip()]

    @model_validator(mode="after")
    def _validate_production(self) -> "Settings":
        """Fail fast in production if secrets/connection are still defaults.

        A default JWT secret lets anyone forge tokens (full account takeover),
        and a default DATABASE_URL means no real database was wired up. Dev and
        test environments are intentionally exempt so local runs work OOTB.
        """
        if self.ENVIRONMENT.lower() != "production":
            return self
        if not self.SECRET_KEY or self.SECRET_KEY == "change-me-in-production":
            raise ValueError(
                "SECRET_KEY must be set to a strong, non-default value in production."
            )
        if len(self.SECRET_KEY) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters in production.")
        if self.DATABASE_URL == "postgresql://postgres:CHANGE_ME@localhost:5432/insightflow":
            raise ValueError("DATABASE_URL must be set explicitly in production.")
        return self


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance (one per process)."""
    return Settings()


settings = get_settings()
