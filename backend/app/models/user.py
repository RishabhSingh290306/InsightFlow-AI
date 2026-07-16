"""User account model.

Supports both credential-based auth (email + hashed password) and OAuth
(Google) sign-in. The `oauth_provider` / `oauth_sub` columns stay empty for
credential users and are populated when we wire the OAuth flow.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: int | None = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True)
    full_name: str = Field(default="")
    hashed_password: str = Field(default="")  # empty for OAuth-only accounts
    oauth_provider: str = Field(default="")  # e.g. "google"
    oauth_sub: str = Field(default="")  # provider-specific subject id
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=_now)
