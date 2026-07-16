import asyncio
from app.schemas.eda import ChartSpec
from app.schemas.understanding import DatasetProfile
from app.services.eda import proposer


def _candidates():
    return [
        ChartSpec(id="c1", chart_type="histogram", title="Distribution of age",
                  business_question="q", explanation="", recommended_reason="",
                  confidence=0.0, data=[], metadata={"columns": ["age"]}),
        ChartSpec(id="c2", chart_type="bar", title="Counts by region",
                  business_question="q", explanation="", recommended_reason="",
                  confidence=0.0, data=[], metadata={"columns": ["region"]}),
    ]


def _profile():
    return DatasetProfile(
        file_name="t.csv", file_size=1, row_count=10, column_count=2,
        column_names=["age", "region"], inferred_types={"age": "numeric", "region": "categorical"},
        numeric_columns=["age"], categorical_columns=["region"], date_columns=[],
        missing_values={}, duplicate_row_count=0, null_percentage=0.0,
        unique_values={}, basic_statistics={}, potential_target_column=None,
        data_quality_issues=[], preview=[],
    )


def test_fallback_when_llm_unavailable(monkeypatch):
    async def boom(*a, **k):
        raise RuntimeError("no key")
    monkeypatch.setattr(proposer, "complete_json", boom)
    result, ai_available = asyncio.run(proposer.propose_charts(_profile(), None, _candidates()))
    assert ai_available is False
    assert len(result.charts) == 2
    assert all(c.confidence > 0 for c in result.charts)
    assert all(c.explanation for c in result.charts)


def test_success_path_fills_prose(monkeypatch):
    async def fake(_system, _user, model=None):
        return {"charts": [
            {"id": "c1", "title": "Age spread", "business_question": "dist?",
             "explanation": "shows age", "recommended_reason": "useful",
             "confidence": 0.9, "recommended": True},
        ]}
    monkeypatch.setattr(proposer, "complete_json", fake)
    result, ai_available = asyncio.run(proposer.propose_charts(_profile(), None, _candidates()))
    assert ai_available is True
    by_id = {c.id: c for c in result.charts}
    assert by_id["c1"].title == "Age spread"
    assert by_id["c1"].confidence == 0.9
