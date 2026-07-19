"""In-memory sliding-window rate limiter for high-risk endpoints.

Stateless-deployment note: this is per-process only, so it must not be treated
as a global guarantee behind multiple workers/replicas. It throttles the common
single-instance case (brute-force login, chat-flood, upload spam) without adding
a Redis dependency. Swap for a shared store if/when the API is horizontally
scaled.
"""
from __future__ import annotations

import bisect
import time

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


class RateLimiter:
    def __init__(self, limit: int, window_s: int) -> None:
        self.limit = limit
        self.window_s = window_s
        self._hits: dict[str, list[float]] = {}

    def _cleanup(self) -> None:
        # Bound memory on long-running servers; keep only the most recent keys.
        if len(self._hits) > 1000:
            # Drop the oldest third of keys (cheap, approximate).
            drop = sorted(self._hits)[: max(1, len(self._hits) // 3)]
            for k in drop:
                self._hits.pop(k, None)

    def is_allowed(self, key: str) -> bool:
        now = time.time()
        window_start = now - self.window_s
        hits = self._hits.setdefault(key, [])
        # Drop timestamps outside the sliding window.
        idx = bisect.bisect_left(hits, window_start)
        if idx > 0:
            del hits[:idx]
        if len(hits) >= self.limit:
            return False
        hits.append(now)
        self._cleanup()
        return True

    def retry_after(self, key: str) -> int:
        hits = self._hits.get(key, [])
        if not hits:
            return self.window_s
        oldest = hits[0]
        wait = int(self.window_s - (time.time() - oldest)) + 1
        return max(1, wait)


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class RateLimitMiddleware(BaseHTTPMiddleware):
    """FastAPI middleware that rate-limits by path prefix + client IP.

    Registered via ``app.add_middleware(RateLimitMiddleware, limiters=..., prefix=...)``
    — Starlette instantiates it as ``RateLimitMiddleware(app=app, **kwargs)``, so it
    must be a ``BaseHTTPMiddleware`` subclass (a plain ``(request, call_next)``
    function would raise ``TypeError: ... unexpected keyword argument 'app'``).
    """

    def __init__(
        self,
        app,
        limiters: dict[str, RateLimiter],
        prefix: str = "",
    ) -> None:
        super().__init__(app)
        self._limiters = limiters
        self._prefix = prefix

    async def dispatch(self, request: Request, call_next):
        # OPTIONS preflight must always pass through (CORS).
        if request.method == "OPTIONS":
            return await call_next(request)
        path = request.url.path
        for route_prefix, limiter in self._limiters.items():
            full = f"{self._prefix}{route_prefix}"
            if path.startswith(full):
                ip = _client_ip(request)
                key = f"{route_prefix}:{ip}"
                if not limiter.is_allowed(key):
                    return JSONResponse(
                        status_code=429,
                        content={"detail": "Too many requests. Please slow down."},
                        headers={"Retry-After": str(limiter.retry_after(key))},
                    )
                break
        return await call_next(request)
