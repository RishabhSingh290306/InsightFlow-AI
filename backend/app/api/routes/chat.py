"""Chat & Notebook routes.

- `POST /chat/message` — SSE. Builds context, runs the two-call AI turn
  (intent + streamed narrative), deterministically executes proposed artifacts,
  emits `token`/`artifact`/`done`/`error` SSE events, and persists the user +
  assistant turns into the notebook's `turns`.
- `GET  /notebooks` — owner list.
- `POST /notebooks` — create.
- `GET  /notebooks/{id}` — owner fetch (turns attached).
- `PATCH /notebooks/{id}` — rename.
- `DELETE /notebooks/{id}` — owner delete.
- `GET /notebooks/share/{token}` — PUBLIC, read-only, safe fields only.

All AI steps are best-effort; the stream never 5xxes because the LLM was down.
"""
from __future__ import annotations

import json
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.models.dataset import Dataset
from app.models.notebook import Notebook
from app.models.project import Project
from app.schemas.chat import (
    ChatArtifact,
    ChatMessageRequest,
    ChatTurn,
    NotebookCreate,
    NotebookDetailRead,
    NotebookPatchRequest,
    NotebookRead,
    NotebookShareRead,
)
from app.services.chat.context import build_chat_context
from app.services.chat.executor import run_action
from app.services.chat.orchestrator import plan_turn, stream_narrative

router = APIRouter(prefix="/chat", tags=["chat"])

_AVAILABLE_ACTIONS_M1 = ["sql"]  # M2 extends to chart/cleaning/dashboard/report


def _owned(notebook_id: int, session: SessionDep, user: CurrentUser) -> Notebook:
    n = session.get(Notebook, notebook_id)
    if n is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notebook not found")
    if n.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your notebook")
    return n


def _resolve_scope(body, session: SessionDep, user: CurrentUser):
    """Validate project/dataset ownership + analysis; return (project, dataset)."""
    project = session.get(Project, body.project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if project.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your project")
    dataset = None
    if body.dataset_id is not None:
        dataset = session.get(Dataset, body.dataset_id)
        if dataset is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
        if dataset.owner_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your dataset")
    return project, dataset


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


@router.post("/message")
async def chat_message(body: ChatMessageRequest, session: SessionDep, current_user: CurrentUser):
    project, dataset = _resolve_scope(body, session, current_user)
    notebook = session.get(Notebook, body.notebook_id) if body.notebook_id else None
    if notebook is None:
        notebook = Notebook(
            project_id=project.id, owner_id=current_user.id,
            scope="dataset" if dataset else "project",
            dataset_id=dataset.id if dataset else None,
            title=(body.content[:60] or "New chat"),
            turns=[], share_token=secrets.token_urlsafe(32), ai_available=True,
        )
        session.add(notebook)
        session.commit()
        session.refresh(notebook)

    ctx = build_chat_context(session, project, dataset, current_user)
    user_turn = ChatTurn(
        id=secrets.token_hex(8), role="user", content=body.content, actions=[],
        parent_id=body.parent_message_id, created_at=_iso(),
    )
    turns = list(notebook.turns or [])
    turns.append(user_turn.model_dump(mode="json"))

    async def generate():
        narrative: list[str] = []
        actions: list[ChatArtifact] = []
        ai_available = True
        try:
            proposed, summary, avail = await plan_turn(
                ctx, body.content, [], _AVAILABLE_ACTIONS_M1
            )
            ai_available = ai_available and avail
            async for token in stream_narrative(ctx, body.content, proposed, summary):
                narrative.append(token)
                yield _sse("token", {"text": token})
            for action in proposed:
                artifact = await run_action(session, action, project, dataset, current_user)
                actions.append(artifact)
                yield _sse("artifact", {"artifact": artifact.model_dump(mode="json")})
        except Exception as e:  # never 5xx the stream
            ai_available = False
            yield _sse("error", {"message": str(e), "ai_available": False})

        assistant_turn = ChatTurn(
            id=secrets.token_hex(8), role="assistant",
            content="".join(narrative), actions=actions,
            parent_id=None, created_at=_iso(),
        )
        turns.append(assistant_turn.model_dump(mode="json"))
        notebook.turns = turns
        if notebook.generated_at is None:
            notebook.generated_at = datetime.now(timezone.utc)
        notebook.ai_available = ai_available
        notebook.updated_at = datetime.now(timezone.utc)
        session.add(notebook)
        session.commit()
        yield _sse("done", {
            "notebook_id": notebook.id, "message_id": assistant_turn.id,
            "ai_available": ai_available, "title": notebook.title,
        })

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.get("/notebooks", response_model=list[NotebookRead])
def list_notebooks(session: SessionDep, current_user: CurrentUser, project_id: int = Query(...)) -> list[NotebookRead]:
    stmt = (
        select(Notebook)
        .where(Notebook.project_id == project_id, Notebook.owner_id == current_user.id)
        .order_by(Notebook.created_at.desc())
    )
    return list(session.exec(stmt).all())


@router.post("/notebooks", response_model=NotebookRead, status_code=status.HTTP_201_CREATED)
def create_notebook(body: NotebookCreate, session: SessionDep, current_user: CurrentUser) -> NotebookRead:
    project = session.get(Project, body.project_id)
    if project is None or project.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    dataset = None
    if body.dataset_id is not None:
        dataset = session.get(Dataset, body.dataset_id)
        if dataset is None or dataset.owner_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    nb = Notebook(
        project_id=project.id, owner_id=current_user.id, scope=body.scope,
        dataset_id=dataset.id if dataset else None,
        title=body.title or "New chat", turns=[], share_token=secrets.token_urlsafe(32),
    )
    session.add(nb)
    session.commit()
    session.refresh(nb)
    return nb


@router.get("/notebooks/{notebook_id}", response_model=NotebookDetailRead)
def get_notebook(notebook_id: int, session: SessionDep, current_user: CurrentUser) -> NotebookDetailRead:
    n = _owned(notebook_id, session, current_user)
    detail = {k: v for k, v in n.model_dump().items() if k != "turns"}
    return NotebookDetailRead(turns=[ChatTurn(**t) for t in (n.turns or [])], **detail)


@router.patch("/notebooks/{notebook_id}", response_model=NotebookRead)
def update_notebook(notebook_id: int, body: NotebookPatchRequest, session: SessionDep, current_user: CurrentUser) -> NotebookRead:
    n = _owned(notebook_id, session, current_user)
    if body.title is not None:
        n.title = body.title
    n.updated_at = datetime.now(timezone.utc)
    session.add(n)
    session.commit()
    session.refresh(n)
    return n


@router.delete("/notebooks/{notebook_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_notebook(notebook_id: int, session: SessionDep, current_user: CurrentUser):
    n = _owned(notebook_id, session, current_user)
    session.delete(n)
    session.commit()


@router.get("/notebooks/share/{token}", response_model=NotebookShareRead)
def share_notebook(token: str, session: SessionDep):
    n = session.exec(select(Notebook).where(Notebook.share_token == token)).first()
    if n is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notebook not found")
    return NotebookShareRead(
        title=n.title, scope=n.scope,
        turns=[ChatTurn(**t) for t in (n.turns or [])],
        ai_available=n.ai_available, generated_at=n.generated_at,
    )


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()
