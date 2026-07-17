"""Dashboard engine: build the request context and render a resolved view.

`assemble_context` reads ONLY stored artifacts (profile/understanding/eda/sql
history/reports/lineage) — never reparses the uploaded file. For project scope
it aggregates the artifacts of every owned dataset in the project. `render`
resolves the saved spec against the live context, honoring widget order +
hidden widgets.
"""
from __future__ import annotations

from sqlmodel import select

from app.models.dataset import Dataset
from app.models.report import Report
from app.models.sql_query import SqlQuery
from app.schemas.dashboard import DashboardSpec, DashboardView
from app.schemas.eda import EdaResult
from app.schemas.understanding import DatasetProfile, DatasetUnderstanding
from app.services.dashboard.widgets.catalog import build_catalog
from app.services.dashboard.widgets.context import DashboardContext


def assemble_context(session, project, user, scope: str = "dataset", dataset=None) -> DashboardContext:
    """Build the resolved artifact context for a dashboard preview.

    For `dataset` scope the context is centered on a single dataset (and its
    version lineage). For `project` scope it aggregates the profiles,
    understandings, EDA results, SQL history, reports, and version chains of
    every dataset the user owns in the project.
    """
    if scope == "project":
        return _assemble_project_context(session, project, user)
    return _assemble_dataset_context(session, project, dataset, user)


def _assemble_project_context(session, project, user) -> DashboardContext:
    datasets = list(
        session.exec(
            select(Dataset).where(
                Dataset.project_id == project.id, Dataset.owner_id == user.id
            )
        ).all()
    )
    profiles: dict[int, DatasetProfile] = {}
    understandings: dict[int, DatasetUnderstanding] = {}
    eda_results: dict[int, EdaResult] = {}
    for d in datasets:
        if d.profile:
            profiles[d.id] = DatasetProfile.model_validate(d.profile)
        if d.understanding:
            understandings[d.id] = DatasetUnderstanding.model_validate(d.understanding)
        if d.eda:
            eda_results[d.id] = EdaResult.model_validate(d.eda)

    dataset_ids = [d.id for d in datasets]
    sql_history = []
    if dataset_ids:
        sql_history = list(
            session.exec(
                select(SqlQuery)
                .where(SqlQuery.dataset_id.in_(dataset_ids), SqlQuery.owner_id == user.id)
                .order_by(SqlQuery.executed_at.desc())
                .limit(50)
            ).all()
        )
    reports = list(
        session.exec(
            select(Report)
            .where(Report.project_id == project.id, Report.owner_id == user.id)
            .order_by(Report.updated_at.desc())
        ).all()
    )
    return DashboardContext(
        scope="project",
        project=project,
        datasets=datasets,
        profiles=profiles,
        understandings=understandings,
        eda_results=eda_results,
        sql_history=sql_history,
        reports=reports,
        lineage={},
    )


def _assemble_dataset_context(session, project, dataset, user) -> DashboardContext:
    profile = DatasetProfile.model_validate(dataset.profile) if dataset.profile else None
    understanding = (
        DatasetUnderstanding.model_validate(dataset.understanding)
        if dataset.understanding
        else None
    )
    eda = EdaResult.model_validate(dataset.eda) if dataset.eda else None
    sql_history = list(
        session.exec(
            select(SqlQuery)
            .where(SqlQuery.dataset_id == dataset.id, SqlQuery.owner_id == user.id)
            .order_by(SqlQuery.executed_at.desc())
            .limit(20)
        ).all()
    )
    lineage: list[Dataset] = []
    root = dataset.root_id or dataset.id
    if root:
        lineage = list(
            session.exec(
                select(Dataset).where(Dataset.root_id == root).order_by(Dataset.version)
            ).all()
        )
    return DashboardContext(
        scope="dataset",
        project=project,
        dataset=dataset,
        datasets=[dataset],
        dataset_version_id=dataset.id,
        profiles={dataset.id: profile} if profile else {},
        understandings={dataset.id: understanding} if understanding else {},
        eda_results={dataset.id: eda} if eda else {},
        sql_history=sql_history,
        reports=[],
        lineage={dataset.id: lineage},
    )


def render(spec: DashboardSpec, ctx: DashboardContext, ai_available: bool = True) -> DashboardView:
    catalog = build_catalog(ctx)
    by_type = {e.widget.type: e for e in catalog}
    order = spec.widget_order or list(by_type.keys())
    widgets = []
    for t in order:
        if t in spec.hidden_widgets:
            continue
        entry = by_type.get(t)
        if entry is None:
            continue
        widgets.append(entry)
    return DashboardView(scope=ctx.scope, spec=spec, widgets=widgets, ai_available=ai_available)
