"""Deterministic executor: turn a proposed ChatAction into a ChatArtifact.

Calls the existing engines (never modified) to compute each artifact's proposed
state. M1 implements `sql`; `chart`/`cleaning`/`dashboard`/`report` return a
`proposed` placeholder here and are fully implemented in M2.
"""
from __future__ import annotations

from sqlmodel import Session

from app.models.dataset import Dataset
from app.models.project import Project
from app.models.user import User
from app.schemas.chat import ChatAction, ChatArtifact
from app.schemas.understanding import DatasetProfile, DatasetUnderstanding


async def run_action(
    session: Session | None, action: ChatAction, project: Project | None,
    dataset: Dataset | None, user: User | None,
) -> ChatArtifact:
    if action.type == "sql":
        return await _run_sql(action, dataset)
    # M2 fills these in; for M1 they are inert proposals.
    return ChatArtifact(type=action.type, dataset_id=action.dataset_id, status="proposed")


async def _run_sql(action: ChatAction, dataset: Dataset | None) -> ChatArtifact:
    from app.services.sql.proposer import generate_sql

    if dataset is None or dataset.profile is None:
        return ChatArtifact(type="sql", dataset_id=action.dataset_id, status="error",
                            error="No analyzed dataset available for SQL.")
    profile = DatasetProfile.model_validate(dataset.profile)
    understanding = (
        DatasetUnderstanding.model_validate(dataset.understanding)
        if dataset.understanding else None
    )
    proposal = await generate_sql(action.question or "", profile, understanding)
    return ChatArtifact(
        type="sql",
        dataset_id=dataset.id,
        proposal=proposal.model_dump(mode="json"),
        status="proposed",
    )
