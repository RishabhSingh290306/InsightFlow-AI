"""Dataset routes — upload, list, read, and delete within a project.

Uploads are validated, stored via the storage adapter (`app/core/storage.py`),
profiled with pandas for row/column counts, and recorded as a `Dataset` row. Each
upload is versioned within its `(project_id, name_stem)` group.
"""
from __future__ import annotations

import io

import pandas as pd
from fastapi import APIRouter, File, HTTPException, Query, status, UploadFile
from sqlmodel import select
from sqlalchemy.exc import IntegrityError

from app.api.deps import CurrentUser, SessionDep
from app.core.config import settings
from app.core.storage import get_storage
from app.db import Repository
from app.models.dashboard import Dashboard
from app.models.dataset import Dataset
from app.models.notebook import Notebook
from app.models.project import Project
from app.models.report import Report
from app.models.sql_query import SqlQuery
from app.schemas.dataset import DatasetRead
from app.services.dataset_profiling import profile_dataset
from app.services.dataset_understanding import understand_dataset

router = APIRouter(prefix="/datasets", tags=["datasets"])

_ALLOWED_EXTENSIONS = {".csv": "csv", ".xlsx": "xlsx", ".xls": "xls"}


def _ensure_project_owner(project_id: int, session: SessionDep, user: CurrentUser) -> Project:
    project = session.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if project.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your project")
    return project


def _get_owned(dataset_id: int, session: SessionDep, user: CurrentUser) -> Dataset:
    dataset = session.get(Dataset, dataset_id)
    if dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    if dataset.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your dataset")
    return dataset


def _shape_from_bytes(content: bytes, file_format: str) -> tuple[int | None, int | None]:
    """Return (rows, cols) for the supported formats, else (None, None)."""
    try:
        if file_format == "csv":
            df = pd.read_csv(io.BytesIO(content))
        else:  # xlsx / xls
            df = pd.read_excel(io.BytesIO(content))
    except Exception:
        return None, None
    return int(df.shape[0]), int(df.shape[1])


@router.post(
    "/projects/{project_id}",
    response_model=DatasetRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_dataset(
    project_id: int,
    file: UploadFile = File(...),
    session: SessionDep = None,  # type: ignore[assignment]  (injected by FastAPI)
    current_user: CurrentUser = None,  # type: ignore[assignment]
) -> Dataset:
    _ensure_project_owner(project_id, session, current_user)

    original = file.filename or "dataset"
    ext = "." + original.rsplit(".", 1)[-1].lower() if "." in original else ""
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported file type. Upload a CSV or Excel (.xlsx/.xls) file.",
        )

    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    # Reject oversized uploads *before* materializing the whole file in memory.
    # `file.size` reflects the part's Content-Length when the client sends one
    # (the normal case, including attack tooling), so this caps RAM up front.
    # A defensive re-check after the read covers clients that omit the header.
    if file.size is not None and file.size > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds the {settings.MAX_UPLOAD_MB} MB limit.",
        )
    content = await file.read()
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds the {settings.MAX_UPLOAD_MB} MB limit.",
        )

    storage = get_storage()
    storage_path, filename = storage.save(project_id, original, content)

    file_format = _ALLOWED_EXTENSIONS[ext]
    rows, cols = _shape_from_bytes(content, file_format)

    name_stem = original.rsplit(".", 1)[0] or original
    existing = session.exec(
        select(Dataset).where(
            Dataset.project_id == project_id, Dataset.name_stem == name_stem
        )
    ).all()
    version = max((d.version for d in existing), default=0) + 1

    dataset = Dataset(
        project_id=project_id,
        owner_id=current_user.id,
        filename=filename,
        original_filename=original,
        name_stem=name_stem,
        storage_path=storage_path,
        file_size=len(content),
        mime_type=file.content_type or "",
        file_format=file_format,
        row_count=rows,
        column_count=cols,
        version=version,
    )
    try:
        created = Repository(Dataset, session).create(dataset)
        # The upload is the root of its own lineage: root_id points at itself,
        # parent_id stays NULL. Set atomically in the same transaction so a
        # partially-written row (root_id=NULL) can never be observed.
        created.root_id = created.id
        session.add(created)
        session.commit()
        session.refresh(created)
    except IntegrityError:
        # Concurrent re-upload of the same file raced on the version number
        # (UniqueConstraint project_id+name_stem+version). Roll back the DB row
        # and remove the orphaned storage file so we never leave a dangling blob.
        session.rollback()
        try:
            storage.delete(storage_path)
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A dataset with this name and version already exists.",
        )
    return created


