"""EDA + Visualizations routes — generate, fetch, and accept charts.

- `POST /{id}/eda` — build candidate charts, run the AI proposer, store the
  result on `dataset.eda`, return it (409 if the dataset is unprofiled).
- `GET /{id}/eda` — return the stored result (404 if not generated).
- `PATCH /{id}/eda` — persist the human's accepted chart ids (404 if none yet).

EDA is read-only: it never creates a new dataset version.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUser, SessionDep
from app.core.storage import get_storage
from app.models.dataset import Dataset
from app.schemas.eda import EdaAcceptRequest, EdaResult
from app.schemas.understanding import DatasetProfile, DatasetUnderstanding
from app.services.cleaning.engine import load_dataframe
from app.services.eda.engine import build_candidates
from app.services.eda.proposer import propose_charts

router = APIRouter(prefix="/datasets", tags=["eda"])


def _get_owned(dataset_id: int, session: SessionDep, user: CurrentUser) -> Dataset:
    dataset = session.get(Dataset, dataset_id)
    if dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    if dataset.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your dataset")
    return dataset


@router.post("/{dataset_id}/eda", response_model=EdaResult)
async def generate_eda(dataset_id: int, session: SessionDep, current_user: CurrentUser) -> EdaResult:
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
    storage = get_storage()
    df = load_dataframe(storage, dataset.storage_path, dataset.file_format)
    candidates = build_candidates(df, profile)
    result, _ = await propose_charts(profile, understanding, candidates)
    dataset.eda = result.model_dump(mode="json")
    session.add(dataset)
    session.commit()
    session.refresh(dataset)
    return result


@router.get("/{dataset_id}/eda", response_model=EdaResult)
def get_eda(dataset_id: int, session: SessionDep, current_user: CurrentUser) -> EdaResult:
    dataset = _get_owned(dataset_id, session, current_user)
    if dataset.eda is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="EDA not generated yet. Run EDA first.")
    return EdaResult.model_validate(dataset.eda)


@router.patch("/{dataset_id}/eda", response_model=EdaResult)
def accept_eda(
    dataset_id: int,
    body: EdaAcceptRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> EdaResult:
    dataset = _get_owned(dataset_id, session, current_user)
    if dataset.eda is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="EDA not generated yet. Run EDA first.")
    result = EdaResult.model_validate(dataset.eda)
    accepted = set(body.accepted_ids)
    for c in result.charts:
        c.accepted = c.id in accepted
    dataset.eda = result.model_dump(mode="json")
    session.add(dataset)
    session.commit()
    session.refresh(dataset)
    return result
