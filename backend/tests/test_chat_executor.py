import asyncio

from sqlmodel import Session, create_engine

from app.models.dataset import Dataset
from app.schemas.chat import ChatAction, ChatArtifact
from app.services.chat.executor import run_action


def test_run_action_sql_calls_generate_sql(monkeypatch):
    async def fake_generate_sql(question, profile, understanding=None, chain=None):
        from app.schemas.sql import SqlProposal
        return SqlProposal(business_question=question, sql="SELECT 1", explanation="e",
                           confidence=0.7, suggested_visualization=None, ai_available=True)
    monkeypatch.setattr("app.services.sql.proposer.generate_sql", fake_generate_sql)

    from app.schemas.understanding import DatasetProfile

    profile = DatasetProfile.model_construct(
        file_name="f", file_size=1, row_count=1, column_count=1,
        column_names=["a"], inferred_types={"a": "numeric"},
        numeric_columns=["a"], categorical_columns=[], date_columns=[],
        missing_values={}, duplicate_row_count=0, null_percentage=0.0,
        unique_values={}, basic_statistics={}, potential_target_column=None,
        data_quality_issues=[], preview=[],
    )
    ds = Dataset(id=1, project_id=1, owner_id=1, filename="f", original_filename="f.csv",
                 name_stem="f", storage_path="1/f.csv", file_size=1, file_format="csv",
                 profile=profile.model_dump(mode="json"))
    action = ChatAction(type="sql", question="q", dataset_id=1)
    art = asyncio.run(run_action(None, action, project=None, dataset=ds, user=None))
    assert isinstance(art, ChatArtifact)
    assert art.type == "sql"
    assert art.proposal["sql"] == "SELECT 1"
    assert art.status == "proposed"


def test_run_action_unknown_type_returns_proposed_placeholder():
    art = asyncio.run(run_action(None, ChatAction(type="teleport", scope="project"),
                                 project=None, dataset=None, user=None))
    assert art.type == "teleport"
    assert art.status == "proposed"


def test_run_action_report_placeholder(monkeypatch):
    art = asyncio.run(run_action(None, ChatAction(type="report", scope="project"),
                                 project=None, dataset=None, user=None))
    assert art.type == "report" and art.status == "proposed"


def test_run_action_dashboard_builds_catalog(monkeypatch):
    # Stub assemble_context + the dashboard proposer so no DB/LLM is needed.
    from app.schemas.dashboard import DashboardSpec
    from app.schemas.understanding import DatasetProfile
    from app.services.dashboard.engine import DashboardContext

    profile = DatasetProfile(
        file_name="t.csv", file_size=10, row_count=100, column_count=3,
        column_names=["a", "b", "c"], inferred_types={"a": "numeric", "b": "categorical", "c": "numeric"},
        numeric_columns=["a", "c"], categorical_columns=["b"], date_columns=[],
        missing_values={"a": 0, "b": 0, "c": 0}, duplicate_row_count=2, null_percentage=0.0,
        unique_values={"a": 10, "b": 3, "c": 10}, basic_statistics={},
        data_quality_issues=["2 duplicate rows"], preview=[],
    )
    ds = type("DS", (), {"id": 1, "original_filename": "t.csv"})()

    def fake_assemble(session, project, user, scope="dataset", dataset=None):
        return DashboardContext(scope=scope, project=project, dataset=dataset, profiles={1: profile})

    async def fake_propose(catalog, ctx):
        return DashboardSpec(scope=ctx.scope, widget_order=[e.widget.type for e in catalog]), True

    monkeypatch.setattr("app.services.dashboard.engine.assemble_context", fake_assemble)
    monkeypatch.setattr("app.services.dashboard.proposer.propose_dashboard", fake_propose)

    from app.models.project import Project
    proj = Project(id=1, owner_id=1, name="p", description="d")
    art = asyncio.run(run_action(None, ChatAction(type="dashboard", scope="dataset", dataset_id=1),
                                 project=proj, dataset=ds, user=None))
    assert art.type == "dashboard"
    assert isinstance(art.catalog, list) and len(art.catalog) > 0
