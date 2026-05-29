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
