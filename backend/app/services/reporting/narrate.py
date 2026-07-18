"""Best-effort AI narration for report prose.

Sends only structured facts (never raw data) to the LLM and asks for a constrained
JSON object. On ANY failure it returns a deterministic templated narrative and
`ai_available=False` so the UI can show a "rule-based report" banner.
"""
from __future__ import annotations

import json

from app.services.llm import complete_json

_SYSTEM = (
    "You are a senior data analyst writing a concise, professional report for a "
    "non-technical stakeholder. Use the provided structured facts only — never "
    "invent data. Return strict JSON."
)


async def narrate_report(facts: dict) -> tuple[dict, bool]:
    user = json.dumps({
        "total_rows": facts.get("total_rows", 0),
        "quality_issues": facts.get("quality_issues", []),
        "cleaning_recommendations": facts.get("cleaning_recommendations", []),
        "observations": facts.get("observations", []),
        "sql_insights": facts.get("sql_insights", []),
    })
    try:
        data = await complete_json(
            _SYSTEM,
            f"Write the report narrative as JSON with keys: "
            f"executive_summary (string), insights (list of strings), "
            f"recommendations (list of strings). Facts:\n{user}",
        )
        return {
            "executive_summary": (data.get("executive_summary") or "").strip(),
            "insights": [str(i) for i in (data.get("insights") or []) if str(i).strip()],
            "recommendations": [str(r) for r in (data.get("recommendations") or []) if str(r).strip()],
        }, True
    except Exception:
        return _fallback_narrative(facts)


def _fallback_narrative(facts: dict) -> tuple[dict, bool]:
    issues = facts.get("quality_issues", [])
    recs = facts.get("cleaning_recommendations", [])
    obs = facts.get("observations", [])
    sql_ins = facts.get("sql_insights", [])
    summary = "This report summarizes the analyzed data"
    if facts.get("total_rows"):
        summary += f" ({facts['total_rows']} rows)."
    if issues:
        summary += " Key data quality issues: " + "; ".join(issues[:5]) + "."
    else:
        summary += " No significant data quality issues were detected."
    recommendations = list(recs) if recs else (issues if issues else ["No specific recommendations."])
    insights = list(obs) + list(sql_ins)
    return {
        "executive_summary": summary,
        "insights": insights or ["No automated insights available."],
        "recommendations": recommendations,
    }, False
