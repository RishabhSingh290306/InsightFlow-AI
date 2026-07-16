"""Data-access layer.

The `Repository` base class is the one place that knows how to talk to the
database for CRUD. Routes and services depend on repositories, never on the
session directly, so swapping the backend (Postgres <-> Supabase) later only
touches `app/core/database.py` and this module.
"""
from __future__ import annotations

from typing import Any, Generic, TypeVar

from sqlmodel import Session, SQLModel, select

from app.db.base import Repository

ModelType = TypeVar("ModelType", bound=SQLModel)

__all__ = ["Repository", "Session", "SQLModel", "select", "ModelType"]
