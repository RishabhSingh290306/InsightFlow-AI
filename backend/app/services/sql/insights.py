"""Stage 2 — AI business insights on a query result (best-effort).

Sends a compact result summary (row count, columns, a few sample rows) to the
LLM for 2-4 insight bullets. On any failure, returns deterministic templated
bullets. Never raises because of the LLM.
"""
from __future__ import annotations

import json

from app.schemas.understanding import DatasetProfile
from app.services.llm import complete_json

_SYSTEM = (
    "You are a data analyst. Given a business question, the SQL used, and a "
    "summary of the query result, write 2-4 concise, plain-English business "
    "insights. Respond with JSON only: {\"insights\": [str, ...]}."
)


def _fallback(summary: str) -> list[str]:
    return [f"Query returned results. Summary: {summary}."]


async def generate_insights(
    question: str, sql: str, result_summary: str, profile: DatasetProfile
) -> tuple[list[str], bool]:
    user_prompt = json.dumps(
        {"question": question, "sql": sql, "result_summary": result_summary}, indent=2
    )
    try:
        data = await complete_json(_SYSTEM, user_prompt)
        items = data.get("insights", []) if isinstance(data, dict) else []
        if not items:
            return _fallback(result_summary), False
        return [str(i) for i in items][:5], True
    except Exception:
        return _fallback(result_summary), False
