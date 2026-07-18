"""Project / workspace routes — CRUD scoped to the authenticated owner."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.core.storage import get_storage
from app.db import Repository
from app.models.dashboard import Dashboard
from app.models.dataset import Dataset
from app.models.notebook import Notebook
from app.models.project import Project
from app.models.report import Report
from app.models.sql_query import SqlQuery
from app.schemas.project import ProjectCreate, ProjectRead, ProjectUpdate

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectRead])
def list_projects(
    session: SessionDep,
    current_user: CurrentUser,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[Project]:
    stmt = (
        select(Project)
        .where(Project.owner_id == current_user.id)
        .order_by(Project.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return list(session.exec(stmt).all())


@router.post("", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreate, session: SessionDep, current_user: CurrentUser) -> Project:
    project = Project(owner_id=current_user.id, name=payload.name, description=payload.description)
    return Repository(Project, session).create(project)


@router.get("/{project_id}", response_model=ProjectRead)
def read_project(project_id: int, session: SessionDep, current_user: CurrentUser) -> Project:
    project = Repository(Project, session).get_by_id(project_id)
    _ensure_owner(project, current_user)
    return project


@router.patch("/{project_id}", response_model=ProjectRead)
def update_project(
    project_id: int,
    payload: ProjectUpdate,
    session: SessionDep,
    current_user: CurrentUser,
) -> Project:
    repo = Repository(Project, session)
    project = repo.get_by_id(project_id)
    _ensure_owner(project, current_user)
    changes = payload.model_dump(exclude_unset=True)
    return repo.update(project, **changes)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: int, session: SessionDep, current_user: CurrentUser):
    repo = Repository(Project, session)
    project = repo.get_by_id(project_id)
    _ensure_owner(project, current_user)

    # Collect every dataset (uploads + derived versions) for storage cleanup.
    datasets = list(
        session.exec(select(Dataset).where(Dataset.project_id == project.id)).all()
    )

    # Delete dependent artifacts first — their FKs to projects.id / datasets.id
    # are RESTRICT, so the referenced rows must go before the project/datasets.
    for model in (Report, Dashboard, Notebook, SqlQuery):
        for obj in session.exec(select(model).where(model.project_id == project.id)).all():
            session.delete(obj)

    # Delete datasets highest-version-first so the self-referential
    # parent_id/root_id FKs never block a delete.
    for ds in sorted(datasets, key=lambda d: d.version or 0, reverse=True):
        session.delete(ds)

    session.delete(project)
    session.commit()

    # Best-effort storage cleanup AFTER a successful commit. A leftover file is
    # recoverable; an orphaned DB row pointing at a missing file is not, so files
    # are removed last.
    storage = get_storage()
    for ds in datasets:
        try:
            storage.delete(ds.storage_path)
        except Exception:
            pass


def _ensure_owner(project: Project | None, current_user: CurrentUser) -> None:
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if project.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your project")
