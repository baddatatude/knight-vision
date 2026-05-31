"""Query OpenAI organization usage and costs (requires admin API key)."""

from __future__ import annotations

import time
from typing import Any

import httpx

from config import openai_admin_key, openai_api_key

API_BASE = "https://api.openai.com/v1"


def usage_api_key() -> tuple[str | None, str]:
    """Return (key, kind) where kind is 'admin' or 'project'."""
    admin = openai_admin_key()
    if admin:
        return admin, "admin"
    project = openai_api_key()
    if project:
        return project, "project"
    return None, "none"


class OpenAIUsageError(RuntimeError):
    def __init__(self, message: str, *, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


def _encode_params(params: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, value in params.items():
        if value is None:
            continue
        out[key] = value
    return out


def _request(path: str, params: dict[str, Any], api_key: str) -> dict:
    url = f"{API_BASE}/{path}"
    try:
        response = httpx.get(
            url,
            params=_encode_params(params),
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=30.0,
        )
        response.raise_for_status()
        return response.json()
    except httpx.HTTPStatusError as e:
        try:
            detail = e.response.json().get("error", e.response.text)
        except Exception:  # noqa: BLE001
            detail = e.response.text
        raise OpenAIUsageError(str(detail), status=e.response.status_code) from e


def _paginate(path: str, params: dict[str, Any], api_key: str) -> list[dict]:
    rows: list[dict] = []
    page = params.get("page")
    while True:
        call_params = dict(params)
        if page:
            call_params["page"] = page
        data = _request(path, call_params, api_key)
        rows.extend(data.get("data", []))
        if not data.get("has_more"):
            break
        page = data.get("next_page")
        if not page:
            break
    return rows


def fetch_costs(
    *,
    days: int = 30,
    group_by: list[str] | None = None,
    admin_key: str | None = None,
) -> list[dict]:
    """Daily cost buckets from GET /organization/costs."""
    key = admin_key or usage_api_key()[0]
    if not key:
        raise OpenAIUsageError(
            "No OpenAI key in .env. Set OPENAI_API_KEY and/or OPENAI_ADMIN_KEY."
        )
    now = int(time.time())
    params: dict[str, Any] = {
        "start_time": now - days * 86400,
        "end_time": now,
        "bucket_width": "1d",
        "limit": min(days, 180),
    }
    if group_by:
        params["group_by"] = group_by
    try:
        buckets = _paginate("organization/costs", params, key)
    except OpenAIUsageError as e:
        if e.status == 403:
            raise OpenAIUsageError(
                "Your key cannot read organization usage (needs api.usage.read). "
                "Add OPENAI_ADMIN_KEY to .env — create at "
                "platform.openai.com/settings/organization/admin-keys"
            ) from e
        raise
    rows: list[dict] = []
    for bucket in buckets:
        day = time.strftime("%Y-%m-%d", time.gmtime(bucket["start_time"]))
        for result in bucket.get("results") or []:
            amount = result.get("amount") or {}
            rows.append(
                {
                    "date": day,
                    "line_item": result.get("line_item"),
                    "project_id": result.get("project_id"),
                    "api_key_id": result.get("api_key_id"),
                    "cost_usd": amount.get("value"),
                    "currency": amount.get("currency", "usd"),
                }
            )
    return rows


def fetch_completions_usage(
    *,
    days: int = 30,
    group_by: list[str] | None = None,
    admin_key: str | None = None,
) -> list[dict]:
    """Daily completion token usage from GET /organization/usage/completions."""
    key = admin_key or usage_api_key()[0]
    if not key:
        raise OpenAIUsageError("No OpenAI key in .env.")
    now = int(time.time())
    params: dict[str, Any] = {
        "start_time": now - days * 86400,
        "end_time": now,
        "bucket_width": "1d",
        "limit": min(days, 31),
    }
    if group_by:
        params["group_by"] = group_by
    try:
        buckets = _paginate("organization/usage/completions", params, key)
    except OpenAIUsageError as e:
        if e.status == 403:
            raise OpenAIUsageError(
                "Your key cannot read organization usage (needs api.usage.read). "
                "Add OPENAI_ADMIN_KEY to .env."
            ) from e
        raise
    rows: list[dict] = []
    for bucket in buckets:
        day = time.strftime("%Y-%m-%d", time.gmtime(bucket["start_time"]))
        for result in bucket.get("results") or []:
            rows.append(
                {
                    "date": day,
                    "model": result.get("model"),
                    "project_id": result.get("project_id"),
                    "api_key_id": result.get("api_key_id"),
                    "requests": result.get("num_model_requests", 0),
                    "input_tokens": result.get("input_tokens", 0),
                    "output_tokens": result.get("output_tokens", 0),
                }
            )
    return rows
