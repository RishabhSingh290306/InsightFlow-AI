import asyncio

from app.schemas.sql import SqlChainTurn
from app.schemas.understanding import DatasetProfile
from app.services.sql import insights


def _profile() -> DatasetProfile:
    return DatasetProfile(
        file_name="t.csv",
        file_size=1,
        row_count=3,
        column_count=3,
        column_names=["age", "region", "score"],
        inferred_types={"age": "numeric", "region": "categorical", "score": "numeric"},
        numeric_columns=["age", "score"],
        categorical_columns=["region"],
        date_columns=[],
        missing_values={},
        duplicate_row_count=0,
        null_percentage=0.0,
        unique_values={},
        basic_statistics={},
        potential_target_column=None,
        data_quality_issues=[],
        preview=[],
    )


def test_interpret_success(monkeypatch):
    async def fake(_s, _u, model=None):
        return {"insights": ["i1", "i2"], "followup_questions": ["f1", "f2"]}

    monkeypatch.setattr(insights, "complete_json", fake)
    ins, fups, avail = asyncio.run(
        insights.interpret_result("q", "SELECT 1", "row_count=3", _profile())
    )
    assert avail is True
    assert ins == ["i1", "i2"]
    assert fups == ["f1", "f2"]


def test_interpret_fallback_on_error(monkeypatch):
    async def boom(*a, **k):
        raise RuntimeError("no key")

    monkeypatch.setattr(insights, "complete_json", boom)
    ins, fups, avail = asyncio.run(
        insights.interpret_result("q", "SELECT 1", "row_count=3", _profile())
    )
    assert avail is False
    assert fups == []
    assert ins  # deterministic templated fallback


def test_interpret_uses_chain(monkeypatch):
    captured = {}

    async def fake(_s, u, model=None):
        captured["u"] = u
        return {"insights": ["i1"], "followup_questions": ["f1"]}

    monkeypatch.setattr(insights, "complete_json", fake)
    chain = [SqlChainTurn(business_question="q0", sql="SELECT 1", result_summary="1 row")]
    asyncio.run(
        insights.interpret_result("q", "SELECT 2", "row_count=2", _profile(), chain=chain)
    )
    assert "chain" in captured["u"]