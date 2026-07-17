import asyncio

from app.schemas.chat import ChatAction, ChatContext
from app.services.chat.orchestrator import _fallback_turn, plan_turn, stream_narrative


def _ctx(with_frame: bool = True) -> ChatContext:
    return ChatContext(
        scope="dataset", project_id=1, dataset_id=5 if with_frame else None,
        profile={"column_names": ["a", "b"]} if with_frame else None,
    )


def test_fallback_with_frame_returns_sql_action():
    actions, summary, avail = _fallback_turn(_ctx(with_frame=True), "why did revenue drop?")
    assert avail is False
    assert len(actions) == 1 and actions[0].type == "sql"
    assert actions[0].dataset_id == 5


def test_fallback_without_frame_is_text_only():
    actions, summary, avail = _fallback_turn(_ctx(with_frame=False), "hello")
    assert avail is False
    assert actions == []


def test_plan_turn_validates_unknown_action_type(monkeypatch):
    # LLM returns an action type not in the catalog -> dropped.
    async def fake_complete_json(system, user):
        return {"summary": "ok", "actions": [{"type": "teleport", "question": "x"}]}
    monkeypatch.setattr("app.services.chat.orchestrator.complete_json", fake_complete_json)
    monkeypatch.setattr("app.services.chat.orchestrator.settings.OPENROUTER_API_KEY", "x")
    actions, summary, avail = asyncio.run(
        plan_turn(_ctx(), "q", [], available_actions=["sql"])
    )
    assert avail is True
    assert actions == []  # "teleport" not in catalog -> dropped


def test_stream_narrative_yields_text(monkeypatch):
    async def fake_stream(system, user, model=None):
        for t in ["Hi ", "there"]:
            yield t
    monkeypatch.setattr("app.services.chat.orchestrator.complete_stream", fake_stream)
    monkeypatch.setattr("app.services.chat.orchestrator.settings.OPENROUTER_API_KEY", "x")
    out = asyncio.run(
        _collect(stream_narrative(_ctx(), "q", [ChatAction(type="sql", question="q")], "I'll run SQL."))
    )
    assert out == "Hi there"


async def _collect(gen):
    return "".join([t async for t in gen])
