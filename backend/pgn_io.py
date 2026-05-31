"""Load PGN games and extract mainline moves."""

from __future__ import annotations

import io
from pathlib import Path

import chess
import chess.pgn


def load_pgn_game(source: str | Path) -> chess.pgn.Game:
    text = Path(source).read_text(encoding="utf-8") if isinstance(source, Path) else source
    game = chess.pgn.read_game(io.StringIO(text))
    if game is None:
        raise ValueError("Could not parse PGN")
    return game


def mainline_uci(source: str | Path) -> list[str]:
    game = load_pgn_game(source)
    return [m.uci() for m in game.mainline_moves()]


def mainline_sans(source: str | Path) -> list[str]:
    game = load_pgn_game(source)
    board = game.board()
    sans: list[str] = []
    for move in game.mainline_moves():
        sans.append(board.san(move))
        board.push(move)
    return sans


def game_headers(source: str | Path) -> dict[str, str]:
    game = load_pgn_game(source)
    return dict(game.headers)


def write_clean_pgn(source: str | Path, dest: Path) -> None:
    """Write mainline-only PGN (no variations) to dest."""
    game = load_pgn_game(source)
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("w", encoding="utf-8") as f:
        exporter = chess.pgn.FileExporter(f)
        game.accept(exporter)
