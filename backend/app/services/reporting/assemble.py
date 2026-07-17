"""Assemble a `Report` from accepted project artifacts.

Deterministic factual sections (overview, quality, cleaning, EDA, SQL, lineage) are
built here from stored artifacts. AI prose (executive summary, insights,
recommendations) comes from `narrate_report` with a deterministic fallback. This
module is the ONLY place a report is constructed.
"""
from __future__ import annotations

import uuid

from app.schemas.eda import EdaResult
from app.schemas.understanding import DatasetProfile, DatasetUnderstanding
from app.schemas.report import ReportSection, SectionBlock, SectionType
from app.services.reporting.narrate import narrate_report


def _uid() -> str:
    return uuid.uuid4().hex


def _prose(text: str | None) -> SectionBlock:
    return SectionBlock(kind="prose", text=text or "")


def build_cover_section(scope: str, source_name: str) -> ReportSection:
    return ReportSection(
        id=_uid(), type=SectionType.COVER, title="Cover",
        blocks=[
            _prose(f"Scope: {scope}"),
            _prose(f"Source: {source_name}"),
        ],
    )


def build_dataset_overview_section(profile: DatasetProfile, understanding, source_name: str | None) -> ReportSection:
    blocks = [
        _prose(f"{profile.row_count} rows × {profile.column_count} columns."),
        _prose(f"Potential target column: {profile.potential_target_column or 'n/a'}"),
    ]
    if understanding is not None and understanding.ai_available and understanding.dataset_description:
        blocks.append(_prose(understanding.dataset_description))
    blocks.append(SectionBlock(kind="table", payload={
        "columns": ["Column", "Type", "Missing", "Unique"],
        "rows": [
            [c, profile.inferred_types.get(c, ""), profile.missing_values.get(c, 0),
             profile.unique_values.get(c, 0)]
            for c in profile.column_names
        ],
    }))
    title = "Dataset Overview" + (f" — {source_name}" if source_name else "")
    return ReportSection(id=_uid(), type=SectionType.DATASET_OVERVIEW, title=title, blocks=blocks)


def build_data_quality_section(profile: DatasetProfile, source_name: str | None) -> ReportSection:
    blocks = [
        _prose(f"Null cells: {profile.null_percentage}%"),
        _prose(f"Duplicate rows: {profile.duplicate_row_count}"),
    ]
    if profile.data_quality_issues:
        blocks.append(_prose("\n".join(f"• {i}" for i in profile.data_quality_issues)))
    else:
        blocks.append(_prose("No data quality issues detected."))
    title = "Data Quality" + (f" — {source_name}" if source_name else "")
    return ReportSection(id=_uid(), type=SectionType.DATA_QUALITY, title=title, blocks=blocks)


def build_cleaning_section(dataset) -> ReportSection:
    blocks = []
    if dataset.origin == "upload" and not dataset.recipe:
        blocks.append(_prose("No cleaning applied — original upload."))
    else:
        recipe = dataset.recipe or {}
        for op in recipe.get("operations", []):
            blocks.append(_prose(f"• {op.get('op')}: {op.get('explanation') or ''}"))
        for s in recipe.get("skipped", []):
            blocks.append(_prose(f"• rejected: {s.get('op')}"))
    return ReportSection(id=_uid(), type=SectionType.CLEANING_SUMMARY, title="Cleaning Summary", blocks=blocks)


def build_eda_section(eda: EdaResult) -> ReportSection:
    blocks = []
    accepted = [c for c in eda.charts if c.accepted]
    if not accepted:
        blocks.append(_prose("No charts were accepted."))
    for c in accepted:
        blocks.append(SectionBlock(kind="chart", ref_id=c.id, payload=c.model_dump(mode="json")))
    return ReportSection(id=_uid(), type=SectionType.EDA, title="Exploratory Data Analysis", blocks=blocks)


def build_sql_section(sql_records) -> ReportSection:
    blocks = []
    if not sql_records:
        blocks.append(_prose("No SQL queries executed."))
    for r in sql_records:
        blocks.append(SectionBlock(kind="sql", ref_id=str(getattr(r, "id", "")), payload={
            "business_question": getattr(r, "business_question", ""),
            "sql": getattr(r, "sql", ""),
            "explanation": getattr(r, "explanation", ""),
            "insights": getattr(r, "insights") or [],
            "row_count": getattr(r, "row_count", None),
        }))
    return ReportSection(id=_uid(), type=SectionType.SQL_ANALYSIS, title="SQL Analysis", blocks=blocks)


def build_appendix_section(datasets) -> ReportSection:
    versions = [
        {"version": getattr(d, "version", 1), "origin": getattr(d, "origin", "upload"),
         "filename": getattr(d, "original_filename", "")}
        for d in datasets
    ]
    return ReportSection(id=_uid(), type=SectionType.APPENDIX,
                         title="Appendix — Version Lineage",
                         blocks=[SectionBlock(kind="lineage", payload={"versions": versions})])


def _build_facts(datasets, sql_records) -> dict:
    quality_issues, cleaning_recs, observations, sql_insights = [], [], [], []
    total_rows = 0
    for d in datasets:
        if not getattr(d, "profile", None):
            continue
        prof = DatasetProfile.model_validate(d.profile)
        total_rows += prof.row_count
        quality_issues.extend(prof.data_quality_issues)
        if getattr(d, "understanding", None):
            u = DatasetUnderstanding.model_validate(d.understanding)
            cleaning_recs.extend(u.cleaning_recommendations)
            observations.extend(u.initial_business_observations)
    for s in sql_records:
        sql_insights.extend(getattr(s, "insights") or [])
    return {
        "total_rows": total_rows,
        "quality_issues": quality_issues,
        "cleaning_recommendations": cleaning_recs,
        "observations": observations,
        "sql_insights": sql_insights,
    }


async def assemble_report(*, datasets, sql_records, scope: str, source_name: str) -> tuple[list[ReportSection], bool]:
    sections: list[ReportSection] = []
    sections.append(build_cover_section(scope, source_name))

    facts = _build_facts(datasets, sql_records)
    narrative, ai_available = await narrate_report(facts)
    sections.append(ReportSection(
        id=_uid(), type=SectionType.EXECUTIVE_SUMMARY, title="Executive Summary",
        blocks=[_prose(narrative["executive_summary"])],
    ))

    for d in datasets:
        profile = DatasetProfile.model_validate(d.profile) if d.profile else None
        if profile is None:
            continue
        understanding = DatasetUnderstanding.model_validate(d.understanding) if d.understanding else None
        eda = EdaResult.model_validate(d.eda) if d.eda else EdaResult()
        name = d.original_filename if scope == "project" else None
        sections.append(build_dataset_overview_section(profile, understanding, name))
        sections.append(build_data_quality_section(profile, name))
        sections.append(build_cleaning_section(d))
        sections.append(build_eda_section(eda))

    sections.append(build_sql_section(sql_records))
    sections.append(ReportSection(
        id=_uid(), type=SectionType.BUSINESS_INSIGHTS, title="Business Insights",
        blocks=[_prose("\n".join(f"• {i}" for i in narrative["insights"]) or "No insights available.")],
    ))
    sections.append(ReportSection(
        id=_uid(), type=SectionType.RECOMMENDATIONS, title="Recommendations",
        blocks=[_prose("\n".join(f"• {i}" for i in narrative["recommendations"]) or "No recommendations available.")],
    ))
    lineage_ds = datasets if scope == "project" else [datasets[0]] if datasets else []
    sections.append(build_appendix_section(lineage_ds))
    return sections, ai_available
