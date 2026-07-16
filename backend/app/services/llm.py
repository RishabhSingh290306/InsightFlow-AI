"""Thin OpenRouter client for structured (JSON) completions.

This is the ONLY module that talks to the LLM. It raises on a missing key or
any API error so callers can fall back to deterministic results — the
application core must never depend on the LLM being available.
"""
from __future__ import annotations

import json

import httpx

from app.core.config import settings


async def complete_json(
    system_prompt: str, user_prompt: str, model: str | None = None
) -> dict:
    """Return a parsed JSON object from the LLM. Raises on any failure."""
    if not settings.OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY is not configured")

    model = model or settings.OPENROUTER_MODEL
    async with httpx.AsyncClient(timeout=90.0) as client:
        resp = await client.post(
            f"{settings.OPENROUTER_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://insightflow.ai",
                "X-Title": "InsightFlow AI",
            },
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.2,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        return json.loads(content)
