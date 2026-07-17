from types import SimpleNamespace

from app.schemas.understanding import DatasetProfile, DatasetUnderstanding
from app.schemas.eda import EdaResult, ChartSpec
from app.schemas.report import ReportSection, SectionType
from app.services.reporting.assemble import (
    assemble_report,
    build_data_quality_section,
    build_eda_section,
    build_sql_section,
)


def _profile() -> DatasetProfile:
    return DatasetProfile(
        file_name="sales.csv", file_size=100, row_count=10, column_count=2,
        column_names=["region", "amount"], inferred_types={"region": "categorical", "amount": "numeric"},
        numeric_columns=["amount"], categorical_columns=["region"], date_columns=[],
        missing_values={"region": 1, "amount": 0}, duplicate_row_count=0, null_percentage=5.0,
        unique_values={"region": 3, "amount": 9}, basic_statistics={},
        potential_target_column="amount",
        data_quality_issues=["'region' has 1 missing values (10.0%)."], preview=[],
    )


def test_build_data_quality_section_reports_issues():
    sec = build_data_quality_section(_profile(), None)
    assert sec.type == SectionType.DATA_QUALITY
    assert any("missing" in (b.text or "") for b in sec.blocks)


def test_build_eda_section_uses_only_accepted_charts():
    eda = EdaResult(charts=[
        ChartSpec(id="c1", chart_type="bar", title="By region", subtitle=None,
                  business_question="Q?", explanation="e", recommended_reason="r",
                  confidence=0.9, axis_config={}, data=[{"category": "x", "count": 1}],
                  metadata={}, accepted=True),
        ChartSpec(id="c2", chart_type="histogram", title="Amounts", subtitle=None,
                  business_question="Q2?", explanation="e", recommended_reason="r",
                  confidence=0.8, axis_config={}, data=[], metadata={}, accepted=False),
    ])
    sec = build_eda_section(eda)
    chart_blocks = [b for b in sec.blocks if b.kind == "chart"]
    assert [b.ref_id for b in chart_blocks] == ["c1"]


def test_build_sql_section_lists_records():
    rec = SimpleNamespace(id=7, business_question="Top regions?", sql="SELECT 1",
                          explanation="x", insights=["insight A"], row_count=3)
    sec = build_sql_section([rec])
    assert sec.type == SectionType.SQL_ANALYSIS
    assert sec.blocks[0].payload["business_question"] == "Top regions?"
    assert sec.blocks[0].payload["insights"] == ["insight A"]


def test_assemble_report_orders_sections_and_sets_ai_flag():
    ds = SimpleNamespace(
        profile=_profile().model_dump(), understanding=None, eda=None,
        origin="upload", recipe=None, version=1, original_filename="sales.csv",
    )
    sections, ai_available = __import__("asyncio").run(
        assemble_report(datasets=[ds], sql_records=[], scope="dataset", source_name="sales.csv")
    )
    types = [s.type for s in sections]
    assert types[0] == SectionType.COVER
    assert SectionType.EXECUTIVE_SUMMARY in types
    assert types.index(SectionType.EXECUTIVE_SUMMARY) < types.index(SectionType.DATASET_OVERVIEW)
    assert SectionType.RECOMMENDATIONS in types
    assert types[-1] == SectionType.APPENDIX
    assert isinstance(ai_available, bool)


from app.services.reporting.narrate import narrate_report, _fallback_narrative


def test_fallback_narrative_uses_facts_and_marks_unavailable():
    facts = {
        "total_rows": 10,
        "quality_issues": ["'region' has 1 missing."],
        "cleaning_recommendations": ["Impute missing values."],
        "observations": ["Sales vary by region."],
        "sql_insights": ["North leads revenue."],
    }
    out, available = _fallback_narrative(facts)
    assert available is False
    assert "missing" in out["executive_summary"].lower()
    assert any("Impute" in r for r in out["recommendations"])
    assert any("North" in i for i in out["insights"])
