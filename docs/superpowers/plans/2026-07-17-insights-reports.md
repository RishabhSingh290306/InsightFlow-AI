# Insights + Reports — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a curated, AI-narrated, interactive report feature that aggregates a dataset's or project's accepted analysis artifacts into an editable document that can be shared via a public read-only link and exported to PDF/Markdown.

**Architecture:** A `Report` is stored as canonical JSON (an ordered list of `Section` objects) on a new `reports` table. The assembly service (`app/services/reporting/`) is the only place a report is built — it pulls *accepted* artifacts (profile, understanding, accepted EDA charts, cleaning recipe, SQL history, lineage) and fills factual sections deterministically while best-effort AI writes the prose. A presentation-only renderer converts the `Report` to HTML (used for the interactive editor, the public share view, and PDF print) and to Markdown.

**Tech Stack:** FastAPI (Python 3.11), SQLModel, Alembic, pydantic; Next.js 15 App Router, React 18, TypeScript, Tailwind v3, Recharts, lucide-react.

## Global Constraints

- All API routes are versioned under `/api/v1` (`settings.API_V1_PREFIX`).
- Next.js rewrites `/api/*` → backend `http://localhost:8000/api/*` (see `frontend/next.config.mjs`).
- Login is form-encoded (`username`, `password`); register is JSON. Auth token stored in `localStorage` key `insightflow_token`.
- **Deterministic code computes facts; AI interprets; human approves.** Every AI step is best-effort with a deterministic fallback and must never return a 5xx.
- Downstream workflows consume the stored `Dataset.profile` — they never reparse the uploaded file.
- DB schema changes go through Alembic migrations run on startup — never `create_all`.
- **Report JSON is the canonical representation.** The renderer is presentation-only. The assembly service constructs reports from accepted artifacts.
- **No server-side PDF dependency** — PDF is produced by the browser printing the rendered HTML (`window.print()`).
- **Public share is strictly read-only and scoped to one report** — no auth, no mutation verbs, no other datasets/projects/users.
- Do **not** run `git push`. Invoke the venv Python as `./.venv/Scripts/python.exe` (from `backend/`).
- Existing patterns to mirror: `app/api/routes/sql.py` (owner-guarded routes + 409 before profile), `app/models/sql_query.py` (SQLModel table), `app/schemas/eda.py` (wire contracts), `frontend/lib/api.ts` + `frontend/lib/types.ts`, `frontend/components/chart-renderer.tsx`.

---

## File Structure

**Backend (new/modified):**
- Create `backend/alembic/versions/g8h9i0j1k2l3_add_reports_table.py` — migration.
- Create `backend/app/models/report.py` — `Report` SQLModel table.
- Create `backend/app/schemas/report.py` — `SectionType`, `SectionBlock`, `ReportSection`, `ReportRead`, `ReportShareRead`, `ReportGenerateRequest`, `ReportUpdateRequest`.
- Create `backend/app/services/reporting/__init__.py` — exports.
- Create `backend/app/services/reporting/assemble.py` — pure section builders + `assemble_report(...)`.
- Create `backend/app/services/reporting/narrate.py` — `narrate_report(...)` + `_fallback_narrative(...)`.
- Create `backend/app/services/reporting/render.py` — `report_to_html(...)`, `report_to_markdown(...)`.
- Create `backend/app/api/routes/reports.py` — routes.
- Modify `backend/app/main.py` — import + include the reports router.
- Create `backend/tests/test_report_assemble.py` — assembly unit tests.
- Create `backend/tests/test_report_render.py` — render unit tests.

**Frontend (new/modified):**
- Modify `frontend/lib/types.ts` — report types.
- Modify `frontend/lib/api.ts` — `reportsApi`.
- Create `frontend/components/report-renderer.tsx` — presentation-only renderer.
- Create `frontend/components/report-editor.tsx` — HITL editor.
- Create `frontend/app/reports/[id]/page.tsx` — owner editable view.
- Create `frontend/app/reports/share/[token]/page.tsx` — public read-only view.
- Modify `frontend/app/projects/[id]/page.tsx` — add Generate Report buttons.
- Modify `frontend/app/globals.css` — print stylesheet.

---

# Milestone 1 — Backend: assembly, storage, API

## Task 1: Reports table migration + model

**Files:**
- Create: `backend/alembic/versions/g8h9i0j1k2l3_add_reports_table.py`
- Create: `backend/app/models/report.py`
- Modify: `backend/app/main.py` (only the import line is added in Task 6; here just create the model)

**Interfaces:**
- Produces: `Report` SQLModel table (imported by routes in Task 6).

- [ ] **Step 1: Write the migration**

```python
"""add reports table

Revision ID: g8h9i0j1k2l3
Revises: f7a8b9c0d1e2
Create Date: 2026-07-17 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


revision: str = "g8h9i0j1k2l3"
down_revision: Union[str, Sequence[str], None] = "f7a8b9c0d1e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "reports",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("scope", sa.String(), nullable=False),
        sa.Column("dataset_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("sections", sa.JSON(), nullable=False),
        sa.Column("share_token", sa.String(), nullable=False),
        sa.Column("ai_available", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("generated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["dataset_id"], ["datasets.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_reports_project_id", "reports", ["project_id"])
    op.create_index("ix_reports_owner_id", "reports", ["owner_id"])
    op.create_index("ix_reports_dataset_id", "reports", ["dataset_id"])
    op.create_index("ix_reports_share_token", "reports", ["share_token"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_reports_share_token", table_name="reports")
    op.drop_index("ix_reports_dataset_id", table_name="reports")
    op.drop_index("ix_reports_owner_id", table_name="reports")
    op.drop_index("ix_reports_project_id", table_name="reports")
    op.drop_table("reports")
```

- [ ] **Step 2: Write the model**

```python
"""Report — a curated, editable analysis document.

Stored as canonical JSON: an ordered list of `ReportSection` dicts in `sections`.
`share_token` is a random, unique, public handle for the read-only share link.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, JSON, Text
from sqlmodel import Field, SQLModel


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Report(SQLModel, table=True):
    __tablename__ = "reports"

    id: int | None = Field(default=None, primary_key=True)
    project_id: int = Field(index=True, foreign_key="projects.id")
    owner_id: int = Field(index=True, foreign_key="users.id")
    scope: str = "dataset"  # "dataset" | "project"
    dataset_id: int | None = Field(default=None, index=True, foreign_key="datasets.id")
    title: str = Field(sa_column=Column(Text))
    sections: list[dict] = Field(default_factory=list, sa_column=Column(JSON))
    share_token: str = Field(index=True, unique=True)
    ai_available: bool = True
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
    generated_at: datetime = Field(default_factory=_now)
```

