"""Dashboards routes (M1/M2: ephemeral preview, both scopes).

- `POST /preview` — build the deterministic catalog for a dataset or project,
  run the best-effort AI proposer, and return a resolved `DashboardView`.
  Nothing is persisted (persistence + HITL editing land in M3).
  - dataset scope: 409 if the dataset is unprofiled; 404 unknown; 403 not owner.
  - project scope: aggregates the project's artifacts; 404 unknown project;
    403 not owner.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUser, SessionDep
from app.models.dataset import Dataset
from app.models.project import Project
from app.schemas.dashboard import DashboardPreviewRequest, DashboardView
from app.services.dashboard.engine import assemble_context, render
from app.services.dashboard.proposer import propose_dashboard
from app.services.dashboard.widgets.catalog import build_catalog

router = APIRouter(prefix="/dashboards", tags=["dashboards"])


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

    # dataset scope (default)
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
