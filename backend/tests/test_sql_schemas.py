from datetime import datetime

from app.schemas.sql import (
    SqlChainTurn,
    SqlGenerateRequest,
    SqlQueryRecord,
    SqlResult,
    SqlRunRequest,
)


def test_chain_turn_constructs():
    t = SqlChainTurn(business_question="q", sql="SELECT 1", result_summary="1 row")
    assert t.business_question == "q"


def test_generate_request_accepts_chain():
    req = SqlGenerateRequest(
        dataset_id=1,
        question="q",
        chain=[SqlChainTurn(business_question="q", sql="SELECT 1", result_summary="1 row")],
    )
    assert req.chain is not None and len(req.chain) == 1


def test_run_request_accepts_parent():
    req = SqlRunRequest(dataset_id=1, sql="SELECT 1", parent_query_id=5)
    assert req.parent_query_id == 5


def test_result_has_followups():
    r = SqlResult(
        columns=[],
        rows=[],
        row_count=0,
        truncated=False,
        duration_ms=1.0,
        followup_questions=["why?"],
        followups_ai_available=True,
    )
    assert r.followup_questions == ["why?"]
    assert r.followups_ai_available is True


def test_record_has_parent():
    rec = SqlQueryRecord(
        id=1,
        project_id=1,
        dataset_id=1,
        owner_id=1,
        business_question="q",
        sql="SELECT 1",
        edited=False,
        explanation="",
        insights=[],
        columns=[],
        executed_at=datetime(2026, 7, 17),
        parent_query_id=2,
    )
    assert rec.parent_query_id == 2