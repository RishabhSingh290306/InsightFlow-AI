"""SQLModel table definitions.

Importing this package registers every model on SQLModel.metadata, which is
required before `init_db()` calls `create_all`.
"""
from app.models.dashboard import Dashboard
from app.models.dataset import Dataset
from app.models.notebook import Notebook
from app.models.project import Project
from app.models.sql_query import SqlQuery
from app.models.user import User

__all__ = ["User", "Project", "Dataset", "SqlQuery", "Dashboard", "Notebook"]
