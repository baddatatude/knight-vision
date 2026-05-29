"""Narrate Stockfish PV using OpenAI (key from .env)."""

from __future__ import annotations

import json
import re

import chess
from openai import OpenAI

from config import openai_api_key
from pv_plan import build_plan_steps, plan_facts_for_prompt


def _max_tokens_for_line(num_steps: int) -> int:
    """Allow ~120 tokens per move plus intro/summary."""
    return min(4000, 280 + num_steps * 140)


def explain_plan_narrative(
    start_fen: str,
    pv_uci: list[str],
    cp_white: int | None,
    mate_white: int | None,
    user_color: chess.Color = chess.WHITE,
) -> dict[str, str | list[dict[str, str | int]]]:
    """
    Return intro, per-ply explanations, summary, and a combined narrative string.
    """
    key = openai_api_key()
    if not key:
        raise RuntimeError("OPENAI_API_KEY not set in .env")

    steps = build_plan_steps(start_fen, pv_uci, user_color)
    facts = plan_facts_for_prompt(start_fen, steps, cp_white, mate_white, user_color)
    side = "White" if user_color == chess.WHITE else "Black"
    n = len(steps)

    client = OpenAI(api_key=key)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        temperature=0.45,
        max_tokens=_max_tokens_for_line(n),
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "system",
                "content": (
                    "You explain a chess engine's predicted main line to a student learning "
                    "from Stockfish. Use ONLY the facts in PLAN_FACTS. Do not invent moves, "
                    "squares, or tactics that are not supported by the facts.\n\n"
                    f"The student plays {side}. In all move explanations use first person "
                    "for the student ('I', 'my') and second person for the opponent ('you', 'your').\n\n"
                    "Return valid JSON with this exact shape:\n"
                    "{\n"
                    '  "intro": "2-3 sentences: what the engine is trying to do from this position '
                    'and the eval/mate if given.",\n'
                    '  "moves": [\n'
                    '    {"ply": 1, "explanation": "2-4 sentences for this move only: what piece '
                    "moves where, captures/trades, checks, forks, and why the engine likes it "
                    '(threats, limiting replies, material). Mention legal move count if given."},\n'
                    "    ...one entry per ply in the facts...\n"
                    "  ],\n"
                    '  "summary": "2-3 sentences: how the line ends and what the engine expects overall."\n'
                    "}\n\n"
                    "Each move explanation must be self-contained so a student reading only that "
                    "paragraph understands that step. Be concrete (squares, piece types, captures). "
                    "Assume both sides follow this exact line."
                ),
            },
            {
                "role": "user",
                "content": f"PLAN_FACTS:\n{facts}",
            },
        ],
    )
    raw = (response.choices[0].message.content or "").strip()
    parsed = _parse_explain_json(raw, n)

    intro = str(parsed.get("intro", "")).strip()
    summary = str(parsed.get("summary", "")).strip()
    move_rows = parsed.get("moves") if isinstance(parsed.get("moves"), list) else []

    by_ply: dict[int, str] = {}
    for row in move_rows:
        if not isinstance(row, dict):
            continue
        ply = row.get("ply")
        text = str(row.get("explanation", "")).strip()
        if isinstance(ply, int) and text:
            by_ply[ply] = text

    step_explanations: list[dict[str, str | int]] = []
    narrative_parts: list[str] = []
    if intro:
        narrative_parts.append(intro)

    for s in steps:
        ply = s["ply"]
        text = by_ply.get(ply, "")
        if not text:
            text = _fallback_step_blurb(s)
        step_explanations.append({"ply": ply, "explanation": text})
        who = "I" if s["perspective"] == "user" else "You"
        narrative_parts.append(f"{ply}. ({who} {s['san']}) {text}")

    if summary:
        narrative_parts.append(f"Overall: {summary}")

    narrative = "\n\n".join(narrative_parts)

    return {
        "intro": intro,
        "summary": summary,
        "step_explanations": step_explanations,
        "narrative": narrative,
    }


def _parse_explain_json(raw: str, expected_steps: int) -> dict:
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass
    # Loose recovery if model wraps JSON in markdown
    match = re.search(r"\{[\s\S]*\}", raw)
    if match:
        try:
            data = json.loads(match.group())
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            pass
    return {
        "intro": "Could not parse model response as JSON.",
        "moves": [],
        "summary": raw[:500] if raw else "",
    }


def _fallback_step_blurb(step: dict) -> str:
    who = "I" if step["perspective"] == "user" else "You"
    parts = [f"{who} play {step['san']}."]
    if step.get("is_capture") and step.get("captured_type"):
        parts.append(f"This captures the {step['captured_type']}.")
    if step.get("is_check"):
        n = step.get("legal_moves_count")
        if n is not None:
            parts.append(f"You are in check with {n} legal replies.")
        else:
            parts.append("This gives check.")
    return " ".join(parts)


def attach_explanations_to_steps(
    steps: list[dict], explain_result: dict
) -> list[dict]:
    by_ply = {
        int(row["ply"]): str(row["explanation"])
        for row in explain_result.get("step_explanations", [])
        if isinstance(row, dict) and "ply" in row
    }
    out: list[dict] = []
    for s in steps:
        copy = dict(s)
        copy["explanation"] = by_ply.get(s["ply"], "")
        out.append(copy)
    return out
