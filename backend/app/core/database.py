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
from configparser import Interpolation
from pathlib import Path

from sqlmodel import Session, create_engine

from app.core.config import settings

# `pool_pre_ping` keeps connections healthy across idle periods (Docker/Compose).
# `echo` is OFF by default (it logs bound parameter values, i.e. possible PII);
# enable explicitly via DB_ECHO only when debugging.
engine = create_engine(
    settings.DATABASE_URL,
    echo=settings.DB_ECHO,
    pool_pre_ping=True,
)

# Root of the backend package (where alembic.ini lives): backend/ is three
# levels up from backend/app/core/database.py.
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent


class _NoInterpolation(Interpolation):
    """Pass-through interpolation for Alembic's ConfigParser.

    Alembic (via ConfigParser) performs `%`-interpolation on option values. A
    DATABASE_URL whose password is URL-encoded (e.g. `%40` for `@`) is then
    misread as a variable reference and raises ``ValueError``. This no-op makes
    values pass through verbatim so credentials are never mangled.
    """

    def before_get(self, parser, section, option, value, defaults):
        return value

    def before_set(self, parser, section, option, value):
        return value


def run_migrations() -> None:
    """Apply all Alembic migrations (idempotent — safe to call on every boot).

    This replaces the old `create_all` bootstrap so the schema is always
    versioned. `env.py` sources the database URL from app settings, so no
    credentials live in alembic.ini.
    """
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    # See _NoInterpolation: stop Alembic from treating `%40` in the DB password
    # as an interpolation variable.
    cfg.file_config._interpolation = _NoInterpolation()
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    command.upgrade(cfg, "head")


def get_session() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a session and always closes it."""
    with Session(engine) as session:
        yield session