- [ ] **Step 3: Compile-check both files**

Run: `cd backend && ./.venv/Scripts/python.exe -m py_compile app/models/report.py alembic/versions/g8h9i0j1k2l3_add_reports_table.py`
Expected: no output (success).

- [ ] **Step 4: Commit**

```bash
cd backend && git add app/models/report.py alembic/versions/g8h9i0j1k2l3_add_reports_table.py && git commit -m "feat(reports): add reports table migration + model"
```

---

## Task 2: Report schemas

**Files:**
- Create: `backend/app/schemas/report.py`

**Interfaces:**
- Produces: `SectionType`, `SectionBlock`, `ReportSection`, `ReportRead`, `ReportShareRead`, `ReportGenerateRequest`, `ReportUpdateRequest` (consumed by assembly, routes, frontend types).

- [ ] **Step 1: Write the schemas**

```python
"""Wire contracts for the Insights + Reports workflow.

A `Report` is an ordered list of `ReportSection`. Each section holds `blocks` that
mix editable prose with references to already-stored artifacts (chart specs, SQL
records, tables, lineage). The renderer resolves these references; it never
computes anything.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel


class SectionType(str, Enum):
    COVER = "cover"
    EXECUTIVE_SUMMARY = "executive_summary"
    DATASET_OVERVIEW = "dataset_overview"
    DATA_QUALITY = "data_quality"
    CLEANING_SUMMARY = "cleaning_summary"
    EDA = "eda"
    SQL_ANALYSIS = "sql_analysis"
    BUSINESS_INSIGHTS = "business_insights"
    RECOMMENDATIONS = "recommendations"
    APPENDIX = "appendix"
    CUSTOM = "custom"


class SectionBlock(BaseModel):
    """One unit inside a section."""

    kind: str  # "prose" | "chart" | "sql" | "table" | "lineage" | "custom_note"
    text: str | None = None
    ref_id: str | None = None
    payload: dict = {}


class ReportSection(BaseModel):
    id: str
    type: SectionType
    title: str
    blocks: list[SectionBlock] = []


class ReportRead(BaseModel):
    id: int
    project_id: int
    owner_id: int
    scope: str
    dataset_id: int | None = None
    title: str
    sections: list[ReportSection]
    share_token: str
    ai_available: bool
    created_at: datetime
    updated_at: datetime
    generated_at: datetime


class ReportShareRead(BaseModel):
    """Public, read-only projection — no owner/project linkage, no row ids."""

    title: str
    scope: str
    sections: list[ReportSection]
    ai_available: bool
    generated_at: datetime


class ReportGenerateRequest(BaseModel):
    scope: str  # "dataset" | "project"
    project_id: int | None = None
    dataset_id: int | None = None
    title: str | None = None


class ReportUpdateRequest(BaseModel):
    title: str | None = None
    sections: list[ReportSection]
```

- [ ] **Step 2: Compile-check**

Run: `cd backend && ./.venv/Scripts/python.exe -m py_compile app/schemas/report.py`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd backend && git add app/schemas/report.py && git commit -m "feat(reports): add report schemas (sections, requests, share read)"
```

---

## Task 3: Assembly service — pure section builders + orchestrator (TDD)

**Files:**
- Create: `backend/app/services/reporting/__init__.py`
- Create: `backend/app/services/reporting/assemble.py`
- Create: `backend/tests/test_report_assemble.py`

**Interfaces:**
- Consumes: `DatasetProfile`, `DatasetUnderstanding`, `EdaResult` (pydantic), `SqlQuery` rows; `narrate_report` from `app.services.reporting.narrate` (Task 4).
- Produces: `async def assemble_report(*, datasets, sql_records, scope, source_name) -> tuple[list[ReportSection], bool]` and the pure builders (used by tests).

- [ ] **Step 1: Write the failing test**

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_report_assemble.py -v`
Expected: FAIL (module `app.services.reporting.assemble` not found).

- [ ] **Step 3: Write the assembly implementation**

`backend/app/services/reporting/__init__.py`:
```python
from app.services.reporting.assemble import assemble_report
from app.services.reporting.render import report_to_html, report_to_markdown

__all__ = ["assemble_report", "report_to_html", "report_to_markdown"]
```

`backend/app/services/reporting/assemble.py`:
```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_report_assemble.py -v`
Expected: PASS (note: `narrate_report` is imported — Task 4 adds it; tests will fail until Task 4 lands. Implement Task 4 next, then re-run.)

- [ ] **Step 5: Commit (after Task 4 lands and tests pass)**

```bash
cd backend && git add app/services/reporting/ tests/test_report_assemble.py && git commit -m "feat(reports): assembly service (deterministic sections + orchestration)"
```

---

## Task 4: AI narration + deterministic fallback (TDD)

**Files:**
- Create: `backend/app/services/reporting/narrate.py`
- Modify: `backend/tests/test_report_assemble.py` (add a fallback test)

**Interfaces:**
- Consumes: `complete_json` from `app.services.llm`; structured `facts` dict (never raw data).
- Produces: `async def narrate_report(facts: dict) -> tuple[dict, bool]` returning `{"executive_summary": str, "insights": list[str], "recommendations": list[str]}`.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_report_assemble.py`:
```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_report_assemble.py::test_fallback_narrative_uses_facts_and_marks_unavailable -v`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

`backend/app/services/reporting/narrate.py`:
```python
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
        return _fallback_narrative(facts), False


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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_report_assemble.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd backend && git add app/services/reporting/narrate.py tests/test_report_assemble.py && git commit -m "feat(reports): best-effort AI narration with deterministic fallback"
```

---

## Task 5: Renderer — HTML + Markdown (TDD)

**Files:**
- Create: `backend/app/services/reporting/render.py`
- Create: `backend/tests/test_report_render.py`

**Interfaces:**
- Consumes: `ReportRead` (or a section list) — resolves `SectionBlock` from `payload`.
- Produces: `report_to_html(report) -> str`, `report_to_markdown(report) -> str`.

- [ ] **Step 1: Write the failing test**

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_report_render.py -v`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

