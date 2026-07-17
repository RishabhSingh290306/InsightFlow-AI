import asyncio

from app.schemas.sql import SqlChainTurn, SqlProposal, SqlVisualization
from app.schemas.understanding import DatasetProfile
from app.services.sql import insights, proposer


def _profile():
    return DatasetProfile(
        file_name="t.csv", file_size=1, row_count=3, column_count=3,
        column_names=["age", "region", "score"],
        inferred_types={"age": "numeric", "region": "categorical", "score": "numeric"},
        numeric_columns=["age", "score"], categorical_columns=["region"],
        date_columns=[], missing_values={}, duplicate_row_count=0, null_percentage=0.0,
        unique_values={}, basic_statistics={}, potential_target_column=None,
        data_quality_issues=[], preview=[],
    )


def test_success_fills_sql(monkeypatch):
    async def fake(_s, _u, model=None):
        return {
            "business_question": "q", "sql": "SELECT age FROM dataset",
            "explanation": "shows age", "confidence": 0.9,
            "suggested_visualization": {"chart_type": "histogram", "rationale": "r", "x": "age", "y": None},
        }
    monkeypatch.setattr(proposer, "complete_json", fake)
    p = asyncio.run(proposer.generate_sql("q", _profile()))
    assert p.ai_available is True
    assert p.sql == "SELECT age FROM dataset"
    assert p.suggested_visualization.chart_type == "histogram"


def test_fallback_on_error(monkeypatch):
    async def boom(*a, **k):
        raise RuntimeError("no key")
    monkeypatch.setattr(proposer, "complete_json", boom)
    p = asyncio.run(proposer.generate_sql("q", _profile()))
    assert p.ai_available is False
    assert p.sql == ""


def test_fallback_on_invalid_sql(monkeypatch):
    async def fake(_s, _u, model=None):
        return {"sql": "SELECT nope FROM dataset"}  # unknown column
    monkeypatch.setattr(proposer, "complete_json", fake)
    p = asyncio.run(proposer.generate_sql("q", _profile()))
    assert p.ai_available is False
    assert p.sql == ""


def test_insights_fallback_on_error(monkeypatch):
    async def boom(*a, **k):
        raise RuntimeError("no key")
    monkeypatch.setattr(insights, "complete_json", boom)
    ins, fups, avail = asyncio.run(
        insights.interpret_result("q", "SELECT 1", "row_count=3", _profile())
    )
    assert avail is False
    assert fups == []
    assert ins  # deterministic templated fallback


def test_generate_uses_chain(monkeypatch):
    captured = {}

    async def fake(_s, u, model=None):
        captured["u"] = u
        return {"sql": "SELECT age FROM dataset", "explanation": "e", "confidence": 0.9}

    monkeypatch.setattr(proposer, "complete_json", fake)
    chain = [SqlChainTurn(business_question="q0", sql="SELECT 1", result_summary="1 row")]
    p = asyncio.run(proposer.generate_sql("q", _profile(), chain=chain))
    assert p.ai_available is True
    assert "chain" in captured["u"]
