"""Simple in-memory rate limit (per client IP). Replace with Redis in production."""

from __future__ import annotations

import time
from collections import defaultdict
from collections.abc import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from config import rate_limit_enabled, rate_limit_per_minute


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Token bucket per IP for API routes (placeholder for Redis-backed limiter)."""

    def __init__(self, app, *, limit_per_minute: int | None = None) -> None:
        super().__init__(app)
        self._limit = limit_per_minute or rate_limit_per_minute()
        self._hits: dict[str, list[float]] = defaultdict(list)

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if not rate_limit_enabled():
            return await call_next(request)
        path = request.url.path
        if not path.startswith("/api/"):
            return await call_next(request)
        if path in ("/api/health", "/api/openai/status", "/api/engine/status"):
            return await call_next(request)

        client = request.client.host if request.client else "unknown"
        now = time.monotonic()
        window = 60.0
        hits = self._hits[client]
        hits[:] = [t for t in hits if now - t < window]
        if len(hits) >= self._limit:
            return Response(
                content='{"detail":"Too many requests. Try again in a minute.","code":"rate_limited"}',
                status_code=429,
                media_type="application/json",
            )
        hits.append(now)
        return await call_next(request)
