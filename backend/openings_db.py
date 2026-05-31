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


def _opening_payload(result: dict) -> dict:
    return {
        "eco": result.get("eco"),
        "name": result.get("name"),
        "san_moves": result.get("san_moves", []),
        "plies_matched": result.get("plies_matched", 0),
        "line_depth": result.get("line_depth"),
    }


def _best_side_opening(uci_moves: list[str], prefix_lengths: range) -> dict | None:
    """Pick the most specific in-book name for alternating prefix lengths."""
    best: dict | None = None
    for n in prefix_lengths:
        if n > len(uci_moves):
            break
        result = classify_opening(uci_moves[:n])
        name = result.get("name")
        if name in ("Out of book", "Starting position"):
            continue
        if best is None or result["plies_matched"] >= best["plies_matched"]:
            best = result
    return _opening_payload(best) if best else None


def classify_side_openings(uci_moves: list[str]) -> dict:
    """
    Full line plus best in-book labels after White's moves (1,3,5…) and
    Black's moves (2,4,6…).
    """
    full = classify_opening(uci_moves)
    white = _best_side_opening(uci_moves, range(1, len(uci_moves) + 1, 2))
    black = _best_side_opening(uci_moves, range(2, len(uci_moves) + 1, 2))
    return {
        "line": _opening_payload(full),
        "white": white,
        "black": black,
    }
