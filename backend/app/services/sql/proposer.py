"""Stage 1 — AI SQL generation (best-effort).

Sends the structured profile + the user's business question to the LLM and asks
for a single read-only SQL query (against the `dataset` table) plus explanation,
confidence, and a suggested visualization. The returned SQL is validated; if it
is unsafe or empty, we return an empty `sql` with `ai_available=False` so the
user can write their own. Never raises because of the LLM.
"""
from __future__ import annotations

import json

from app.schemas.sql import SqlProposal, SqlVisualization
from app.schemas.understanding import DatasetProfile, DatasetUnderstanding
from app.services.llm import complete_json
from app.services.sql.engine import validate_sql

_SYSTEM = (
    "You are a SQL expert for a data-analyst tool. You are given the STRUCTURED "
    "profile of a dataset (never the raw rows) and a user's business question. "
    "Write a SINGLE, read-only SQL query that answers it. The data is registered "
    "as a table named 'dataset' with the given columns. Respond with JSON only: "
    "{\"business_question\": str, \"sql\": str, \"explanation\": str, \"confidence\": "
    "number 0-1, \"suggested_visualization\": {\"chart_type\": str, \"rationale\": "
    "str, \"x\": str|null, \"y\": str|null}}."
)


def _viz(raw) -> SqlVisualization | None:
    if not isinstance(raw, dict):
        return None
    return SqlVisualization(
        chart_type=str(raw.get("chart_type", "bar")),
        rationale=str(raw.get("rationale", "")),
        x=raw.get("x"), y=raw.get("y"),
    )


async def generate_sql(
    question: str,
    profile: DatasetProfile,
    understanding: DatasetUnderstanding | None = None,
) -> SqlProposal:
    profile_json = profile.model_dump(mode="json")
    profile_json.pop("preview", None)  # never send raw-looking rows
    user_prompt = json.dumps(
        {"question": question, "profile": profile_json}, indent=2
    )
    try:
        data = await complete_json(_SYSTEM, user_prompt)
        sql = str(data.get("sql", "")).strip()
        ok, _ = validate_sql(sql, profile.column_names)
        if not ok or not sql:
            return SqlProposal(
                business_question=question, sql="",
                explanation="AI could not produce a safe query. Write your own SQL below.",
                confidence=0.0, suggested_visualization=None, ai_available=False,
            )
        return SqlProposal(
            business_question=question, sql=sql,
            explanation=str(data.get("explanation", "")),
            confidence=float(data.get("confidence", 0.7)),
            suggested_visualization=_viz(data.get("suggested_visualization")),
            ai_available=True,
        )
    except Exception:
        return SqlProposal(
            business_question=question, sql="",
            explanation="AI unavailable — write your own SQL below.",
            confidence=0.0, suggested_visualization=None, ai_available=False,
        )
