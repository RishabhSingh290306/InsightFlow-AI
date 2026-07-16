"""SQLModel table definitions.

Importing this package registers every model on SQLModel.metadata, which is
required before `init_db()` calls `create_all`.
"""
from app.models.project import Project
from app.models.user import User

__all__ = ["User", "Project"]
