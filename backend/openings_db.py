"""ECO opening names from move sequence (offline, via Openix bundled data)."""

from __future__ import annotations

import chess
from Openix import ChessOpeningsLibrary

_library: ChessOpeningsLibrary | None = None


def _get_library() -> ChessOpeningsLibrary:
    global _library
    if _library is None:
        lib = ChessOpeningsLibrary()
        lib.load_builtin_openings()
        _library = lib
    return _library


def _uci_list_to_san(uci_moves: list[str]) -> list[str]:
    board = chess.Board()
    san: list[str] = []
    for uci in uci_moves:
        uci = uci.strip()
        if len(uci) < 4:
            continue
        move = chess.Move.from_uci(uci)
        san.append(board.san(move))
        board.push(move)
    return san


def classify_opening(uci_moves: list[str]) -> dict:
    """
    Match the game's move list (from the starting position) to an ECO name.

    Returns eco code, human-readable name, SAN moves used, and ply count matched.
    """
    san = _uci_list_to_san(uci_moves)
    if not san:
        return {
            "eco": None,
            "name": "Starting position",
            "san_moves": [],
            "plies_matched": 0,
        }

    lib = _get_library()
    partial = lib.search_by_partial_moves(san)
    candidates = [o for o in partial if o.moves_list[: len(san)] == san]
    if not candidates:
        return {
            "eco": None,
            "name": "Out of book",
            "san_moves": san,
            "plies_matched": len(san),
        }

    best = min(candidates, key=lambda o: (o.moves_count, o.name))
    return {
        "eco": best.eco_code,
        "name": best.name,
        "san_moves": san,
        "plies_matched": len(san),
        "line_depth": best.moves_count,
    }