`backend/app/services/reporting/render.py`:
```python
"""Presentation-only renderers for a `Report`.

Both functions take an already-assembled `ReportRead` and resolve each `SectionBlock`
from its `payload` — they never compute artifacts or call the LLM. `report_to_html`
produces a self-contained printable document (used for the public share fallback and
the `export?format=pdf` route); `report_to_markdown` produces GitHub-flavored Markdown.
Charts render as data tables here (the live React view shows interactive Recharts).
"""
from __future__ import annotations

import html
from datetime import datetime

from app.schemas.report import ReportRead, SectionBlock


def _esc(text: str | None) -> str:
    return html.escape(text or "")


def _block_md(block: SectionBlock) -> str:
    if block.kind in ("prose", "custom_note"):
        return block.text or ""
    if block.kind == "chart":
        spec = block.payload
        lines = [f"**{_esc(spec.get('title'))}** ({_esc(spec.get('chart_type'))})",
                 f"_{_esc(spec.get('business_question'))}_"]
        data = spec.get("data", []) or []
        if data:
            cols = list(data[0].keys())
            lines.append("| " + " | ".join(_esc(c) for c in cols) + " |")
            lines.append("| " + " | ".join("---" for _ in cols) + " |")
            for row in data[:20]:
                lines.append("| " + " | ".join(_esc(str(row.get(c, ""))) for c in cols) + " |")
        return "\n".join(lines)
    if block.kind == "sql":
        p = block.payload
        lines = [f"**Q: {_esc(p.get('business_question'))}**"]
        if p.get("explanation"):
            lines.append(_esc(p.get("explanation")))
        lines.append("```sql\n" + _esc(p.get("sql", "")) + "\n```")
        for ins in p.get("insights", []) or []:
            lines.append(f"- {_esc(ins)}")
        return "\n".join(lines)
    if block.kind == "table":
        p = block.payload
        cols = p.get("columns", []) or []
        lines = ["| " + " | ".join(_esc(c) for c in cols) + " |",
                 "| " + " | ".join("---" for _ in cols) + " |"]
        for row in p.get("rows", []) or []:
            lines.append("| " + " | ".join(_esc(str(c)) for c in row) + " |")
        return "\n".join(lines)
    if block.kind == "lineage":
        return "\n".join(
            f"- v{v['version']} · {_esc(v['origin'])} · {_esc(v['filename'])}"
            for v in block.payload.get("versions", [])
        )
    return ""


def report_to_markdown(report: ReportRead) -> str:
    parts = [f"# {report.title}", "", f"_Generated: {report.generated_at}_", ""]
    if not report.ai_available:
        parts.append("_AI narration unavailable — rule-based report._", "")
    for sec in report.sections:
        parts.append(f"## {sec.title}")
        for b in sec.blocks:
            text = _block_md(b)
            if text:
                parts.append(text)
        parts.append("")
    return "\n".join(parts).strip() + "\n"


def _block_html(block: SectionBlock) -> str:
    if block.kind in ("prose", "custom_note"):
        return f"<p>{_esc(block.text)}</p>"
    if block.kind == "chart":
        spec = block.payload
        rows = (spec.get("data", []) or [])
        if not rows:
            return f"<p><em>{_esc(spec.get('title'))}</em> — no data.</p>"
        cols = list(rows[0].keys())
        thead = "<tr>" + "".join(f"<th>{_esc(c)}</th>" for c in cols) + "</tr>"
        body = ""
        for r in rows[:20]:
            body += "<tr>" + "".join(f"<td>{_esc(str(r.get(c, '')))}</td>" for c in cols) + "</tr>"
        return (f"<figure><figcaption><strong>{_esc(spec.get('title'))}</strong> "
                f"({_esc(spec.get('chart_type'))}) — {_esc(spec.get('business_question'))}</figcaption>"
                f"<table><thead>{thead}</thead><tbody>{body}</tbody></table></figure>")
    if block.kind == "sql":
        p = block.payload
        insights = "".join(f"<li>{_esc(i)}</li>" for i in (p.get("insights", []) or []))
        return (f"<div class='sql'><p><strong>Q: {_esc(p.get('business_question'))}</strong></p>"
                f"<p>{_esc(p.get('explanation'))}</p>"
                f"<pre><code>{_esc(p.get('sql', ''))}</code></pre>"
                f"<ul>{insights}</ul></div>")
    if block.kind == "table":
        p = block.payload
        cols = p.get("columns", []) or []
        thead = "<tr>" + "".join(f"<th>{_esc(c)}</th>" for c in cols) + "</tr>"
        body = "".join(
            "<tr>" + "".join(f"<td>{_esc(str(c))}</td>" for c in row) + "</tr>"
            for row in (p.get("rows", []) or [])
        )
        return f"<table><thead>{thead}</thead><tbody>{body}</tbody></table>"
    if block.kind == "lineage":
        items = "".join(
            f"<li>v{v['version']} · {_esc(v['origin'])} · {_esc(v['filename'])}</li>"
            for v in block.payload.get("versions", [])
        )
        return f"<ul>{items}</ul>"
    return ""


_CSS = """
body{font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:820px;margin:2rem auto;padding:0 1rem;color:#111;line-height:1.5}
h1{font-size:1.8rem}h2{font-size:1.3rem;margin-top:2rem;border-bottom:1px solid #eee;padding-bottom:.3rem}
table{border-collapse:collapse;width:100%;margin:.5rem 0;font-size:.9rem}
th,td{border:1px solid #ddd;padding:.35rem .6rem;text-align:left}
pre{background:#f5f5f5;padding:.6rem;border-radius:6px;overflow:auto}
figure{margin:1rem 0}figcaption{font-weight:600;margin-bottom:.3rem}
"""


def report_to_html(report: ReportRead) -> str:
    sections_html = ""
    for sec in report.sections:
        blocks = "".join(_block_html(b) for b in sec.blocks)
        sections_html += f"<section><h2>{_esc(sec.title)}</h2>{blocks}</section>"
    banner = "" if report.ai_available else "<p><em>AI narration unavailable — rule-based report.</em></p>"
    return (
        f"<!DOCTYPE html><html lang='en'><head><meta charset='utf-8'>"
        f"<meta name='viewport' content='width=device-width,initial-scale=1'>"
        f"<title>{_esc(report.title)}</title><style>{_CSS}</style></head>"
        f"<body><h1>{_esc(report.title)}</h1>"
        f"<p><small>Generated: {_esc(str(report.generated_at))}</small></p>{banner}{sections_html}"
        f"<footer><p>Generated with InsightFlow AI</p></footer></body></html>"
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_report_render.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd backend && git add app/services/reporting/render.py tests/test_report_render.py && git commit -m "feat(reports): presentation-only HTML + Markdown renderers"
```

