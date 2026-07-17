import asyncio
import os

import pytest

from app.services.llm import complete_stream


def test_complete_stream_yields_text(monkeypatch):
    # Stub httpx.AsyncClient to return an SSE stream without touching the network.
    class _Resp:
        def __init__(self): self.status_code = 200
        def raise_for_status(self): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def aiter_lines(self):
            yield 'data: {"choices":[{"delta":{"content":"Hello"}}]}'
            yield 'data: {"choices":[{"delta":{"content":" world"}}]}'
            yield "data: [DONE]"

    class _Client:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        def stream(self, *a, **k): return _Resp()
        async def post(self, *a, **k): return _Resp()

    monkeypatch.setattr("app.services.llm.httpx.AsyncClient", _Client)
    monkeypatch.setattr("app.services.llm.settings.OPENROUTER_API_KEY", "x")

    async def run():
        out = "".join([t async for t in complete_stream("s", "u")])
        return out
    assert asyncio.run(run()) == "Hello world"


def test_complete_stream_raises_without_key(monkeypatch):
    monkeypatch.setattr("app.services.llm.settings.OPENROUTER_API_KEY", "")
    with pytest.raises(RuntimeError):
        async def run():
            async for _ in complete_stream("s", "u"):
                pass
        asyncio.run(run())
