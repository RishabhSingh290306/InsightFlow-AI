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
    ReportSection,
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
def list_reports(session: SessionDep, current_user: CurrentUser, project_id: int = Query(...)) -> list[ReportRead]:
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
def export_report(report_id: int, session: SessionDep, current_user: CurrentUser, format: str = Query("markdown")):
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
