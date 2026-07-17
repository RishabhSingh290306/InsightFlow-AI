"""Build the structured chat context (facts only, never raw data)."""
from __future__ import annotations

from sqlmodel import Session

from app.models.dataset import Dataset
from app.models.project import Project
from app.models.user import User
from app.schemas.chat import ChatContext
from app.schemas.understanding import DatasetProfile, DatasetUnderstanding


def build_chat_context(
    session: Session, project: Project, dataset: Dataset | None, user: User
) -> ChatContext:
    profile = DatasetProfile.model_validate(dataset.profile) if dataset and dataset.profile else None
    understanding = (
        DatasetUnderstanding.model_validate(dataset.understanding)
        if dataset and dataset.understanding
        else None
    )
    return ChatContext(
        scope="dataset" if dataset else "project",
        project_id=project.id,
        dataset_id=dataset.id if dataset else None,
        profile=profile.model_dump(mode="json") if profile else None,
        understanding=understanding.model_dump(mode="json") if understanding else None,
        eda=dataset.eda if dataset else None,
        project_summary=None,  # populated for project scope in M3 routing
    )
