"""Position analysis using python-chess: attacks, undefended pieces, legal moves."""

from __future__ import annotations

import chess


def _square_name(sq: int) -> str:
    return chess.SQUARE_NAMES[sq]


def attack_kind(board: chess.Board, sq: int) -> str:
    w = bool(board.attackers(chess.WHITE, sq))
    b = bool(board.attackers(chess.BLACK, sq))
    if w and b:
        return "both"
    if w:
        return "white"
    if b:
        return "black"
    return "none"


def compute_attack_map(board: chess.Board) -> dict[str, str]:
    return { _square_name(sq): attack_kind(board, sq) for sq in chess.SQUARES }


def compute_undefended(board: chess.Board) -> tuple[list[str], list[str]]:
    """Squares with friendly pieces that are not attacked by any friendly piece."""
    white: list[str] = []
    black: list[str] = []
    for sq in chess.SQUARES:
        piece = board.piece_at(sq)
        if piece is None:
            continue
        if not board.attackers(piece.color, sq):
            if piece.color == chess.WHITE:
                white.append(_square_name(sq))
            else:
                black.append(_square_name(sq))
    return white, black


def legal_moves_uci(board: chess.Board) -> list[str]:
    return [m.uci() for m in board.legal_moves]


def _piece_ref(board: chess.Board, sq: int) -> dict[str, str]:
    piece = board.piece_at(sq)
    if piece is None:
        raise ValueError(f"No piece on {chess.SQUARE_NAMES[sq]}")
    return {
        "square": _square_name(sq),
        "color": "white" if piece.color == chess.WHITE else "black",
        "type": piece.symbol().lower(),
    }


def piece_contacts_at(board: chess.Board, sq: int) -> dict | None:
    """
    For a occupied square: friendly pieces attacking it (defenders) and
    enemy pieces attacking it (attackers).
    """
    piece = board.piece_at(sq)
    if piece is None:
        return None
    enemy = chess.BLACK if piece.color == chess.WHITE else chess.WHITE
    defenders = [_piece_ref(board, s) for s in board.attackers(piece.color, sq)]
    attackers = [_piece_ref(board, s) for s in board.attackers(enemy, sq)]
    return {
        "square": _square_name(sq),
        "piece": {
            "color": "white" if piece.color == chess.WHITE else "black",
            "type": piece.symbol().lower(),
        },
        "defenders": defenders,
        "attackers": attackers,
    }


def compute_piece_threats(board: chess.Board) -> dict[str, list[str]]:
    """Squares each piece attacks (what it threatens)."""
    out: dict[str, list[str]] = {}
    for sq in chess.SQUARES:
        if board.piece_at(sq) is not None:
            out[_square_name(sq)] = [_square_name(s) for s in board.attacks(sq)]
    return out


def compute_piece_contacts(board: chess.Board) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for sq in chess.SQUARES:
        if board.piece_at(sq) is not None:
            contacts = piece_contacts_at(board, sq)
            if contacts:
                out[_square_name(sq)] = contacts
    return out
