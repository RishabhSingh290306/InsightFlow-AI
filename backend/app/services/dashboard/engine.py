"""Dashboard engine: build the request context and render a resolved view.

`assemble_context` reads ONLY stored artifacts (profile/understanding/eda/sql
history) — never reparses the uploaded file. `render` resolves the saved spec
against the live context, honoring widget order + hidden widgets.
"""
from __future__ import annotations

from sqlmodel import select

from app.schemas.dashboard import DashboardSpec, DashboardView
from app.schemas.understanding import DatasetProfile, DatasetUnderstanding
from app.services.dashboard.widgets.catalog import build_catalog
from app.services.dashboard.widgets.context import DashboardContext
from app.models.sql_query import SqlQuery


def assemble_context(session, project, dataset, user) -> DashboardContext:
    profile = DatasetProfile.model_validate(dataset.profile) if dataset.profile else None
    understanding = (
        DatasetUnderstanding.model_validate(dataset.understanding)
        if dataset.understanding
        else None
    )
    eda = None
    if dataset.eda:
        from app.schemas.eda import EdaResult

        eda = EdaResult.model_validate(dataset.eda)
    sql_history = session.exec(
        select(SqlQuery)
        .where(SqlQuery.dataset_id == dataset.id, SqlQuery.owner_id == user.id)
        .order_by(SqlQuery.executed_at.desc())
        .limit(20)
    ).all()
    return DashboardContext(
        scope="dataset",
        project=project,
        dataset=dataset,
        dataset_version_id=dataset.id,
        profiles={dataset.id: profile} if profile else {},
        understandings={dataset.id: understanding} if understanding else {},
        eda_results={dataset.id: eda} if eda else {},
        sql_history=list(sql_history),
        reports=[],
        lineage={},
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
