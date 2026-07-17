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
    project_summary = None
    if dataset is None:
        from sqlmodel import select

        from app.models.dataset import Dataset as _D

        owned = session.exec(
            select(_D).where(_D.project_id == project.id, _D.owner_id == user.id)
        ).all()
        project_summary = {
            "dataset_count": len(owned),
            "profiled_count": sum(1 for d in owned if d.profile),
            "datasets": [
                {
                    "id": d.id,
                    "name": d.original_filename,
                    "columns": list((d.profile or {}).get("column_names", [])),
                    "row_count": (d.profile or {}).get("row_count"),
                }
                for d in owned
            ],
        }

    return ChatContext(
        scope="dataset" if dataset else "project",
        project_id=project.id,
        dataset_id=dataset.id if dataset else None,
        profile=profile.model_dump(mode="json") if profile else None,
        understanding=understanding.model_dump(mode="json") if understanding else None,
        eda=dataset.eda if dataset else None,
        project_summary=project_summary,
    )
