"""Request validation for FEN and UCI move lists."""

from __future__ import annotations

import re

import chess
from fastapi import HTTPException

_UCI_RE = re.compile(r"^[a-h][1-8][a-h][1-8][qrbn]?$")


def validate_fen(fen: str) -> chess.Board:
    if not fen or not isinstance(fen, str):
        raise HTTPException(status_code=400, detail="FEN is required")
    fen = fen.strip()
    if len(fen) > 120:
        raise HTTPException(status_code=400, detail="FEN is too long")
    try:
        board = chess.Board(fen)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid FEN: {e}") from e
    if not board.is_valid():
        raise HTTPException(
            status_code=400,
            detail="Invalid position: illegal piece placement or missing kings",
        )
    return board


def validate_moves_uci(moves_uci: list[str]) -> list[str]:
    if len(moves_uci) > 500:
        raise HTTPException(status_code=400, detail="Too many moves in line (max 500)")
    out: list[str] = []
    for i, raw in enumerate(moves_uci):
        if not isinstance(raw, str):
            raise HTTPException(status_code=400, detail=f"Move {i + 1} must be a string")
        uci = raw.strip().lower()
        if not _UCI_RE.fullmatch(uci):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid UCI at move {i + 1}: {raw!r}",
            )
        out.append(uci)
    return out