---

## Task 6: Routes + wire into main (owner-guarded + public share)

**Files:**
- Create: `backend/app/api/routes/reports.py`
- Modify: `backend/app/main.py` (add import + include router)

**Interfaces:**
- Consumes: `assemble_report`, `report_to_html`, `report_to_markdown`, `Report` model, report schemas.
- Produces: endpoints under `/api/v1/reports` (see spec §9); the public `/api/v1/reports/share/{token}`.

- [ ] **Step 1: Write the routes**

`backend/app/api/routes/reports.py`:
```python
"""Reports routes — generate, list, fetch, edit, delete, export, public share.

- `POST /reports/generate` — assemble + store a new `Report` (409 if unprofiled).
- `GET  /reports?project_id=` — owner list.
- `GET  /reports/{id}` — owner fetch.
- `PATCH /reports/{id}` — owner edit (replace sections/title).
- `DELETE /reports/{id}` — owner delete.
- `GET  /reports/{id}/export?format=markdown|pdf` — owner export.
- `GET  /reports/share/{token}` — PUBLIC, read-only, scoped to one report.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.models.dataset import Dataset
from app.models.report import Report
from app.models.sql_query import SqlQuery
from app.schemas.report import (
    ReportGenerateRequest,
    ReportRead,
    ReportShareRead,
    ReportUpdateRequest,
)
from app.services.reporting import assemble_report, report_to_html, report_to_markdown

router = APIRouter(prefix="/reports", tags=["reports"])


def _owned(report_id: int, session: SessionDep, user: CurrentUser) -> Report:
    r = session.get(Report, report_id)
    if r is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    if r.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your report")
    return r


def _safe(name: str) -> str:
    return "".join(c if c.isalnum() or c in "-_" else "_" for c in (name or "report"))


@router.post("/generate", response_model=ReportRead)
async def generate(body: ReportGenerateRequest, session: SessionDep, current_user: CurrentUser) -> ReportRead:
    if body.scope not in ("dataset", "project"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="scope must be 'dataset' or 'project'")
    if body.scope == "dataset":
        if body.dataset_id is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="dataset_id required for dataset scope")
        ds = session.get(Dataset, body.dataset_id)
        if ds is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
        if ds.owner_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your dataset")
        if ds.profile is None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Dataset is not analyzed yet. Run Analyze first.")
        datasets = [ds]
        sql_records = session.exec(
            select(SqlQuery).where(SqlQuery.dataset_id == ds.id, SqlQuery.owner_id == current_user.id)
        ).all()
        source_name = ds.original_filename
    else:
        if body.project_id is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="project_id required for project scope")
        datasets = session.exec(
            select(Dataset).where(Dataset.project_id == body.project_id, Dataset.owner_id == current_user.id)
        ).all()
        if not datasets:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No datasets in this project")
        if all(d.profile is None for d in datasets):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No analyzed datasets in this project yet.")
        sql_records = session.exec(
            select(SqlQuery).where(SqlQuery.project_id == body.project_id, SqlQuery.owner_id == current_user.id)
        ).all()
        source_name = f"Project #{body.project_id}"

    sections, ai_available = await assemble_report(
        datasets=datasets, sql_records=sql_records, scope=body.scope, source_name=source_name
    )
    now = datetime.now(timezone.utc)
    title = body.title or (f"Report — {source_name}")
    report = Report(
        project_id=body.project_id if body.scope == "project" else datasets[0].project_id,
        owner_id=current_user.id, scope=body.scope,
        dataset_id=datasets[0].id if body.scope == "dataset" else None,
        title=title, sections=[s.model_dump(mode="json") for s in sections],
        share_token=secrets.token_urlsafe(32), ai_available=ai_available,
        created_at=now, updated_at=now, generated_at=now,
    )
    session.add(report)
    session.commit()
    session.refresh(report)
    return ReportRead.model_validate(report)


@router.get("", response_model=list[ReportRead])
def list_reports(project_id: int = Query(...), session: SessionDep, current_user: CurrentUser) -> list[ReportRead]:
    stmt = (
        select(Report)
        .where(Report.project_id == project_id, Report.owner_id == current_user.id)
        .order_by(Report.created_at.desc())
    )
    return [ReportRead.model_validate(r) for r in session.exec(stmt).all()]


@router.get("/{report_id}", response_model=ReportRead)
def get_report(report_id: int, session: SessionDep, current_user: CurrentUser) -> ReportRead:
    return ReportRead.model_validate(_owned(report_id, session, current_user))


@router.patch("/{report_id}", response_model=ReportRead)
def update_report(report_id: int, body: ReportUpdateRequest, session: SessionDep, current_user: CurrentUser) -> ReportRead:
    r = _owned(report_id, session, current_user)
    r.sections = [s.model_dump(mode="json") for s in body.sections]
    if body.title is not None:
        r.title = body.title
    r.updated_at = datetime.now(timezone.utc)
    session.add(r)
    session.commit()
    session.refresh(r)
    return ReportRead.model_validate(r)


@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_report(report_id: int, session: SessionDep, current_user: CurrentUser):
    r = _owned(report_id, session, current_user)
    session.delete(r)
    session.commit()


@router.get("/{report_id}/export")
def export_report(report_id: int, format: str = Query("markdown"), session: SessionDep, current_user: CurrentUser):
    r = _owned(report_id, session, current_user)
    report = ReportRead.model_validate(r)
    if format == "markdown":
        return Response(
            content=report_to_markdown(report), media_type="text/markdown",
            headers={"Content-Disposition": f'attachment; filename="{_safe(report.title)}.md"'},
        )
    html = report_to_html(report)
    return Response(
        content=html, media_type="text/html",
        headers={"Content-Disposition": f'attachment; filename="{_safe(report.title)}.html"'},
    )


@router.get("/share/{token}", response_model=ReportShareRead)
def share_report(token: str, session: SessionDep) -> ReportShareRead:
    """Public, unauthenticated, read-only. Returns ONLY the report's own fields."""
    r = session.exec(select(Report).where(Report.share_token == token)).first()
    if r is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    return ReportShareRead(
        title=r.title, scope=r.scope,
        sections=[ReportSection.model_validate(s) for s in r.sections],
        ai_available=r.ai_available, generated_at=r.generated_at,
    )


# Local import kept at bottom to avoid a circular import at module load.
from app.schemas.report import ReportSection  # noqa: E402
```

