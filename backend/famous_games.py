"""Curated famous-game library for visual-awareness study lessons."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data" / "games"


@dataclass(frozen=True)
class FamousGame:
    id: str
    name: str
    white: str
    black: str
    event: str
    year: int
    pgn_file: str
    tags: tuple[str, ...] = ()


FAMOUS_GAMES: tuple[FamousGame, ...] = (
    FamousGame(
        id="opera",
        name="Opera Game",
        white="Paul Morphy",
        black="Duke of Brunswick & Count Isouard",
        event="Paris (simul)",
        year=1858,
        pgn_file="opera.pgn",
        tags=("attack", "development", "beginner"),
    ),
    FamousGame(
        id="fischer_byrne",
        name="Game of the Century",
        white="Donald Byrne",
        black="Bobby Fischer",
        event="Third Rosenwald Trophy",
        year=1956,
        pgn_file="fischer_byrne.pgn",
        tags=("sacrifice", "tactics", "youth"),
    ),
    FamousGame(
        id="rubinstein_rotlewi",
        name="Rubinstein's Immortal",
        white="Gersz Rotlewi",
        black="Akiba Rubinstein",
        event="Lodz",
        year=1907,
        pgn_file="rubinstein_rotlewi.pgn",
        tags=("sacrifice", "overload", "attack"),
    ),
    FamousGame(
        id="capablanca_tartakower",
        name="Capablanca vs Tartakower",
        white="Jose Capablanca",
        black="Savielly Tartakower",
        event="New York",
        year=1924,
        pgn_file="capablanca_tartakower.pgn",
        tags=("endgame", "technique", "positional"),
    ),
    FamousGame(
        id="tal_hecht",
        name="Tal vs Hecht",
        white="Mikhail Tal",
        black="Benjamin Hecht",
        event="Tel Aviv",
        year=1962,
        pgn_file="tal_hecht.pgn",
        tags=("attack", "sacrifice", "tal"),
    ),
    FamousGame(
        id="karpov_unzicker",
        name="Karpov vs Unzicker",
        white="Anatoly Karpov",
        black="Wolfgang Unzicker",
        event="Nice Olympiad",
        year=1974,
        pgn_file="karpov_unzicker.pgn",
        tags=("attack", "queen_sacrifice", "olympiad"),
    ),
    FamousGame(
        id="karpov_topalov_linares",
        name="Karpov's Immortal",
        white="Anatoly Karpov",
        black="Veselin Topalov",
        event="Linares",
        year=1994,
        pgn_file="karpov_topalov_linares.pgn",
        tags=("attack", "sacrifice", "positional"),
    ),
    FamousGame(
        id="kasparov_topalov",
        name="Kasparov vs Topalov",
        white="Garry Kasparov",
        black="Veselin Topalov",
        event="Wijk aan Zee",
        year=1999,
        pgn_file="kasparov_topalov.pgn",
        tags=("king_hunt", "attack", "classic"),
    ),
    FamousGame(
        id="carlsen_karjakin_g10",
        name="Carlsen vs Karjakin (WCC G10)",
        white="Magnus Carlsen",
        black="Sergey Karjakin",
        event="World Championship Game 10",
        year=2016,
        pgn_file="carlsen_karjakin_g10.pgn",
        tags=("endgame", "technique", "world_championship"),
    ),
    FamousGame(
        id="carlsen_nepo_g6",
        name="Carlsen vs Nepomniachtchi (WCC G6)",
        white="Magnus Carlsen",
        black="Ian Nepomniachtchi",
        event="World Championship Game 6",
        year=2021,
        pgn_file="carlsen_nepo_g6.pgn",
        tags=("endgame", "blunder", "world_championship"),
    ),
)


def get_famous_game(game_id: str) -> FamousGame:
    for g in FAMOUS_GAMES:
        if g.id == game_id:
            return g
    raise KeyError(f"Unknown game id: {game_id}")


def pgn_path(game: FamousGame) -> Path:
    return DATA_DIR / game.pgn_file


def catalog_dict() -> list[dict]:
    return [
        {
            "id": g.id,
            "name": g.name,
            "white": g.white,
            "black": g.black,
            "event": g.event,
            "year": g.year,
            "tags": list(g.tags),
        }
        for g in FAMOUS_GAMES
    ]
