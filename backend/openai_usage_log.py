"""Append-only log of OpenAI API calls across Knight Vision."""

from __future__ import annotations

import csv
import threading
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOG_PATH = ROOT / "data" / "openai_usage.csv"

PRICING = {
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "gpt-4o": {"input": 2.50, "output": 10.00},
}
DEFAULT_MODEL = "gpt-4o-mini"

COLUMNS = [
    "event_id",
    "source",
    "kind",
    "label",
    "time_utc",
    "model",
    "prompt_tokens",
    "completion_tokens",
    "total_tokens",
    "cost_usd",
]

_lock = threading.Lock()


def estimate_cost_usd(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    p = PRICING.get(model, PRICING[DEFAULT_MODEL])
    return (prompt_tokens * p["input"] + completion_tokens * p["output"]) / 1_000_000


def load_all() -> list[dict]:
    if not LOG_PATH.is_file():
        return []
    with LOG_PATH.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows: list[dict] = []
        for row in reader:
            rows.append(
                {
                    "event_id": int(row["event_id"]),
                    "source": row["source"],
                    "kind": row["kind"],
                    "label": row["label"],
                    "time_utc": row["time_utc"],
                    "model": row["model"],
                    "prompt_tokens": int(row["prompt_tokens"]),
                    "completion_tokens": int(row["completion_tokens"]),
                    "total_tokens": int(row["total_tokens"]),
                    "cost_usd": float(row["cost_usd"]),
                }
            )
        return rows


def log_call(
    *,
    kind: str,
    label: str,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    source: str = "backend",
) -> dict:
    """Append one API call row to the shared log."""
    total = prompt_tokens + completion_tokens
    cost = estimate_cost_usd(model, prompt_tokens, completion_tokens)
    with _lock:
        rows = load_all()
        next_id = max((r["event_id"] for r in rows), default=0) + 1
        event = {
            "event_id": next_id,
            "source": source,
            "kind": kind,
            "label": label,
            "time_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "model": model,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total,
            "cost_usd": round(cost, 6),
        }
        LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        write_header = not LOG_PATH.is_file() or LOG_PATH.stat().st_size == 0
        with LOG_PATH.open("a", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=COLUMNS)
            if write_header:
                writer.writeheader()
            writer.writerow(event)
        return event
