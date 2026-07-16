"""Stage 2 — AI interpretation of EDA candidates (best-effort).

Consumes the structured profile + the deterministically computed candidate
charts, and asks the LLM to write prose (title/business_question/explanation/
recommended_reason/confidence) for each. On any failure, falls back to keeping
all candidates with templated prose. Never raises because of the LLM.
"""
from __future__ import annotations

import json

from pydantic import ValidationError

from app.schemas.eda import ChartSpec, EdaResult
from app.schemas.understanding import DatasetProfile, DatasetUnderstanding
from app.services.llm import complete_json

_SYSTEM = (
    "You are a senior data analyst. You are given STRUCTURED metadata about a "
    "dataset (never the raw data) and a list of CANDIDATE charts already computed "
    "from it. For each candidate (by 'id') write: title (string), business_question "
    "(string), explanation (string), recommended_reason (string), confidence "
    "(number 0-1), and recommended (boolean — whether to surface it). Respond with "
    "JSON only: {\"charts\": [ {id, title, business_question, explanation, "
    "recommended_reason, confidence, recommended} ]}."
)


async def propose_charts(
    profile: DatasetProfile,
    understanding: DatasetUnderstanding | None,
    candidates: list[ChartSpec],
) -> tuple[EdaResult, bool]:
    candidates = list(candidates)
    try:
        user_prompt = (
            "Profile:\n" + json.dumps(profile.model_dump(mode="json"), indent=2)
            + "\nCandidates (id, type, source columns):\n"
            + json.dumps(
                [{"id": c.id, "chart_type": c.chart_type, "columns": c.metadata.get("columns")}
                 for c in candidates],
                indent=2,
            )
        )
        data = await complete_json(_SYSTEM, user_prompt)
        raw = data.get("charts", []) if isinstance(data, dict) else []
        by_id = {c.id: c for c in candidates}
        out: list[ChartSpec] = []
        for item in raw:
            spec = by_id.get(item.get("id"))
            if spec is None:
                continue
            spec = spec.model_copy()
            spec.title = str(item.get("title", spec.title))
            spec.business_question = str(item.get("business_question", spec.business_question))
            spec.explanation = str(item.get("explanation", ""))
            spec.recommended_reason = str(item.get("recommended_reason", ""))
            spec.confidence = float(item.get("confidence", spec.confidence))
            out.append(spec)
        if not out:
            return EdaResult(ai_available=False, charts=_fallback(candidates, profile)), False
        return EdaResult(ai_available=True, charts=out), True
    except (Exception, ValidationError):
        return EdaResult(ai_available=False, charts=_fallback(candidates, profile)), False


def _fallback(candidates: list[ChartSpec], profile: DatasetProfile) -> list[ChartSpec]:
    null_pct = float(getattr(profile, "null_percentage", 0) or 0)
    base = max(0.3, round(0.9 - null_pct / 100.0, 2))
    out = []
    for c in candidates:
        c = c.model_copy()
        c.confidence = base
        c.explanation = c.explanation or (
            f"Shows the {c.chart_type} view of {c.metadata.get('columns')}."
        )
        c.recommended_reason = c.recommended_reason or (
            "Automatically generated from the dataset profile."
        )
        out.append(c)
    return out
