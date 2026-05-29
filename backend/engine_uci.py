"""Stockfish (or any UCI engine) evaluation via python-chess."""

from __future__ import annotations

import os
import shutil
import threading
from typing import Any

import chess
import chess.engine

_engine: chess.engine.SimpleEngine | None = None
_engine_lock = threading.Lock()


def default_stockfish_path() -> str:
    return os.environ.get("STOCKFISH_PATH", "stockfish")


def resolved_engine_binary() -> str | None:
    """Return an executable path for the configured engine without starting it."""
    raw = default_stockfish_path()
    if os.path.isabs(raw) or os.sep in raw or raw.startswith("."):
        return raw if os.path.isfile(raw) and os.access(raw, os.X_OK) else None
    return shutil.which(raw)


def _open_engine(path: str) -> chess.engine.SimpleEngine:
    eng = chess.engine.SimpleEngine.popen_uci(path)
    # Stockfish defaults can reserve hundreds of MB for transposition tables.
    try:
        eng.configure({"Hash": 16, "Threads": 1})
    except chess.engine.EngineError:
        pass
    return eng


def get_engine() -> chess.engine.SimpleEngine:
    global _engine
    path = default_stockfish_path()
    with _engine_lock:
        if _engine is not None:
            return _engine
        _engine = _open_engine(path)
        return _engine


def reset_engine() -> None:
    """Close engine process (e.g. after path change)."""
    global _engine
    with _engine_lock:
        if _engine is not None:
            _engine.quit()
            _engine = None


def engine_analyse(fen: str, depth: int = 12, movetime_ms: int | None = None) -> dict[str, Any]:
    """Return score (White POV), best move, and principal variation from a single analyse call."""
    board = chess.Board(fen)
    engine = get_engine()
    limit: chess.engine.Limit = (
        chess.engine.Limit(time=movetime_ms / 1000.0)
        if movetime_ms is not None
        else chess.engine.Limit(depth=depth)
    )
    with _engine_lock:
        info = engine.analyse(board, limit)
    score = info["score"].white()
    pv_moves: list[chess.Move] = list(info.get("pv", []))
    best = pv_moves[0].uci() if pv_moves else None
    out: dict[str, Any] = {
        "bestmove_uci": best,
        "pv_uci": [m.uci() for m in pv_moves],
        "cp_white": None,
        "mate_white": None,
    }
    if score.is_mate():
        out["mate_white"] = score.mate()
    else:
        cp = score.score()
        out["cp_white"] = int(cp) if cp is not None else None
    return out
