"""Single SQL engine for InsightFlow: generate, validate, execute, insights.

The `proposer` and `insights` modules are added in Task 4; this package is
extended there so the engine tests (Task 3) can import without them.
"""
from app.services.sql.engine import execute_query, suggest_chart, validate_sql

__all__ = ["validate_sql", "execute_query", "suggest_chart"]
