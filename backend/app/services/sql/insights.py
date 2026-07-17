"""Stage 2 — AI result interpretation (best-effort).

Sends a compact result summary (row count, columns, a few sample rows) plus the
prior investigation chain to the LLM, and returns BOTH business insights AND
concrete follow-up questions that extend the investigation. On any failure,
returns a deterministic fallback (templated insight + empty followups). Never
raises because of the LLM.
"""
from __future__ import annotations

import json

from app.schemas.sql import SqlChainTurn
from app.schemas.understanding import DatasetProfile
from app.services.llm import complete_json

_SYSTEM = (
    "You are a data analyst. Given a business question, the SQL used, a summary "
    "of the query result, and (optionally) the prior turns of an investigation "
    "chain, write 2-4 concise business insights AND 2-4 concrete, answerable "
    "follow-up questions that extend the investigation. Respond with JSON only: "
    "{\"insights\": [str, ...], \"followup_questions\": [str, ...]}."
)


def _fallback(summary: str) -> tuple[list[str], list[str], bool]:
    return [f"Query returned results. Summary: {summary}."], [], False


async def interpret_result(
    question: str,
    sql: str,
    result_summary: str,
    profile: DatasetProfile,
    chain: list[SqlChainTurn] | None = None,
) -> tuple[list[str], list[str], bool]:
    user_prompt: dict = {
        "question": question,
        "sql": sql,
        "result_summary": result_summary,
        "columns": profile.column_names,
    }
    if chain:
        user_prompt["chain"] = [
            {
                "business_question": t.business_question,
                "sql": t.sql,
                "result_summary": t.result_summary,
            }
            for t in chain
        ]
    try:
        data = await complete_json(_SYSTEM, json.dumps(user_prompt, indent=2))
        if not isinstance(data, dict):
            return _fallback(result_summary)
        insights = [str(i) for i in data.get("insights", [])][:5]
        followups = [str(i) for i in data.get("followup_questions", [])][:5]
        if not insights:
            insights, _, _ = _fallback(result_summary)
        return insights, followups, True
    except Exception:
        return _fallback(result_summary)