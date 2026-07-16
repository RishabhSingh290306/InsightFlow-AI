"""Project / workspace routes — CRUD scoped to the authenticated owner."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.db import Repository
from app.models.project import Project
from app.schemas.project import ProjectCreate, ProjectRead, ProjectUpdate

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectRead])
def list_projects(session: SessionDep, current_user: CurrentUser) -> list[Project]:
    stmt = select(Project).where(Project.owner_id == current_user.id)
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
    repo.delete(project)


def _ensure_owner(project: Project | None, current_user: CurrentUser) -> None:
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if project.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your project")
