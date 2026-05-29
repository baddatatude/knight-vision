"""Structured API errors for engine and OpenAI failures."""

from __future__ import annotations

from fastapi import Request
from fastapi.responses import JSONResponse


class ServiceError(Exception):
    """Maps to a JSON body with `detail` and `code` for the frontend."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "service_error",
        status_code: int = 500,
    ) -> None:
        self.message = message
        self.code = code
        self.status_code = status_code
        super().__init__(message)


class EngineError(ServiceError):
    def __init__(self, message: str, *, code: str = "engine_error") -> None:
        super().__init__(message, code=code, status_code=503)


class OpenAIError(ServiceError):
    def __init__(self, message: str, *, code: str = "openai_error") -> None:
        super().__init__(message, code=code, status_code=502)


def register_exception_handlers(app) -> None:
    @app.exception_handler(ServiceError)
    async def service_error_handler(_request: Request, exc: ServiceError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.message, "code": exc.code},
        )
