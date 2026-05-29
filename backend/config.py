"""Environment-driven settings (secrets stay server-side only)."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_ROOT / ".env")


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _env_int(name: str, default: int) -> int:
    raw = _env(name)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env_bool(name: str, default: bool) -> bool:
    raw = _env(name).lower()
    if not raw:
        return default
    return raw in ("1", "true", "yes", "on")


def openai_api_key() -> str | None:
    for name in ("OPENAI_API_KEY", "OPEN_AI_API_KEY"):
        key = _env(name)
        if key:
            return key
    return None


def api_host() -> str:
    return _env("API_HOST", "127.0.0.1")


def api_port() -> int:
    return _env_int("API_PORT", 8000)


def cors_origins() -> list[str]:
    """Comma-separated CORS_ORIGINS; merged with dev defaults when ENV=development."""
    extra = [o.strip() for o in _env("CORS_ORIGINS").split(",") if o.strip()]
    if _env("ENV", "development").lower() == "development":
        defaults = [
            "http://127.0.0.1:5173",
            "http://localhost:5173",
            "http://127.0.0.1:4173",
            "http://localhost:4173",
            "capacitor://localhost",
            "ionic://localhost",
        ]
        return list(dict.fromkeys(defaults + extra))
    return extra


def rate_limit_enabled() -> bool:
    return _env_bool("RATE_LIMIT_ENABLED", True)


def rate_limit_per_minute() -> int:
    return max(1, _env_int("RATE_LIMIT_PER_MINUTE", 120))
