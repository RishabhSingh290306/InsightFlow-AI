"""Stage 2 — AI interpretation of a DatasetProfile via OpenRouter.

Consumes the structured profile (NEVER the raw file). Falls back to a
deterministic result if the LLM is unavailable, so the workflow never fails
because of an AI issue.
"""
from __future__ import annotations

import json

from pydantic import ValidationError

from app.schemas.understanding import DatasetProfile, DatasetUnderstanding
from app.services.llm import complete_json

_SYSTEM = (
    "You are a senior data analyst. You are given STRUCTURED metadata about a "
    "dataset (not the raw data). Return a JSON object with exactly these keys: "
    "dataset_description (string), business_domain_guess (string), "
    "likely_use_case (string), possible_target_column (string or null), "
    "important_features (list of strings), data_quality_summary (string), "
    "cleaning_recommendations (list of strings), suggested_visualizations "
    "(list of strings), suggested_business_questions (list of strings), "
    "initial_business_observations (list of strings), confidence_score "
    "(number 0-1), and explanation (object mapping each of those keys to a "
    "short string rationale). Respond with JSON only."
)


async def understand_dataset(profile: DatasetProfile) -> DatasetUnderstanding:
    user_prompt = (
        "Here is the structured profile of the dataset:\n"
        + json.dumps(profile.model_dump(mode="json", exclude={"preview"}), indent=2)
    )
    try:
        data = await complete_json(_SYSTEM, user_prompt)
        return DatasetUnderstanding.model_validate(data)
    except (Exception, ValidationError):
        # Missing key, API error, or malformed JSON -> deterministic fallback.
        return _fallback(profile)


def _fallback(profile: DatasetProfile) -> DatasetUnderstanding:
    target = profile.potential_target_column
    if profile.data_quality_issues:
        summary = "AI insights temporarily unavailable. Detected issues: " + " ".join(
            profile.data_quality_issues
        )
    else:
        summary = "AI insights temporarily unavailable. No major quality issues detected by profiling."

    viz = ["histogram for numeric columns", "bar chart for categorical columns"]
    return DatasetUnderstanding(
        dataset_description=(
            f"Dataset '{profile.file_name}' with {profile.row_count} rows "
            f"and {profile.column_count} columns."
        ),
        business_domain_guess="unknown (AI unavailable)",
        likely_use_case="exploratory analysis",
        possible_target_column=target,
        important_features=profile.numeric_columns[:5],
        data_quality_summary=summary,
        cleaning_recommendations=(
            profile.data_quality_issues
            if profile.data_quality_issues
            else ["No cleaning steps suggested by deterministic profiling."]
        ),
        suggested_visualizations=viz,
        suggested_business_questions=["What drives the target column?"],
        initial_business_observations=[],
        confidence_score=0.3,
        explanation={
            "note": "Fallback generated without AI; set OPENROUTER_API_KEY for richer insights."
        },
        ai_available=False,
    )