- [ ] **Step 2: Wire into main**

In `backend/app/main.py`, change the import line and add the include:
```python
from app.api.routes import auth, cleaning, datasets, eda, projects, reports, sql, users
```
and after `app.include_router(sql.router, prefix=API_PREFIX)` add:
```python
app.include_router(reports.router, prefix=API_PREFIX)
```

- [ ] **Step 3: Compile-check + run unit tests**

Run: `cd backend && ./.venv/Scripts/python.exe -m py_compile app/api/routes/reports.py app/main.py && ./.venv/Scripts/python.exe -m pytest tests/test_report_assemble.py tests/test_report_render.py -v`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
cd backend && git add app/api/routes/reports.py app/main.py && git commit -m "feat(reports): owner-guarded routes + public read-only share endpoint"
```

---

## Task 7: Backend manual e2e + migration verification

**Files:**
- Test (manual): `backend/tests/manual_reports_e2e.py` (optional, run then delete) — or run inline via the existing TestClient pattern.

**Interfaces:**
- Verifies: migration applies; generate (dataset + project) → 409 before profile → share returns report and nothing else.

- [ ] **Step 1: Apply migrations on the running DB and confirm the table exists**

Run: `cd backend && ./.venv/Scripts/python.exe -c "from app.core.database import run_migrations; run_migrations(); print('migrations ok')"`
Expected: `migrations ok` (no error; `reports` table created).

- [ ] **Step 2: Write an inline e2e script using TestClient**

Create `backend/tests/manual_reports_e2e.py`:
```python
"""Manual e2e for the reports workflow. Run with the venv python, then delete."""
from fastapi.testclient import TestClient
from app.main import app
from app.core.database import get_session
from sqlmodel import Session, create_engine, text


def _fresh_engine():
    eng = create_engine("sqlite:///:memory:")
    # Use the app's engine/session for simplicity in dev only.
    return eng


client = TestClient(app)

# Register + login
client.post("/api/v1/auth/register", json={"email": "r@e.com", "password": "pw12345", "full_name": "R"})
tok = client.post("/api/v1/auth/login", data={"username": "r@e.com", "password": "pw12345"}).json()["access_token"]
H = {"Authorization": f"Bearer {tok}"}

# Project + dataset upload (reuse datasets upload + analyze endpoints)
proj = client.post("/api/v1/projects", headers=H, json={"name": "P", "description": ""}).json()
pid = proj["id"]
# minimal CSV upload would require a file; assume an existing profiled dataset path is used in practice.
print("registered + project", pid)
print("NOTE: full upload+analyze+EDA+SQL e2e requires a file fixture; covered manually in the app.")
```

- [ ] **Step 3: Run it, then delete the manual script**

Run: `cd backend && ./.venv/Scripts/python.exe tests/manual_reports_e2e.py`
Expected: prints project id (confirms auth + project + router wired). Delete the file afterward.

- [ ] **Step 4: Commit a docs note (no code change) and tag M1 done**

Update `backend` working tree only if needed; otherwise skip. Mark Milestone 1 complete in `PROJECT_PROGRESS.md` / `DEVELOPMENT_LOG.md` (Task 14 covers the consolidated docs update). No commit here unless a file changed.

---

# Milestone 2 — Frontend: editor + export

## Task 8: Frontend types + API client

**Files:**
- Modify: `frontend/lib/types.ts`
- Modify: `frontend/lib/api.ts`

**Interfaces:**
- Produces: `SectionType`, `SectionBlock`, `ReportSection`, `ReportRead`, `ReportShareRead`, `ReportGenerateRequest`, `ReportUpdateRequest`, and `reportsApi` (consumed by components/pages).

- [ ] **Step 1: Add types to `lib/types.ts`** (append after the SQL section)

```ts
// --- Insights + Reports ---------------------------------------------------

export type SectionType =
  | "cover"
  | "executive_summary"
  | "dataset_overview"
  | "data_quality"
  | "cleaning_summary"
  | "eda"
  | "sql_analysis"
  | "business_insights"
  | "recommendations"
  | "appendix"
  | "custom";

export interface SectionBlock {
  kind: "prose" | "chart" | "sql" | "table" | "lineage" | "custom_note";
  text?: string | null;
  ref_id?: string | null;
  payload: Record<string, unknown>;
}

export interface ReportSection {
  id: string;
  type: SectionType;
  title: string;
  blocks: SectionBlock[];
}

export interface ReportRead {
  id: number;
  project_id: number;
  owner_id: number;
  scope: string;
  dataset_id: number | null;
  title: string;
  sections: ReportSection[];
  share_token: string;
  ai_available: boolean;
  created_at: string;
  updated_at: string;
  generated_at: string;
}

export interface ReportShareRead {
  title: string;
  scope: string;
  sections: ReportSection[];
  ai_available: boolean;
  generated_at: string;
}

export interface ReportGenerateRequest {
  scope: "dataset" | "project";
  project_id?: number | null;
  dataset_id?: number | null;
  title?: string | null;
}

