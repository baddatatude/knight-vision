"""Build study lessons from famous-game PGN + visual deltas (+ optional OpenAI)."""

from __future__ import annotations

import json
from pathlib import Path

import chess

from famous_games import FamousGame, get_famous_game, pgn_path
from pgn_io import load_pgn_game, mainline_uci
from pv_plan import _detect_fork, _piece_word
from visual_delta import (
    delta_facts_for_prompt,
    delta_interest_score,
    visual_delta,
)

LESSONS_DIR = Path(__file__).resolve().parent / "data" / "lessons"


def _step_from_move(
    board_before: chess.Board,
    move: chess.Move,
    ply: int,
    explanation: str = "",
) -> dict:
    mover = board_before.turn
    from_sq = chess.square_name(move.from_square)
    to_sq = chess.square_name(move.to_square)
    piece_before = board_before.piece_at(move.from_square)
    piece_name = _piece_word(piece_before.piece_type) if piece_before else "piece"
    san = board_before.san(move)
    is_capture = board_before.is_capture(move)
    captured_type: str | None = None
    if is_capture:
        if board_before.is_en_passant(move):
            captured_type = "pawn"
        else:
            cap = board_before.piece_at(move.to_square)
            if cap:
                captured_type = _piece_word(cap.piece_type)
    board_after = board_before.copy()
    board_after.push(move)
    fork = _detect_fork(board_after, mover)
    events: list[dict] = []
    if is_capture and captured_type:
        events.append({"type": "capture", "piece": captured_type})
    if board_after.is_check():
        events.append({"type": "check"})
    if fork:
        events.append({"type": "fork", **fork})
    return {
        "ply": ply,
        "uci": move.uci(),
        "san": san,
        "from_square": from_sq,
        "to_square": to_sq,
        "piece_moved": piece_name,
        "fen": board_after.fen(),
        "mover": "white" if mover == chess.WHITE else "black",
        "perspective": "user",
        "is_capture": is_capture,
        "captured_type": captured_type,
        "is_check": board_after.is_check(),
        "legal_moves_count": board_after.legal_moves.count(),
        "events": events,
        "explanation": explanation,
        "visual_interest": 0,
    }


def build_game_steps(game: FamousGame, explanations: dict[int, str] | None = None) -> list[dict]:
    """One step per ply; explanations keyed by ply number."""
    explanations = explanations or {}
    pgn_game = load_pgn_game(pgn_path(game))
    board = pgn_game.board()
    steps: list[dict] = []
    for ply, move in enumerate(pgn_game.mainline_moves(), start=1):
        step = _step_from_move(board, move, ply, explanations.get(ply, ""))
        trial = board.copy()
        trial.push(move)
        delta = visual_delta(board, trial, move, board.turn)
        step["visual_interest"] = delta_interest_score(delta)
        steps.append(step)
        board.push(move)
    return steps


def select_annotation_plies(steps: list[dict], max_annotations: int = 12) -> list[int]:
    if max_annotations <= 0:
        return [s["ply"] for s in steps]
    ranked = sorted(
        ((s["ply"], s.get("visual_interest", 0)) for s in steps),
        key=lambda x: x[1],
        reverse=True,
    )
    chosen: list[int] = []
    for ply, score in ranked:
        if score < 4:
            break
        chosen.append(ply)
        if len(chosen) >= max_annotations:
            break
    if not chosen and steps:
        chosen = [steps[0]["ply"], steps[-1]["ply"]]
    return sorted(set(chosen))


def _step_has_tactical_event(step: dict) -> bool:
    if step.get("is_capture") or step.get("is_check"):
        return True
    return any(ev.get("type") == "fork" for ev in step.get("events") or [])


def compute_step_labels(step: dict, key_plies: set[int]) -> list[str]:
    labels: list[str] = []
    if step.get("is_capture"):
        labels.append("capture")
    if step.get("is_check"):
        labels.append("check")
    if any(ev.get("type") == "fork" for ev in step.get("events") or []):
        labels.append("fork")
    if step["ply"] in key_plies:
        labels.append("key")
    return labels


