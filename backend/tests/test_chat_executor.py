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
    art = asyncio.run(run_action(None, ChatAction(type="dashboard", scope="project"),
                                 project=None, dataset=None, user=None))
    assert art.type == "dashboard"
    assert art.status == "proposed"
