"""Cleaning routes — operation catalog and deterministic preview.

The registry catalog (`/cleaning/operations`) feeds the UI and the AI planner.
`/cleaning/preview` dry-runs an edited plan and returns per-operation impacts
plus a summary — deterministic, with no persistence and no LLM.

The `plan` (AI proposal) and `apply` (writes a new immutable version) endpoints
arrive in M3.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUser, SessionDep
from app.core.storage import get_storage
from app.models.dataset import Dataset
from app.schemas.cleaning import CleaningPlan, PreviewRequest
from app.services.cleaning import catalog, load_dataframe, run_preview
from app.services.cleaning.registry import get_operation

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
