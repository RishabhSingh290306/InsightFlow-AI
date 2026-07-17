"""Dashboards routes (M3: persisted CRUD + ephemeral preview, both scopes).

- `POST /generate` — assemble + store a new `Dashboard` (initial spec via
  `propose_dashboard`, or deterministic fallback). 409 if unprofiled.
- `GET  /list?project_id=` — owner list.
- `GET  /{id}` — owner fetch **plus** the live-resolved `DashboardView`.
- `PATCH /{id}` — owner HITL edits (widget_order, hidden, groups, notes, title).
- `POST /{id}/regenerate` — re-run `propose_dashboard` on the live catalog.
- `DELETE /{id}` — owner delete.
- `POST /preview` — ephemeral `DashboardView` (no persistence; kept from M1/M2).

All deterministic-first; the AI proposer is best-effort so no route 5xxes on
LLM failure. Owner-guarded throughout.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.models.dashboard import Dashboard
from app.models.dataset import Dataset
from app.models.project import Project
from app.schemas.dashboard import (
    DashboardDetailRead,
    DashboardGenerateRequest,
    DashboardPatchRequest,
    DashboardPreviewRequest,
    DashboardRead,
    DashboardSpec,
    DashboardView,
)
from app.services.dashboard.engine import assemble_context, render, render_dashboard, resolve_context
from app.services.dashboard.proposer import propose_dashboard
from app.services.dashboard.widgets.catalog import build_catalog

router = APIRouter(prefix="/dashboards", tags=["dashboards"])


def _owned(dashboard_id: int, session: SessionDep, user: CurrentUser) -> Dashboard:
    d = session.get(Dashboard, dashboard_id)
    if d is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dashboard not found")
    if d.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your dashboard")
    return d


def _resolve_context_for_scope(body, session, user):
    """Validate scope inputs and build the request context (dataset or project)."""
    if body.scope == "project":
        if body.project_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="project_id required for project scope",
            )
        project = session.get(Project, body.project_id)
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        if project.owner_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your project")
        datasets = session.exec(
            select(Dataset).where(Dataset.project_id == project.id, Dataset.owner_id == user.id)
        ).all()
        if not datasets:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No datasets in this project")
        if all(d.profile is None for d in datasets):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="No analyzed datasets in this project yet.",
            )
        return assemble_context(session, project, user, scope="project"), project, None
    # dataset scope
    if body.dataset_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="dataset_id required for dataset scope",
        )
    dataset = session.get(Dataset, body.dataset_id)
    if dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    if dataset.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your dataset")
    if dataset.profile is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Dataset is not analyzed yet. Run Analyze first.",
        )
    project = session.get(Project, dataset.project_id)
    return assemble_context(session, project, user, scope="dataset", dataset=dataset), project, dataset


@router.post("/generate", response_model=DashboardRead)
async def generate(body: DashboardGenerateRequest, session: SessionDep, current_user: CurrentUser) -> DashboardRead:
    if body.scope not in ("dataset", "project"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="scope must be 'dataset' or 'project'",
        )
    ctx, project, dataset = _resolve_context_for_scope(body, session, current_user)
    catalog = build_catalog(ctx)
    spec, ai_available = await propose_dashboard(catalog, ctx)
    now = datetime.now(timezone.utc)
    title = body.title or (
        f"Dashboard — {dataset.original_filename}" if dataset else f"Dashboard — Project #{project.id}"
    )
    dashboard = Dashboard(
        project_id=project.id,
        owner_id=current_user.id,
        scope=body.scope,
        dataset_id=dataset.id if dataset else None,
        dataset_version_id=dataset.id if dataset else None,
        title=title,
        spec=spec.model_dump(mode="json"),
        ai_available=ai_available,
        refreshed_at=now,
        created_at=now,
        updated_at=now,
    )
    session.add(dashboard)
    session.commit()
    session.refresh(dashboard)
    return dashboard


@router.get("/list", response_model=list[DashboardRead])
def list_dashboards(session: SessionDep, current_user: CurrentUser, project_id: int = Query(...)) -> list[DashboardRead]:
    stmt = (
        select(Dashboard)
        .where(Dashboard.project_id == project_id, Dashboard.owner_id == current_user.id)
        .order_by(Dashboard.created_at.desc())
    )
    return list(session.exec(stmt).all())


@router.get("/{dashboard_id}", response_model=DashboardDetailRead)
def get_dashboard(dashboard_id: int, session: SessionDep, current_user: CurrentUser) -> DashboardDetailRead:
    d = _owned(dashboard_id, session, current_user)
    view = render_dashboard(d, session, current_user)
    return DashboardDetailRead(view=view, **d.model_dump())


@router.patch("/{dashboard_id}", response_model=DashboardRead)
def update_dashboard(
    dashboard_id: int, body: DashboardPatchRequest, session: SessionDep, current_user: CurrentUser
) -> DashboardRead:
    d = _owned(dashboard_id, session, current_user)
    spec = DashboardSpec.model_validate(d.spec)
    if body.title is not None:
        d.title = body.title
    if body.widget_order is not None:
        spec.widget_order = body.widget_order
    if body.hidden_widgets is not None:
        spec.hidden_widgets = body.hidden_widgets
    if body.groups is not None:
        spec.groups = body.groups
    if body.ai_summary is not None:
        spec.ai_summary = body.ai_summary
    if body.user_notes is not None:
        spec.user_notes = body.user_notes
    d.spec = spec.model_dump(mode="json")
    d.updated_at = datetime.now(timezone.utc)
    session.add(d)
    session.commit()
    session.refresh(d)
    return d


@router.post("/{dashboard_id}/regenerate", response_model=DashboardRead)
async def regenerate(dashboard_id: int, session: SessionDep, current_user: CurrentUser) -> DashboardRead:
    d = _owned(dashboard_id, session, current_user)
    ctx = resolve_context(session, d, current_user)
    catalog = build_catalog(ctx)
    new_spec, ai_available = await propose_dashboard(catalog, ctx)
    # Preserve the human's explicit choices (hidden widgets + notes); re-curate order/groups/summary.
    old = DashboardSpec.model_validate(d.spec)
    new_spec.hidden_widgets = old.hidden_widgets
    new_spec.user_notes = old.user_notes
    d.spec = new_spec.model_dump(mode="json")
    d.ai_available = ai_available
    d.refreshed_at = datetime.now(timezone.utc)
    d.updated_at = datetime.now(timezone.utc)
    session.add(d)
    session.commit()
    session.refresh(d)
    return d


@router.delete("/{dashboard_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dashboard(dashboard_id: int, session: SessionDep, current_user: CurrentUser):
    d = _owned(dashboard_id, session, current_user)
    session.delete(d)
    session.commit()


@router.post("/preview", response_model=DashboardView)
async def preview_dashboard(
    body: DashboardPreviewRequest, session: SessionDep, current_user: CurrentUser
) -> DashboardView:
    if body.scope == "project":
        if body.project_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="project_id is required for project scope.",
            )
        project = session.get(Project, body.project_id)
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        if project.owner_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your project")
        ctx = assemble_context(session, project, current_user, scope="project")
        catalog = build_catalog(ctx)
        spec, ai_available = await propose_dashboard(catalog, ctx)
        return render(spec, ctx, ai_available=ai_available)

    if body.scope != "dataset":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unknown scope: {body.scope}",
        )
    if body.dataset_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="dataset_id is required for dataset scope.",
        )
    dataset = session.get(Dataset, body.dataset_id)
    if dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    if dataset.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your dataset")
    if dataset.profile is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Dataset is not analyzed yet. Run Analyze first.",
        )
    project = session.get(Project, dataset.project_id)
    ctx = assemble_context(session, project, current_user, scope="dataset", dataset=dataset)
    catalog = build_catalog(ctx)
    spec, ai_available = await propose_dashboard(catalog, ctx)
    return render(spec, ctx, ai_available=ai_available)