def compute_highlight_plies(steps: list[dict], max_key: int = 12) -> list[int]:
    """Noteworthy plies: tactical events plus top visual-interest moments."""
    key_plies = set(select_annotation_plies(steps, max_annotations=max_key))
    highlight = set(key_plies)
    for step in steps:
        if _step_has_tactical_event(step):
            highlight.add(step["ply"])
    if steps:
        highlight.add(steps[0]["ply"])
        highlight.add(steps[-1]["ply"])
    return sorted(highlight)


def enrich_lesson(lesson: dict) -> dict:
    """Add per-step labels and highlight_plies for study navigation."""
    steps = lesson.get("steps") or []
    if not steps:
        return lesson
    key_plies = set(select_annotation_plies(steps, max_annotations=12))
    highlight_plies = compute_highlight_plies(steps)
    enriched_steps: list[dict] = []
    for step in steps:
        copy = dict(step)
        copy["labels"] = compute_step_labels(step, key_plies)
        enriched_steps.append(copy)
    out = dict(lesson)
    out["steps"] = enriched_steps
    out["highlight_plies"] = highlight_plies
    return out


def fallback_step_explanation(step: dict) -> str:
    """One-line commentary when OpenAI skips a ply."""
    mover = "White" if step.get("mover") == "white" else "Black"
    san = step.get("san", "?")
    parts = [f"{mover} plays {san}."]
    if step.get("is_capture"):
        cap = step.get("captured_type") or "piece"
        parts.append(f"This captures a {cap}.")
    if step.get("is_check"):
        parts.append("Check.")
    for ev in step.get("events") or []:
        if ev.get("type") == "fork":
            parts.append("This creates a fork.")
            break
    return " ".join(parts)


def visual_facts_for_plies(game: FamousGame, plies: list[int]) -> dict[int, str]:
    pgn_game = load_pgn_game(pgn_path(game))
    board = pgn_game.board()
    out: dict[int, str] = {}
    for ply, move in enumerate(pgn_game.mainline_moves(), start=1):
        mover = board.turn
        if ply in plies:
            trial = board.copy()
            trial.push(move)
            delta = visual_delta(board, trial, move, mover)
            out[ply] = delta_facts_for_prompt(delta, ply)
        board.push(move)
    return out


def build_lesson_dict(
    game: FamousGame,
    *,
    explanations: dict[int, str] | None = None,
    intro: str | None = None,
    summary: str | None = None,
    annotation_plies: list[int] | None = None,
) -> dict:
    steps = build_game_steps(game, explanations)
    plies = annotation_plies or select_annotation_plies(steps)
    moves_uci = mainline_uci(pgn_path(game))
    return {
        "game_id": game.id,
        "title": game.name,
        "white": game.white,
        "black": game.black,
        "event": game.event,
        "year": game.year,
        "tags": list(game.tags),
        "start_fen": chess.STARTING_FEN,
        "moves_uci": moves_uci,
        "annotation_plies": plies,
        "intro": intro,
        "summary": summary,
        "steps": steps,
        "narrative": None,
        "explain_error": None,
    }


def finalize_lesson(lesson: dict) -> dict:
    return enrich_lesson(lesson)


def lesson_path(game_id: str) -> Path:
    return LESSONS_DIR / f"{game_id}.json"


def save_lesson(lesson: dict) -> Path:
    LESSONS_DIR.mkdir(parents=True, exist_ok=True)
    path = lesson_path(lesson["game_id"])
    path.write_text(json.dumps(lesson, indent=2), encoding="utf-8")
    return path


def load_lesson(game_id: str) -> dict:
    path = lesson_path(game_id)
    if not path.is_file():
        raise FileNotFoundError(f"No lesson for {game_id}")
    lesson = json.loads(path.read_text(encoding="utf-8"))
    return enrich_lesson(lesson)


def load_or_build_lesson(game_id: str) -> dict:
    try:
        return load_lesson(game_id)
    except FileNotFoundError:
        game = get_famous_game(game_id)
        lesson = enrich_lesson(build_lesson_dict(game))
        save_lesson(lesson)
        return lesson
