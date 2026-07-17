from app.schemas.report import (
    ReportRead, ReportSection, SectionBlock, SectionType,
)
from app.services.reporting.render import report_to_html, report_to_markdown


def _report() -> ReportRead:
    return ReportRead(
        id=1, project_id=1, owner_id=1, scope="dataset", dataset_id=1, title="My Report",
        share_token="tok", ai_available=True,
        created_at="2026-07-17T00:00:00Z", updated_at="2026-07-17T00:00:00Z",
        generated_at="2026-07-17T00:00:00Z",
        sections=[
            ReportSection(id="s1", type=SectionType.EXECUTIVE_SUMMARY, title="Executive Summary",
                          blocks=[SectionBlock(kind="prose", text="Top-line finding.")]),
            ReportSection(id="s2", type=SectionType.EDA, title="EDA",
                          blocks=[SectionBlock(kind="chart", ref_id="c1",
                                  payload={"title": "By region", "chart_type": "bar",
                                           "business_question": "Q?", "data": [{"category": "x", "count": 1}]})]),
            ReportSection(id="s3", type=SectionType.SQL_ANALYSIS, title="SQL",
                          blocks=[SectionBlock(kind="sql", ref_id="7",
                                  payload={"business_question": "Top?", "sql": "SELECT 1",
                                           "explanation": "e", "insights": ["insight"], "row_count": 3})]),
        ],
    )


def test_markdown_includes_prose_chart_and_sql():
    md = report_to_markdown(_report())
    assert "Top-line finding." in md
    assert "By region" in md
    assert "```sql" in md and "SELECT 1" in md
    assert "insight" in md


def test_html_is_self_contained_and_includes_title():
    html = report_to_html(_report())
    assert "<html" in html and "</html>" in html
    assert "My Report" in html
    assert "Top-line finding." in html
