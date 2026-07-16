"""Cleaning routes — catalog, deterministic preview, AI plan, and apply.

- `/cleaning/operations` — registry catalog (feeds the UI and the AI planner).
- `/cleaning/preview` — dry-run an edited plan; deterministic, no persistence.
- `/cleaning/plan` — AI propose + dry-run impacts (best-effort; rule-based
  fallback when the LLM is unavailable). Requires the dataset to be profiled.
- `/cleaning/apply` — execute approved ops and write a NEW immutable child
  version (re-profiled). All-or-nothing: a failed op returns 422 and creates
  no version.
"""
from __future__ import annotations

import io

from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUser, SessionDep
from app.core.storage import get_storage
from app.db import Repository
from app.models.dataset import Dataset
from app.schemas.cleaning import (
    ApplyRequest,
    CleaningPlan,
    PreviewRequest,
    _utcnow_iso,
)
from app.schemas.dataset import DatasetRead
from app.schemas.understanding import DatasetProfile, DatasetUnderstanding
from app.services.cleaning import catalog, load_dataframe, propose_plan, run_preview
from app.services.cleaning.engine import CleaningApplyError, apply as engine_apply
from app.services.dataset_profiling import profile_dataset

ENGINE_VERSION = "1.0"

router = APIRouter(prefix="/datasets", tags=["cleaning"])


def _get_owned(dataset_id: int, session: SessionDep, user: CurrentUser) -> Dataset:
    dataset = session.get(Dataset, dataset_id)
    if dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    if dataset.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your dataset")
    return dataset


@router.get("/{dataset_id}/cleaning/operations")
def list_operations(dataset_id: int, session: SessionDep, current_user: CurrentUser) -> list[dict]:
    # Owner guard: only the dataset owner may read its cleaning catalog.
    _get_owned(dataset_id, session, current_user)
    return catalog()


@router.post("/{dataset_id}/cleaning/preview", response_model=CleaningPlan)
def preview_cleaning(
    dataset_id: int,
    body: PreviewRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> CleaningPlan:
    """Dry-run a cleaning plan and return per-operation impacts + a summary.

    Loads the dataset's dataframe via the storage adapter, runs the requested
    operations through `run_preview` (no persistence, no mutation of the stored
    file), and returns a `CleaningPlan`.
    """
    dataset = _get_owned(dataset_id, session, current_user)
    storage = get_storage()
    df = load_dataframe(storage, dataset.storage_path, dataset.file_format)
    try:
        return run_preview(df, body.operations)
    except (KeyError, ValueError) as exc:
        # Unknown operation name or invalid params/columns.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid cleaning plan: {exc}",
        )


@router.post("/{dataset_id}/cleaning/plan", response_model=CleaningPlan)
async def plan_cleaning(
    dataset_id: int,
    session: SessionDep,
    current_user: CurrentUser,
) -> CleaningPlan:
    """AI-propose a cleaning plan and dry-run its impacts.

    Best-effort: the LLM proposes operations from the registry catalog; on any
    failure a deterministic rule-based plan is returned (`ai_available=False`).
    Requires the dataset to be profiled first.
    """
    dataset = _get_owned(dataset_id, session, current_user)
    if dataset.profile is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Dataset is not analyzed yet. Run Analyze first.",
        )
    profile = DatasetProfile.model_validate(dataset.profile)
    understanding = (
        DatasetUnderstanding.model_validate(dataset.understanding)
        if dataset.understanding
        else None
    )
    operations, ai_available = await propose_plan(profile, understanding)

    storage = get_storage()
    df = load_dataframe(storage, dataset.storage_path, dataset.file_format)
    try:
        plan = run_preview(df, operations)
    except (KeyError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid cleaning plan: {exc}",
        )
    plan.ai_available = ai_available
    return plan


@router.post("/{dataset_id}/cleaning/apply", response_model=DatasetRead)
def apply_cleaning(
    dataset_id: int,
    body: ApplyRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> Dataset:
    """Execute approved operations and write a new immutable child version.

    Runs the approved ops through the same registry `preview` uses (so they can
    never diverge), persists a brand-new `Dataset` row (parent/root pointers,
    `origin='cleaning'`, `version = parent+1`, recipe), and re-profiles it. On
    any operation failure, returns 422 naming the failed op and creates NO
    version (all-or-nothing at persistence).
    """
    dataset = _get_owned(dataset_id, session, current_user)
    storage = get_storage()
    df = load_dataframe(storage, dataset.storage_path, dataset.file_format)

    try:
        new_df, applied = engine_apply(df, body.operations)
    except CleaningApplyError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Cleaning failed at operation '{exc.op_name}': {exc}",
        )

    # Serialize the cleaned dataframe in the original format.
    if dataset.file_format == "csv":
        content = new_df.to_csv(index=False).encode("utf-8")
    else:  # xlsx / xls
        buf = io.BytesIO()
        new_df.to_excel(buf, index=False)
        content = buf.getvalue()
    storage_path, filename = storage.save(dataset.project_id, dataset.original_filename, content)

    recipe = {
        "source_version_id": dataset.id,
        "parent_version": dataset.version,
        "engine_version": ENGINE_VERSION,
        "applied": [r for r in applied if r.get("status") == "success"],
        "skipped": [
            {"op": r["op"], "params": r["params"], "reason": r.get("reason")}
            for r in applied
            if r.get("status") == "skipped"
        ],
        "created_at": _utcnow_iso(),
    }

    child = Dataset(
        project_id=dataset.project_id,
        owner_id=dataset.owner_id,
        filename=filename,
        original_filename=dataset.original_filename,
        name_stem=dataset.name_stem,  # keep lineage grouped
        storage_path=storage_path,
        file_size=len(content),
        mime_type=dataset.mime_type,
        file_format=dataset.file_format,
        row_count=int(new_df.shape[0]),
        column_count=int(new_df.shape[1]),
        version=dataset.version + 1,
        parent_id=dataset.id,
        root_id=dataset.root_id or dataset.id,
        origin="cleaning",
        recipe=recipe,
    )
    # Re-profile the new version (deterministic; always succeeds) before
    # committing, so a profiling failure leaves no partial version.
    child.profile = profile_dataset(
        storage, storage_path, dataset.original_filename, dataset.file_format
    ).model_dump(mode="json")
    child.status = "profiled"
    return Repository(Dataset, session).create(child)
