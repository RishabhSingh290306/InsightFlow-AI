"""Chat orchestrator: intent selection + live narrative streaming.

CALL A (plan_turn) uses complete_json to pick proposed actions from a fixed
catalog (HITL — the human executes them later). CALL B (stream_narrative) uses
the new complete_stream primitive to stream the prose answer live. Both are
best-effort: any LLM failure falls back to a deterministic plan.
"""
from __future__ import annotations

import json
from collections.abc import AsyncGenerator

from app.core.config import settings
from app.schemas.chat import ChatAction, ChatContext
from app.services.llm import complete_json, complete_stream

_CATALOG_DESCRIPTIONS = {
    "sql": "Run a read-only SQL query against the dataset to answer the question.",
    "chart": "Show recommended charts (histogram, bar, correlation, etc.).",
    "cleaning": "Propose data-cleaning operations (missing values, duplicates).",
    "dashboard": "Recommend or open a dashboard for this dataset/project.",
    "report": "Generate or open an insights report for this dataset/project.",
}

_SYSTEM_INTENT = (
    "You are a senior data analyst inside a chat. Given the STRUCTURED facts about "
    "a dataset/project (never raw rows) and the user's question, decide which of "
    "the AVAILABLE ACTIONS to propose. Keep it to the most useful 1-3 actions. "
    "Respond with JSON only: {\"summary\": str (1-2 sentence plan), \"actions\": "
    "[{\"type\": one of AVAILABLE, \"question\": str|null, \"dataset_id\": int|null, "
    "\"hints\": [str]|null, \"scope\": \"dataset\"|\"project\"|null}]."
)

_SYSTEM_NARRATIVE = (
    "You are a friendly data analyst answering the user in a chat. Write a concise, "
    "plain-English answer to their question using the structured facts. Mention the "
    "actions you are about to take (e.g. 'I'll run a SQL query…'). No raw data, no code fences."
)


def _user_intent(ctx: ChatContext, question: str, history, available_actions: list[str]) -> str:
    catalog = {k: _CATALOG_DESCRIPTIONS[k] for k in available_actions}
    return json.dumps(
        {
            "available_actions": catalog,
            "question": question,
            "facts": ctx.model_dump(mode="json"),
            "prior_turns": [h.model_dump(mode="json") for h in (history or [])],
        },
        indent=2,
    )


def _fallback_turn(ctx: ChatContext, question: str) -> tuple[list[ChatAction], str, bool]:
    if ctx.dataset_id is not None and ctx.profile is not None:
        actions = [ChatAction(type="sql", question=question, dataset_id=ctx.dataset_id)]
        summary = "I can help by running a SQL query against this dataset. Here's a starting point."
    else:
        actions = []
        summary = "Tell me more about what you'd like to explore, or open a specific dataset to run analysis."
    return actions, summary, False


async def plan_turn(
    ctx: ChatContext, question: str, history, available_actions: list[str]
) -> tuple[list[ChatAction], str, bool]:
    """CALL A — choose proposed actions. Returns (actions, summary, ai_available)."""
    try:
        data = await complete_json(_SYSTEM_INTENT, _user_intent(ctx, question, history, available_actions))
        raw_actions = data.get("actions", []) if isinstance(data, dict) else []
        known = set(available_actions)
        actions: list[ChatAction] = []
        for a in raw_actions or []:
            if not isinstance(a, dict):
                continue
            if a.get("type") not in known:
                continue  # drop actions outside the catalog
            actions.append(ChatAction(
                type=a["type"],
                question=a.get("question"),
                dataset_id=a.get("dataset_id"),
                hints=a.get("hints"),
                scope=a.get("scope"),
            ))
        summary = str(data.get("summary", "")) if isinstance(data, dict) else ""
        return actions, summary, True
    except Exception:
        return _fallback_turn(ctx, question)


async def stream_narrative(
    ctx: ChatContext, question: str, actions: list[ChatAction], summary: str
) -> AsyncGenerator[str, None]:
    """CALL B — stream the conversational answer live over SSE."""
    actions_desc = "; ".join(
        f"{a.type}" + (f" ({a.question})" if a.question else "") for a in actions
    ) or "none"
    user_prompt = json.dumps(
        {
            "question": question,
            "plan_summary": summary,
            "actions_i_will_take": actions_desc,
            "facts": ctx.model_dump(mode="json"),
        },
        indent=2,
    )
    try:
        async for token in complete_stream(_SYSTEM_NARRATIVE, user_prompt):
            yield token
    except Exception:
        # Graceful degradation: a single static line so the turn still completes.
        yield (
            "I'm having trouble generating a detailed answer right now, but I've "
            "prepared the analysis actions below for you to review."
        )
