"""Database access layer.

DESIGN NOTE — backend swap point
---------------------------------
The project defers the choice between a local Postgres instance and Supabase.
To keep that decision reversible, *all* database access funnels through this
module and the repository base in `app/db/base.py`:

  - `get_engine()`      — builds the SQLAlchemy/SQLModel engine from DATABASE_URL
  - `get_session()`     — FastAPI dependency yielding a transactional session
  - `init_db()`         — creates tables from SQLModel metadata (dev bootstrap)

When we adopt Supabase, the only changes are: point DATABASE_URL at the
Supabase Postgres connection string (or swap `get_engine` for a Supabase
client), and add a thin storage adapter for file uploads. No model or route
code needs to change.
"""
from __future__ import annotations

from collections.abc import Generator

from sqlmodel import Session, SQLModel, create_engine

from app.core.config import settings

# `pool_pre_ping` keeps connections healthy across idle periods (Docker/Compose).
engine = create_engine(
    settings.DATABASE_URL,
    echo=settings.ENVIRONMENT == "development",
    pool_pre_ping=True,
)


def init_db() -> None:
    """Create tables from SQLModel metadata.

    Suitable for local/dev bootstrap. Production migrations live in `alembic/`
    (added when we finalize the backend).
    """
    # Import models so they register on SQLModel.metadata before create_all.
    from app import models  # noqa: F401

    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a session and always closes it."""
    with Session(engine) as session:
        yield session
