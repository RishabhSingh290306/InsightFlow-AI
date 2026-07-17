"""Single SQL engine for InsightFlow: generate, validate, execute, interpret.

This is the ONLY place SQL is generated or executed. The future AI Chat module
reuses exactly this package — there is no second SQL system.
"""
from app.services.sql.engine import execute_query, suggest_chart, validate_sql
from app.services.sql.insights import interpret_result
from app.services.sql.proposer import generate_sql

__all__ = ["generate_sql", "validate_sql", "execute_query", "suggest_chart", "interpret_result"]