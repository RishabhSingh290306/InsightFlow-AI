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
    if action.type == "chart":
        return await _run_chart(action, dataset)
    if action.type == "cleaning":
        return await _run_cleaning(action, dataset)
    if action.type == "dashboard":
        return await _run_dashboard(session, action, project, dataset, user)
    if action.type == "report":
        return ChatArtifact(type="report", dataset_id=action.dataset_id,
                            status="proposed", proposal={"scope": action.scope or ("dataset" if dataset else "project")})
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


async def _run_chart(action: ChatAction, dataset: Dataset | None) -> ChatArtifact:
    from app.core.storage import get_storage
    from app.services.cleaning.engine import load_dataframe
    from app.services.eda.engine import build_candidates

    if dataset is None or dataset.profile is None:
        return ChatArtifact(type="chart", dataset_id=action.dataset_id, status="error", error="No analyzed dataset.")
    profile = DatasetProfile.model_validate(dataset.profile)
    storage = get_storage()
    df = load_dataframe(storage, dataset.storage_path, dataset.file_format)
    candidates = build_candidates(df, profile)
    hints = set((action.hints or []))
    if hints:
        picked = [c for c in candidates if hints & set(c.metadata.get("columns", []))]
        candidates = picked or candidates[:4]
    else:
        candidates = candidates[:4]
    return ChatArtifact(
        type="chart", dataset_id=dataset.id,
        specs=[c.model_dump(mode="json") for c in candidates], status="proposed",
    )


async def _run_cleaning(action: ChatAction, dataset: Dataset | None) -> ChatArtifact:
    from app.services.cleaning.planner import propose_plan

    if dataset is None or dataset.profile is None:
        return ChatArtifact(type="cleaning", dataset_id=action.dataset_id, status="error", error="No analyzed dataset.")
    profile = DatasetProfile.model_validate(dataset.profile)
    understanding = (
        DatasetUnderstanding.model_validate(dataset.understanding) if dataset.understanding else None
    )
    operations, ai_available = await propose_plan(profile, understanding)
    return ChatArtifact(
        type="cleaning", dataset_id=dataset.id,
        proposal={"operations": [o.model_dump(mode="json") for o in operations], "ai_available": ai_available},
        status="proposed",
    )


async def _run_dashboard(session, action: ChatAction, project, dataset, user) -> ChatArtifact:
    from app.services.dashboard.engine import assemble_context
    from app.services.dashboard.proposer import propose_dashboard
    from app.services.dashboard.widgets.catalog import build_catalog

    scope = action.scope or ("dataset" if dataset else "project")
    ctx = assemble_context(session, project, user, scope=scope, dataset=dataset)
    catalog = build_catalog(ctx)
    spec, ai_available = await propose_dashboard(catalog, ctx)
    return ChatArtifact(
        type="dashboard", dataset_id=dataset.id if dataset else None,
        proposal={"scope": scope, "ai_available": ai_available},
        catalog=[e.model_dump(mode="json") for e in catalog], status="proposed",
    )
