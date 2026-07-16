"""SQL Generation routes — generate, run (validate+execute), history.

- `POST /sql/generate` — AI proposes SQL + explanation + suggested viz from a
  business question + profile (409 if unprofiled; best-effort).
- `POST /sql/run` — validate (422 on unsafe/invalid), execute read-only over the
  in-memory frame, generate insights, persist a history row, return results.
- `GET /sql/history` — owner-guarded, per-project list (optional dataset/q filter).
- `DELETE /sql/history/{id}` — owner-guarded delete of a history row.

SQL is read-only analysis: it never creates a new dataset version.
"""
from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Query, status
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.core.storage import get_storage
from app.models.dataset import Dataset
from app.models.sql_query import SqlQuery
from app.schemas.sql import (
    SqlGenerateRequest,
    SqlProposal,
    SqlQueryRecord,
    SqlResult,
    SqlRunRequest,
)
from app.schemas.understanding import DatasetProfile, DatasetUnderstanding
from app.services.cleaning.engine import load_dataframe
from app.services.sql.engine import execute_query, suggest_chart, validate_sql
from app.services.sql.insights import generate_insights
from app.services.sql.proposer import generate_sql

router = APIRouter(tags=["sql"])


def _owned_dataset(dataset_id: int, session: SessionDep, user: CurrentUser) -> Dataset:
    ds = session.get(Dataset, dataset_id)
    if ds is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    if ds.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your dataset")
    return ds


@router.post("/sql/generate", response_model=SqlProposal)
async def generate(body: SqlGenerateRequest, session: SessionDep, current_user: CurrentUser) -> SqlProposal:
    ds = _owned_dataset(body.dataset_id, session, current_user)
    if ds.profile is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Dataset is not analyzed yet. Run Analyze first.",
        )
    profile = DatasetProfile.model_validate(ds.profile)
    understanding = (
        DatasetUnderstanding.model_validate(ds.understanding) if ds.understanding else None
    )
    return await generate_sql(body.question, profile, understanding)


@router.post("/sql/run", response_model=SqlResult)
async def run(body: SqlRunRequest, session: SessionDep, current_user: CurrentUser) -> SqlResult:
    ds = _owned_dataset(body.dataset_id, session, current_user)
    if ds.profile is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Dataset is not analyzed yet. Run Analyze first.",
        )
    profile = DatasetProfile.model_validate(ds.profile)
    ok, err = validate_sql(body.sql, profile.column_names)
    if not ok:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=err or "Invalid SQL.")
    storage = get_storage()
    df = load_dataframe(storage, ds.storage_path, ds.file_format)
    try:
        res = execute_query(df, body.sql)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    viz = body.suggested_visualization
    if viz is None and res["columns"]:
        suggested = suggest_chart(res["columns"], res["rows"][:5])
        viz = suggested.model_dump() if suggested else None
    else:
        viz = viz.model_dump() if viz is not None else None

    summary = (
        f"row_count={res['row_count']}, columns={res['columns']}, "
        f"sample={json.dumps(res['rows'][:3], default=str)}"
    )
    insight_items, insights_avail = await generate_insights(
        body.business_question or "", body.sql, summary, profile
    )

    record = SqlQuery(
        project_id=ds.project_id, dataset_id=ds.id, owner_id=current_user.id,
        business_question=body.business_question or "", sql=body.sql, edited=body.edited,
        explanation=body.explanation or "", suggested_visualization=viz, insights=insight_items,
        columns=res["columns"], row_count=res["row_count"], truncated=res["truncated"],
        duration_ms=res["duration_ms"],
    )
    session.add(record)
    session.commit()
    session.refresh(record)

    return SqlResult(
        columns=res["columns"], rows=res["rows"], row_count=res["row_count"],
        truncated=res["truncated"], duration_ms=res["duration_ms"], insights=insight_items,
        insights_ai_available=insights_avail, persisted_id=record.id,
    )


@router.get("/sql/history", response_model=list[SqlQueryRecord])
def history(
    session: SessionDep,
    current_user: CurrentUser,
    project_id: int = Query(...),
    dataset_id: int | None = None,
    q: str | None = None,
) -> list[SqlQueryRecord]:
    stmt = select(SqlQuery).where(
        SqlQuery.project_id == project_id, SqlQuery.owner_id == current_user.id
    )
    if dataset_id is not None:
        stmt = stmt.where(SqlQuery.dataset_id == dataset_id)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            (SqlQuery.business_question.ilike(like)) | (SqlQuery.sql.ilike(like))
        )
    stmt = stmt.order_by(SqlQuery.executed_at.desc())
    return session.exec(stmt).all()


@router.delete("/sql/history/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_history(record_id: int, session: SessionDep, current_user: CurrentUser):
    rec = session.get(SqlQuery, record_id)
    if rec is None or rec.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    session.delete(rec)
    session.commit()