@router.get("/projects/{project_id}", response_model=list[DatasetRead])
def list_datasets(
    project_id: int,
    session: SessionDep,
    current_user: CurrentUser,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[Dataset]:
    _ensure_project_owner(project_id, session, current_user)
    stmt = (
        select(Dataset)
        .where(Dataset.project_id == project_id)
        .order_by(Dataset.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return list(session.exec(stmt).all())


@router.get("/{dataset_id}", response_model=DatasetRead)
def read_dataset(dataset_id: int, session: SessionDep, current_user: CurrentUser) -> Dataset:
    return _get_owned(dataset_id, session, current_user)


@router.get("/{dataset_id}/lineage", response_model=list[DatasetRead])
def dataset_lineage(
    dataset_id: int, session: SessionDep, current_user: CurrentUser
) -> list[Dataset]:
    """Return the full version chain for this dataset's lineage, ordered by version.

    The chain is the set of `Dataset` rows sharing the same `root_id` (the original
    upload). Owner-guarded: only the dataset owner can read its lineage.
    """
    dataset = _get_owned(dataset_id, session, current_user)
    root = dataset.root_id or dataset.id
    stmt = (
        select(Dataset)
        .where(Dataset.root_id == root)
        .order_by(Dataset.version)
    )
    return list(session.exec(stmt).all())


@router.delete("/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dataset(dataset_id: int, session: SessionDep, current_user: CurrentUser):
    dataset = _get_owned(dataset_id, session, current_user)
    # Delete the whole lineage (the upload + every derived cleaning version),
    # not just this row — children reference it via parent_id/root_id.
    root = dataset.root_id or dataset.id
    lineage = list(session.exec(select(Dataset).where(Dataset.root_id == root)).all())
    lineage_ids = [d.id for d in lineage]

    # Remove artifacts that reference any lineage dataset (RESTRICT FKs).
    for model in (Report, Dashboard, Notebook, SqlQuery):
        for obj in session.exec(
            select(model).where(model.dataset_id.in_(lineage_ids))
        ).all():
            session.delete(obj)

    # Highest version first so the self-referential FKs never block the delete.
    for ds in sorted(lineage, key=lambda d: d.version or 0, reverse=True):
        session.delete(ds)
    session.commit()

    # Best-effort storage cleanup after commit.
    storage = get_storage()
    for ds in lineage:
        try:
            storage.delete(ds.storage_path)
        except Exception:
            pass


@router.post("/{dataset_id}/understand", response_model=DatasetRead)
async def analyze_dataset(
    dataset_id: int, session: SessionDep, current_user: CurrentUser
) -> Dataset:
    """Run the two-stage understanding workflow.

    Stage 1 (profiling) always runs and is persisted. Stage 2 (AI
    interpretation) is best-effort: on any LLM failure the dataset keeps its
    profile and a deterministic fallback understanding — never a 5xx.
    """
    dataset = _get_owned(dataset_id, session, current_user)
    storage = get_storage()

    # Stage 1 — deterministic facts (single source of truth).
    profile = profile_dataset(
        storage, dataset.storage_path, dataset.original_filename, dataset.file_format
    )
    dataset.profile = profile.model_dump(mode="json")
    dataset.status = "profiled"
    session.add(dataset)
    session.commit()
    session.refresh(dataset)

    # Stage 2 — AI interpretation of the profile (best-effort).
    understanding = await understand_dataset(profile)
    dataset.understanding = understanding.model_dump(mode="json")
    dataset.status = "understood" if understanding.ai_available else "profiled"
    session.add(dataset)
    session.commit()
    session.refresh(dataset)
    return dataset
