"""Score a played move vs Stockfish best (centipawn loss + accuracy)."""

from __future__ import annotations

import math

import chess

from engine_uci import engine_analyse


def _side_score(cp_white: int | None, mate_white: int | None, color: chess.Color) -> float:
    """Higher = better for `color`. Mate scores dominate centipawns."""
    if mate_white is not None:
        if mate_white > 0:
            return 100_000 - mate_white if color == chess.WHITE else -100_000 + mate_white
        if mate_white < 0:
            return -100_000 - mate_white if color == chess.WHITE else 100_000 + mate_white
        return 0.0
    cp = cp_white if cp_white is not None else 0
    return float(cp) if color == chess.WHITE else float(-cp)


def _cp_loss(mover: chess.Color, best_after: dict, played_after: dict) -> int:
    best_s = _side_score(best_after.get("cp_white"), best_after.get("mate_white"), mover)
    played_s = _side_score(
        played_after.get("cp_white"),
        played_after.get("mate_white"),
        mover,
    )
    return max(0, int(round(best_s - played_s)))


def _classify(cp_loss: int) -> str:
    if cp_loss <= 0:
        return "best"
    if cp_loss <= 10:
        return "excellent"
    if cp_loss <= 25:
        return "good"
    if cp_loss <= 50:
        return "inaccuracy"
    if cp_loss <= 100:
        return "mistake"
    return "blunder"


def accuracy_percent_from_acpl(acpl: float) -> float:
    """Lichess-style game accuracy from average centipawn loss."""
    if acpl <= 0:
        return 100.0
    return round(103.1668 * math.exp(-0.04354 * acpl) * 10) / 10


def score_move(fen: str, played_uci: str, depth: int = 6) -> dict:
    """
    Compare `played_uci` to engine best from `fen`.
    Returns centipawn loss from the mover's perspective and move class.
    """
    board = chess.Board(fen)
    mover = board.turn
    try:
        move = chess.Move.from_uci(played_uci)
    except ValueError as e:
        raise ValueError(f"Invalid UCI: {played_uci}") from e
    if move not in board.legal_moves:
        raise ValueError(f"Illegal move {played_uci} for position")

    root = engine_analyse(fen, depth=depth)
    best_uci = root.get("bestmove_uci")
    if not best_uci:
        raise RuntimeError("Engine returned no best move")

    if played_uci == best_uci:
        return {
            "played_uci": played_uci,
            "best_uci": best_uci,
            "cp_loss": 0,
            "classification": "best",
            "accuracy_depth": depth,
            "mover": "white" if mover == chess.WHITE else "black",
        }

    board_best = board.copy()
    board_best.push(chess.Move.from_uci(best_uci))
    best_after = engine_analyse(board_best.fen(), depth=depth)

    board_played = board.copy()
    board_played.push(move)
    played_after = engine_analyse(board_played.fen(), depth=depth)

    cp_loss = _cp_loss(mover, best_after, played_after)
    return {
        "played_uci": played_uci,
        "best_uci": best_uci,
        "cp_loss": cp_loss,
        "classification": _classify(cp_loss),
        "accuracy_depth": depth,
        "mover": "white" if mover == chess.WHITE else "black",
    }
