"""OpenAI narration from visual board facts (not engine 'best move' commentary)."""

from __future__ import annotations

import json
import re

from openai import OpenAI

from config import openai_api_key
from famous_games import FamousGame
from openai_usage_log import log_call

BATCH_SIZE = 28


def explain_visual_lesson(
    game: FamousGame,
    ply_facts: dict[int, str],
    *,
    intro_context: str | None = None,
    brief: bool = False,
) -> dict:
    """
    Return intro, per-ply explanations, summary for selected plies.
    Uses only supplied VISUAL_FACTS — no invented tactics.
    """
    plies = sorted(ply_facts.keys())
    if not plies:
        return {
            "intro": "",
            "summary": "",
            "step_explanations": [],
            "by_ply": {},
            "narrative": "",
            "usage": {"prompt_tokens": 0, "completion_tokens": 0},
        }

    brief = brief or len(plies) > 12
    by_ply: dict[int, str] = {}
    intro = ""
    summary = ""
    usage = {"prompt_tokens": 0, "completion_tokens": 0}

    for offset in range(0, len(plies), BATCH_SIZE):
        batch_plies = plies[offset : offset + BATCH_SIZE]
        batch_facts = {p: ply_facts[p] for p in batch_plies}
        chunk = _explain_batch(
            game,
            batch_facts,
            batch_plies,
            intro_context=intro_context if offset == 0 else None,
            include_intro=offset == 0,
            include_summary=offset + BATCH_SIZE >= len(plies),
            brief=brief,
        )
        by_ply.update(chunk["by_ply"])
        if chunk.get("intro"):
            intro = chunk["intro"]
        if chunk.get("summary"):
            summary = chunk["summary"]
        usage["prompt_tokens"] += chunk["usage"]["prompt_tokens"]
        usage["completion_tokens"] += chunk["usage"]["completion_tokens"]

    step_explanations = [{"ply": p, "explanation": by_ply.get(p, "")} for p in plies]
    narrative_parts = []
    if intro:
        narrative_parts.append(intro)
    for p in plies:
        if by_ply.get(p):
            narrative_parts.append(f"Ply {p}: {by_ply[p]}")
    if summary:
        narrative_parts.append(f"Overall: {summary}")
    return {
        "intro": intro,
        "summary": summary,
        "step_explanations": step_explanations,
        "by_ply": by_ply,
        "narrative": "\n\n".join(narrative_parts),
        "usage": usage,
    }


def _explain_batch(
    game: FamousGame,
    ply_facts: dict[int, str],
    plies: list[int],
    *,
    intro_context: str | None,
    include_intro: bool,
    include_summary: bool,
    brief: bool,
) -> dict:
    key = openai_api_key()
    if not key:
        raise RuntimeError("OPENAI_API_KEY not set in .env")

    facts_block = "\n\n".join(
        f"--- Ply {ply} ---\n{ply_facts[ply]}" for ply in plies
    )
    context = (
        f"Game: {game.name} ({game.year}). {game.white} vs {game.black}. "
        f"Event: {game.event}."
    )
    if intro_context:
        context += " " + intro_context

    if brief:
        move_rule = (
            "- Every ply in VISUAL_FACTS must appear in \"moves\" with an explanation.\n"
            "- Quiet moves: 1 short sentence. Tactical plies (capture, check, fork, "
            "hanging pieces): 2 sentences max.\n"
        )
        move_example = (
            '  "moves": [{"ply": <exact ply from VISUAL_FACTS header>, '
            '"explanation": "1-2 sentences"}, ...],\n'
        )
    else:
        move_rule = (
            "- Every ply in VISUAL_FACTS must appear in \"moves\" with an explanation.\n"
            "- Write 2-4 sentences per move.\n"
        )
        move_example = (
            '  "moves": [{"ply": <exact ply from VISUAL_FACTS header>, '
            '"explanation": "2-4 sentences"}, ...],\n'
        )

    json_parts = []
    if include_intro:
        json_parts.append(
            '  "intro": "2-3 sentences about visual themes to watch in this game",'
        )
    json_parts.append(f'  "moves": [{{"ply": ..., "explanation": "..."}}, ...],')
    if include_summary:
        json_parts.append(
            '  "summary": "2-3 sentences on how board pressure evolved"'
        )

    client = OpenAI(api_key=key)
    per_move_tokens = 35 if brief else 120
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        temperature=0.4,
        max_tokens=min(16000, 300 + len(plies) * per_move_tokens + (200 if include_intro else 0)),
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "system",
                "content": (
                    "You teach chess visual awareness to a ~1400-rated player studying "
                    "a famous game.\n\n"
                    "Rules:\n"
                    "- Use ONLY facts in VISUAL_FACTS. Do not invent squares, pieces, "
                    "or counts not stated there.\n"
                    "- Do NOT say whether a move was 'best' or compare to engine lines.\n"
                    "- Focus on: square control near the king, hanging pieces removed or "
                    "created, new threats, forks, checks, captures.\n"
                    "- Write in clear, encouraging English.\n"
                    f"{move_rule}\n"
                    "Return JSON:\n"
                    "{\n"
                    + "\n".join(json_parts)
                    + "\n}"
                ),
            },
            {
                "role": "user",
                "content": f"CONTEXT:\n{context}\n\nVISUAL_FACTS:\n{facts_block}",
            },
        ],
    )
    raw = (response.choices[0].message.content or "").strip()
    parsed = _parse_json(raw)
    intro = str(parsed.get("intro", "")).strip() if include_intro else ""
    summary = str(parsed.get("summary", "")).strip() if include_summary else ""
    move_rows = parsed.get("moves") if isinstance(parsed.get("moves"), list) else []
    by_ply: dict[int, str] = {}
    ordered_texts: list[str] = []
    for row in move_rows:
        if isinstance(row, dict) and isinstance(row.get("ply"), int):
            text = str(row.get("explanation", "")).strip()
            if text:
                by_ply[int(row["ply"])] = text
                ordered_texts.append(text)
    if plies and ordered_texts and not set(by_ply).intersection(plies):
        if len(ordered_texts) == len(plies):
            by_ply = {p: t for p, t in zip(plies, ordered_texts)}
    prompt_tokens = response.usage.prompt_tokens if response.usage else 0
    completion_tokens = response.usage.completion_tokens if response.usage else 0
    log_call(
        kind="study_lesson_batch",
        label=f"{game.id} plies {plies[0]}-{plies[-1]} ({len(plies)} moves)",
        model="gpt-4o-mini",
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        source="generate_lessons",
    )
    return {
        "intro": intro,
        "summary": summary,
        "by_ply": by_ply,
        "usage": {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
        },
    }


def _parse_json(raw: str) -> dict:
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{[\s\S]*\}", raw)
    if match:
        try:
            data = json.loads(match.group())
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            pass
    return {"intro": "", "moves": [], "summary": raw[:500]}
