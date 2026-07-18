"""Thin LLM client — the ONLY module that talks to an LLM.

It is provider-aware: `settings.LLM_PROVIDER` selects OpenRouter (OpenAI-
compatible `/chat/completions`) or Gemini (Google `generativelanguage` API).
Both backends raise on a missing key or any API error so callers can fall back
to deterministic results — the application core must never depend on the LLM
being available. No caller needs to know which provider is active.
"""
from __future__ import annotations

import json
from collections.abc import AsyncGenerator

import httpx

from app.core.config import settings


def _provider() -> str:
    return (settings.LLM_PROVIDER or "openrouter").lower()


def _strip_fences(text: str) -> str:
    """Drop a ```json ... ``` wrapper if the model returned one anyway."""
    t = text.strip()
    if t.startswith("```"):
        t = t.split("```", 2)[1]
        if t.lstrip().lower().startswith("json"):
            t = t.lstrip()[4:]
    return t.strip()


# --------------------------------------------------------------------------- #
# OpenRouter (OpenAI-compatible)
# --------------------------------------------------------------------------- #
async def _openrouter_complete_json(
    system_prompt: str, user_prompt: str, model: str
) -> dict:
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
        return json.loads(_strip_fences(content))


async def _openrouter_complete_stream(
    system_prompt: str, user_prompt: str, model: str
) -> AsyncGenerator[str, None]:
    async with httpx.AsyncClient(timeout=90.0) as client:
        async with client.stream(
            "POST",
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
                "stream": True,
                "temperature": 0.2,
            },
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line or not line.startswith("data:"):
                    continue
                payload = line[len("data:"):].strip()
                if payload == "[DONE]":
                    break
                try:
                    data = json.loads(payload)
                except json.JSONDecodeError:
                    continue
                delta = data.get("choices", [{}])[0].get("delta", {})
                content = delta.get("content")
                if content:
                    yield content


# --------------------------------------------------------------------------- #
# Gemini (Google AI Studio)
# --------------------------------------------------------------------------- #
async def _gemini_complete_json(
    system_prompt: str, user_prompt: str, model: str
) -> dict:
    url = (
        f"{settings.GEMINI_BASE_URL}/models/{model}:generateContent"
        f"?key={settings.GEMINI_API_KEY}"
    )
    payload = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.2,
        },
    }
    async with httpx.AsyncClient(timeout=90.0) as client:
        resp = await client.post(
            url, headers={"Content-Type": "application/json"}, json=payload
        )
        resp.raise_for_status()
        data = resp.json()
    candidates = data.get("candidates") or []
    if not candidates:
        raise RuntimeError("Gemini returned no candidates")
    text = candidates[0]["content"]["parts"][0]["text"]
    return json.loads(_strip_fences(text))


async def _gemini_complete_stream(
    system_prompt: str, user_prompt: str, model: str
) -> AsyncGenerator[str, None]:
    url = (
        f"{settings.GEMINI_BASE_URL}/models/{model}:streamGenerateContent"
        f"?alt=sse&key={settings.GEMINI_API_KEY}"
    )
    payload = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "generationConfig": {"temperature": 0.2},
    }
    async with httpx.AsyncClient(timeout=90.0) as client:
        async with client.stream(
            "POST", url, headers={"Content-Type": "application/json"}, json=payload
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line or not line.startswith("data:"):
                    continue
                payload_str = line[len("data:"):].strip()
                if not payload_str or payload_str == "[DONE]":
                    continue
                try:
                    data = json.loads(payload_str)
                except json.JSONDecodeError:
                    continue
                parts = (
                    data.get("candidates", [{}])[0]
                    .get("content", {})
                    .get("parts", [])
                )
                for part in parts:
                    # Skip "thought" parts (Gemini reasoning tokens) — they carry
                    # no displayable text.
                    if "text" in part and not part.get("thought"):
                        yield part["text"]


# --------------------------------------------------------------------------- #
# Public API — provider dispatch
# --------------------------------------------------------------------------- #
async def complete_json(
    system_prompt: str, user_prompt: str, model: str | None = None
) -> dict:
    """Return a parsed JSON object from the LLM. Raises on any failure."""
    if _provider() == "gemini":
        if not settings.GEMINI_API_KEY:
            raise RuntimeError("GEMINI_API_KEY is not configured")
        return await _gemini_complete_json(
            system_prompt, user_prompt, model or settings.GEMINI_MODEL
        )
    if not settings.OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY is not configured")
    return await _openrouter_complete_json(
        system_prompt, user_prompt, model or settings.OPENROUTER_MODEL
    )


async def complete_stream(
    system_prompt: str, user_prompt: str, model: str | None = None
) -> AsyncGenerator[str, None]:
    """Yield text deltas from the LLM. Raises on a missing key or API error.

    Never returns raw data; callers fall back to a deterministic, non-streamed
    answer on failure.
    """
    if _provider() == "gemini":
        if not settings.GEMINI_API_KEY:
            raise RuntimeError("GEMINI_API_KEY is not configured")
        async for token in _gemini_complete_stream(
            system_prompt, user_prompt, model or settings.GEMINI_MODEL
        ):
            yield token
        return
    if not settings.OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY is not configured")
    async for token in _openrouter_complete_stream(
        system_prompt, user_prompt, model or settings.OPENROUTER_MODEL
    ):
        yield token