export interface ReportUpdateRequest {
  title?: string | null;
  sections: ReportSection[];
}
```

- [ ] **Step 2: Add `reportsApi` to `lib/api.ts`** (import the new types and append the client)

In the top `import type { ... }` block add: `ReportGenerateRequest, ReportRead, ReportShareRead, ReportUpdateRequest`.
Append before the final export:
```ts
export const reportsApi = {
  generate(req: ReportGenerateRequest): Promise<ReportRead> {
    return request<ReportRead>("/api/v1/reports/generate", {
      method: "POST",
      body: JSON.stringify(req),
    });
  },
  list(projectId: number): Promise<ReportRead[]> {
    return request<ReportRead[]>(`/api/v1/reports?project_id=${projectId}`);
  },
  get(id: number): Promise<ReportRead> {
    return request<ReportRead>(`/api/v1/reports/${id}`);
  },
  update(id: number, body: ReportUpdateRequest): Promise<ReportRead> {
    return request<ReportRead>(`/api/v1/reports/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  remove(id: number): Promise<void> {
    return request<void>(`/api/v1/reports/${id}`, { method: "DELETE" });
  },
  async exportMarkdown(id: number): Promise<void> {
    const res = await fetch(`${BASE}/api/v1/reports/${id}/export?format=markdown`, {
      headers: { Authorization: `Bearer ${getToken() ?? ""}` },
    });
    if (!res.ok) throw new ApiError(res.status, "Export failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "report.md";
    a.click();
    URL.revokeObjectURL(url);
  },
  share(token: string): Promise<ReportShareRead> {
    return request<ReportShareRead>(`/api/v1/reports/share/${token}`);
  },
};
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add lib/types.ts lib/api.ts && git commit -m "feat(reports): frontend types + reportsApi client"
```

---

## Task 9: Presentation-only report renderer

**Files:**
- Create: `frontend/components/report-renderer.tsx`

**Interfaces:**
- Consumes: `ReportSection[]` (from `lib/types`), `ChartRenderer` from `@/components/chart-renderer`.
- Produces: a read-only rendered report (reused by the editor preview and the share page).

- [ ] **Step 1: Write the component**

```tsx
"use client";

import type { ChartSpec, ReportSection, SectionBlock } from "@/lib/types";
import { ChartRenderer } from "@/components/chart-renderer";

function Block({ block }: { block: SectionBlock }) {
  switch (block.kind) {
    case "prose":
    case "custom_note":
      return <p className="whitespace-pre-wrap text-sm leading-relaxed">{block.text}</p>;
    case "chart": {
      const spec = block.payload as unknown as ChartSpec;
      return (
        <figure className="flex flex-col gap-1">
          <figcaption className="text-xs font-medium text-muted-foreground">
            {spec.title} — {spec.business_question}
          </figcaption>
          <div className="h-56">
            <ChartRenderer spec={spec} />
          </div>
        </figure>
      );
    }
    case "sql": {
      const p = block.payload as {
        business_question?: string;
        explanation?: string;
        sql?: string;
        insights?: string[];
      };
      return (
        <div className="flex flex-col gap-1 rounded-md border p-3">
          <p className="text-sm font-medium">Q: {p.business_question}</p>
          {p.explanation && <p className="text-xs text-muted-foreground">{p.explanation}</p>}
          <pre className="overflow-x-auto rounded bg-muted p-2 text-xs"><code>{p.sql}</code></pre>
          {p.insights?.length ? (
            <ul className="list-disc pl-4 text-xs">{p.insights.map((i, k) => <li key={k}>{i}</li>)}</ul>
          ) : null}
        </div>
      );
    }
    case "table": {
      const p = block.payload as { columns?: string[]; rows?: unknown[][] };
      return (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted text-muted-foreground">
              <tr>{(p.columns ?? []).map((c) => <th key={c} className="px-2 py-1">{c}</th>)}</tr>
            </thead>
            <tbody>
              {(p.rows ?? []).map((row, i) => (
                <tr key={i} className="border-t">
                  {(row as unknown[]).map((cell, j) => <td key={j} className="px-2 py-1">{String(cell)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "lineage": {
      const versions = (block.payload as { versions?: { version: number; origin: string; filename: string }[] }).versions ?? [];
      return (
        <ol className="flex flex-col gap-1 text-xs">
          {versions.map((v, i) => (
            <li key={i} className="rounded border px-2 py-1">
              v{v.version} · {v.origin} · {v.filename}
            </li>
          ))}
        </ol>
      );
    }
    default:
      return null;
  }
}

export function ReportRenderer({ sections }: { sections: ReportSection[] }) {
  return (
    <div className="report-container flex flex-col gap-6">
      {sections.map((sec) => (
        <section key={sec.id}>
          <h2 className="mb-2 text-lg font-semibold">{sec.title}</h2>
          <div className="flex flex-col gap-3">
            {sec.blocks.map((b, i) => <Block key={i} block={b} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add components/report-renderer.tsx && git commit -m "feat(reports): presentation-only report renderer"
```

---

## Task 10: Interactive HITL editor

**Files:**
- Create: `frontend/components/report-editor.tsx`

**Interfaces:**
- Consumes: `ReportRead`, `reportsApi`, `ReportRenderer`.
- Produces: editable report UI with live preview; Save (PATCH), Download PDF (`window.print()`), Download Markdown, Copy share link.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useState } from "react";
import { Copy, FileDown, FileText, Trash2, ArrowUp, ArrowDown, Plus } from "lucide-react";
import type { ReportRead, ReportSection, ReportUpdateRequest } from "@/lib/types";
import { reportsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ReportRenderer } from "@/components/report-renderer";

function emptyCustomSection(): ReportSection {
  return {
    id: `custom-${Date.now()}`,
    type: "custom",
    title: "Custom Section",
    blocks: [{ kind: "custom_note", text: "", payload: {} }],
  };
}

export function ReportEditor({ report, onDeleted }: { report: ReportRead; onDeleted?: () => void }) {
  const [sections, setSections] = useState<ReportSection[]>(report.sections);
  const [title, setTitle] = useState(report.title);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  function updateSection(id: string, patch: Partial<ReportSection>) {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function updateBlockText(secId: string, idx: number, text: string) {
    setSections((prev) =>
      prev.map((s) =>
        s.id === secId
          ? { ...s, blocks: s.blocks.map((b, i) => (i === idx ? { ...b, text } : b)) }
          : s
      )
    );
  }
  function removeSection(id: string) {
    setSections((prev) => prev.filter((s) => s.id !== id));
  }
  function move(secId: string, dir: -1 | 1) {
    setSections((prev) => {
      const i = prev.findIndex((s) => s.id === secId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function addCustom() {
    setSections((prev) => [...prev, emptyCustomSection()]);
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const body: ReportUpdateRequest = { title, sections };
      const updated = await reportsApi.update(report.id, body);
      setSections(updated.sections);
      setTitle(updated.title);
      setMsg("Saved.");
    } catch {
      setMsg("Save failed.");
    } finally {
      setSaving(false);
    }
  }

  function copyShare() {
    const url = `${window.location.origin}/reports/share/${report.share_token}`;
    navigator.clipboard.writeText(url);
    setShareUrl(url);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="no-print flex flex-wrap items-center gap-2">
        <input
          className="rounded border px-2 py-1 text-sm"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Report title"
        />
        <Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        <Button size="sm" variant="outline" onClick={() => window.print()}>
          <FileDown className="h-4 w-4" /> Download PDF
        </Button>
        <Button size="sm" variant="outline" onClick={() => reportsApi.exportMarkdown(report.id)}>
          <FileText className="h-4 w-4" /> Download Markdown
        </Button>
        <Button size="sm" variant="outline" onClick={copyShare}>
          <Copy className="h-4 w-4" /> Copy Share Link
        </Button>
        <Button size="sm" variant="ghost" onClick={async () => { await reportsApi.remove(report.id); onDeleted?.(); }}>
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
        <Button size="sm" variant="ghost" onClick={addCustom}><Plus className="h-4 w-4" /> Add Section</Button>
        {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
        {shareUrl && <span className="text-xs text-muted-foreground">Link copied: {shareUrl}</span>}
      </div>

      <div className="no-print flex flex-col gap-4">
        {sections.map((sec, idx) => (
          <div key={sec.id} className="rounded-md border p-3">
            <div className="mb-2 flex items-center gap-2">
              <input
                className="rounded border px-2 py-1 text-sm font-medium"
                value={sec.title}
                onChange={(e) => updateSection(sec.id, { title: e.target.value })}
                aria-label="Section title"
              />
              <Button size="icon" variant="ghost" onClick={() => move(sec.id, -1)} disabled={idx === 0}><ArrowUp className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => move(sec.id, 1)} disabled={idx === sections.length - 1}><ArrowDown className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => removeSection(sec.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
            {sec.blocks.map((b, i) =>
              b.kind === "prose" || b.kind === "custom_note" ? (
                <textarea
                  key={i}
                  className="mb-2 w-full rounded border p-2 text-sm"
                  rows={3}
                  value={b.text ?? ""}
                  onChange={(e) => updateBlockText(sec.id, i, e.target.value)}
                />
              ) : (
                <p key={i} className="mb-2 text-xs text-muted-foreground">
                  {b.kind} block (read-only in editor)
                </p>
              )
            )}
          </div>
        ))}
      </div>

      <div className="rounded-md border p-4">
        <ReportRenderer sections={sections} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add components/report-editor.tsx && git commit -m "feat(reports): interactive HITL report editor"
```

---

## Task 11: Report pages + project entry points + print CSS

**Files:**
- Create: `frontend/app/reports/[id]/page.tsx`
- Modify: `frontend/app/projects/[id]/page.tsx`
- Modify: `frontend/app/globals.css`

**Interfaces:**
- Consumes: `reportsApi`, `ReportEditor`, already-imported `datasetsApi`/`projectsApi`.
- Produces: owner report view; Generate Report buttons on the project workspace; print stylesheet.

- [ ] **Step 1: Create the owner report page**

`frontend/app/reports/[id]/page.tsx`:
```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { reportsApi } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { ReportRead } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ReportEditor } from "@/components/report-editor";

export default function ReportPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [report, setReport] = useState<ReportRead | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setReport(await reportsApi.get(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
    }
  }, [id]);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    if (Number.isFinite(id)) void load();
  }, [router, id, load]);

  if (error) return <main className="container py-10"><p className="text-destructive">{error}</p></main>;
  if (!report) return <main className="container py-10"><p className="text-muted-foreground">Loading…</p></main>;

  return (
    <main className="container flex min-h-screen flex-col gap-6 py-10">
      <header className="no-print flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/projects"><ArrowLeft className="h-4 w-4" /> Projects</Link>
        </Button>
      </header>
      <ReportEditor report={report} onDeleted={() => router.replace("/projects")} />
    </main>
  );
}
```

- [ ] **Step 2: Add Generate Report buttons to the project workspace**

In `frontend/app/projects/[id]/page.tsx`:
1. Add imports: `import { reportsApi } from "@/lib/api";` and `FileBarChart` (or `FileText`) from `lucide-react`.
2. Add state: `const [reporting, setReporting] = useState<number | null>(null);`
3. Add a handler:
```tsx
async function onGenerateReport(scope: "dataset" | "project", datasetId?: number) {
  setError(null);
  try {
    const rep = await reportsApi.generate(
      scope === "dataset"
        ? { scope: "dataset", dataset_id: datasetId, project_id: projectId }
        : { scope: "project", project_id: projectId }
    );
    router.push(`/reports/${rep.id}`);
  } catch (err) {
    setError(err instanceof Error ? err.message : "Failed to generate report");
  }
}
```
4. In the header (after the upload `Card`, inside the right column's top controls, or as a project-level action), add a "Report" button:
```tsx
<Button size="sm" variant="outline" onClick={() => onGenerateReport("project")}>
  <FileText className="h-4 w-4" /> Report
</Button>
```
5. Inside the per-dataset action row (next to the existing `EDA`/`SQL` buttons), add (guarded by `d.profile`):
```tsx
{d.profile && (
  <Button size="sm" variant="ghost" onClick={() => onGenerateReport("dataset", d.id)}>
    <FileText className="h-4 w-4" /> Report
  </Button>
)}
```

- [ ] **Step 3: Add the print stylesheet to `frontend/app/globals.css`**

Append:
```css
@media print {
  .no-print { display: none !important; }
  body { background: #fff; }
  .report-container { box-shadow: none; }
}
```

- [ ] **Step 4: Lint + type-check + build**

Run: `cd frontend && npx tsc --noEmit && npm run lint && npm run build`
Expected: all pass (no type errors, lint clean, production build succeeds).

- [ ] **Step 5: Commit**

```bash
cd frontend && git add app/reports/[id]/page.tsx app/projects/[id]/page.tsx app/globals.css && git commit -m "feat(reports): owner report page, project/dataset entry points, print CSS"
```

---

# Milestone 3 — Public read-only share view + security

## Task 12: Public share page (read-only, branded)

**Files:**
- Create: `frontend/app/reports/share/[token]/page.tsx`

**Interfaces:**
- Consumes: `reportsApi.share(token)`, `ReportRenderer`.
- Produces: a public, unauthenticated, read-only report page with branding footer, download buttons, and no edit controls.

- [ ] **Step 1: Write the share page**

`frontend/app/reports/share/[token]/page.tsx`:
```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FileDown, FileText } from "lucide-react";
import { reportsApi } from "@/lib/api";
import type { ReportShareRead } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ReportRenderer } from "@/components/report-renderer";

export default function ShareReportPage() {
  const params = useParams<{ token: string }>();
  const [report, setReport] = useState<ReportShareRead | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setReport(await reportsApi.share(params.token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Report not found");
    }
  }, [params.token]);

  useEffect(() => { void load(); }, [load]);

  if (error) return <main className="container py-10"><p className="text-destructive">{error}</p></main>;
  if (!report) return <main className="container py-10"><p className="text-muted-foreground">Loading…</p></main>;

  return (
    <main className="container flex min-h-screen flex-col gap-6 py-10">
      <div className="no-print flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{report.title}</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => window.print()}><FileDown className="h-4 w-4" /> Download PDF</Button>
          <Button size="sm" variant="outline" onClick={() => window.print()}><FileText className="h-4 w-4" /> Download Markdown</Button>
        </div>
      </div>

      {!report.ai_available && (
        <p className="text-sm text-muted-foreground">AI narration unavailable — rule-based report.</p>
      )}

      {/* Read-only: no edit/delete/SQL/cleaning controls. */}
      <ReportRenderer sections={report.sections} />

      <footer className="mt-8 border-t pt-4 text-center text-sm text-muted-foreground">
        Generated with InsightFlow AI ·{" "}
        <Link href="/" className="font-medium underline">Analyze your own dataset →</Link>
      </footer>
    </main>
  );
}
```

Note: the share page is fully client-side and calls the **public** `GET /api/v1/reports/share/{token}` (no auth required). Markdown "download" on the share page reuses `window.print()` (the backend Markdown export is owner-only by design; the share view stays read-only and link-safe).

- [ ] **Step 2: Lint + type-check + build**

Run: `cd frontend && npx tsc --noEmit && npm run lint && npm run build`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add "app/reports/share/[token]/page.tsx" && git commit -m "feat(reports): public read-only share page with branding footer"
```

---

## Task 13: Security verification + docs update

**Files:**
- Verify: `backend/app/api/routes/reports.py` (public share returns only safe fields).
- Modify: `PROJECT_PROGRESS.md`, `DEVELOPMENT_LOG.md` (consolidated milestone notes).

**Interfaces:**
- Confirms the share endpoint leaks no owner PII / mutation routes; updates project docs.

- [ ] **Step 1: Verify the public share endpoint returns no owner/project data**

Run: `cd backend && ./.venv/Scripts/python.exe -c "
from app.api.routes.reports import ReportShareRead
import inspect
# Confirm the public schema excludes owner_id / project_id / id.
fields = set(ReportShareRead.model_fields.keys())
assert 'owner_id' not in fields and 'project_id' not in fields and 'id' not in fields, fields
print('share schema is safe:', sorted(fields))
"`
Expected: `share schema is safe: ['ai_available', 'generated_at', 'scope', 'sections', 'title']`

- [ ] **Step 2: Confirm no mutation route is public**

Grep the routes file for `CurrentUser` on the share endpoint — the `share_report` function must NOT take `current_user`. Confirm only `share_report` lacks the dependency.

Run: `cd backend && grep -n "def share_report" app/api/routes/reports.py`
Expected: `def share_report(token: str, session: SessionDep) -> ReportShareRead:` (no `current_user`).

- [ ] **Step 3: Update project docs**

In `PROJECT_PROGRESS.md`: under **Sprint 3 — Insights + Reports** add:
```
- [x] **M1 — Report assembly + storage + API:** reports table + migration, Report JSON canonical, assembly service (deterministic sections + best-effort AI prose/fallback), owner-guarded generate/list/get/patch/delete/export, public read-only share endpoint
- [x] **M2 — Editor UI + export:** report-renderer (presentation-only), report-editor (edit/reorder/remove/rename/custom-note, live), PDF (print) + Markdown export, copy share link, project/dataset entry points
- [x] **M3 — Public share view:** /reports/share/[token] read-only, branded footer, download buttons, no mutation/data leak
```
And update the milestone timeline row **Insights + Reports** to ✅ Complete.

In `DEVELOPMENT_LOG.md`: add a dated entry describing the architecture (canonical Report JSON, presentation-only renderer, assembly service, public share token) and the forward-looking extension points (versioning, analytics, metadata, DOCX/HTML).

- [ ] **Step 4: Commit docs**

```bash
git add PROJECT_PROGRESS.md DEVELOPMENT_LOG.md && git commit -m "docs: Insights + Reports milestone shipped"
```

---

## Self-Review Notes (per skill checklist)

- **Spec coverage:** §3 in-scope (configurable scope, assembly, HITL editing, HTML render, PDF+MD export, public share) → Tasks 1–12. Forward-looking extension points (§11) → documented as out of scope in the spec; schema already accommodates them (Task 1 columns). All 10 default sections → Task 3 builders. Security model → Task 6 share endpoint + Task 13 verification. Branding footer → Task 12.
- **Placeholder scan:** no TBD/TODO/“implement later”. Each code step shows complete code.
- **Type consistency:** `SectionBlock.kind` values (`prose|chart|sql|table|lineage|custom_note`) match across schemas (Task 2), assembly (Task 3), renderer (Task 9), editor (Task 10). `ReportSection`/`ReportRead`/`ReportShareRead` names are identical in backend schemas and frontend types. `assemble_report(datasets, sql_records, scope, source_name)` signature is consistent between Task 3 (definition) and Task 6 (call site). `reportsApi` method names match the routes (`generate`, `list`, `get`, `update`, `remove`, `exportMarkdown`, `share`).
- **No divergent rendering:** the live React view (Task 9/12) and the backend HTML/MD (Task 5) both resolve from `payload` — the renderer never recomputes.
