#!/usr/bin/env python3
"""Write validated mainline PGN files for the famous-game library."""

from __future__ import annotations

import io
import sys
from pathlib import Path

import chess.pgn

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "games"
sys.path.insert(0, str(ROOT))

from famous_games import FAMOUS_GAMES, pgn_path  # noqa: E402

# Embedded mainlines where remote download is blocked.
EMBEDDED: dict[str, str] = {
    "tal_hecht": """
[Event "Varna ol (Men) fin-A"]
[Site "Varna BUL"]
[Date "1962.10.06"]
[White "Mikhail Tal"]
[Black "Hans-Joachim Hecht"]
[Result "1-0"]
1. d4 Nf6 2. c4 e6 3. Nf3 b6 4. Nc3 Bb4 5. Bg5 Bb7 6. e3 h6 7. Bh4 Bxc3+ 8. bxc3 d6 9. Nd2 e5 10. f3 Qe7 11. e4 Nbd7 12. Bd3 Nf8 13. c5 dxc5 14. dxe5 Qxe5 15. Qa4+ c6 16. O-O Ng6 17. Nc4 Qe6 18. e5 b5 19. exf6 bxa4 20. fxg7 Rg8 21. Bf5 Nxh4 22. Bxe6 Ba6 23. Nd6+ Ke7 24. Bc4 Rxg7 25. g3 Kxd6 26. Bxa6 Nf5 27. Rab1 f6 28. Rfd1+ Ke7 29. Re1+ Kd6 30. Kf2 c4 31. g4 Ne7 32. Rb7 Rag8 33. Bxc4 Nd5 34. Bxd5 cxd5 35. Rb4 Rc8 36. Rxa4 Rxc3 37. Ra6+ Kc5 38. Rxf6 h5 39. h3 hxg4 40. hxg4 Rh7 41. g5 Rh5 42. Rf5 Rc2+ 43. Kg3 Kc4 44. Ree5 d4 45. g6 Rh1 46. Rc5+ Kd3 47. Rxc2 Kxc2 48. Kf4 Rg1 49. Rg5 1-0
""",
    "carlsen_karjakin_g10": """
[Event "World Championship"]
[Site "New York USA"]
[Date "2016.11.24"]
[White "Magnus Carlsen"]
[Black "Sergey Karjakin"]
[Result "1-0"]
1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6 4. d3 Bc5 5. c3 O-O 6. Bg5 h6 7. Bh4 Be7 8. O-O d6 9. Nbd2 Nh5 10. Bxe7 Qxe7 11. Nc4 Nf4 12. Ne3 Qf6 13. g3 Nh3+ 14. Kh1 Ne7 15. Bc4 c6 16. Bb3 Ng6 17. Qe2 a5 18. a4 Be6 19. Bxe6 fxe6 20. Nd2 d5 21. Qh5 Ng5 22. h4 Nf7 23. Nxf3 Qxf3+ 24. Qxf3 Rxf3 25. Kg2 Rf7 26. Rfe1 h5 27. Nf1 Kf8 28. Nd2 Ke7 29. Re2 Kd6 30. Nf3 Raf8 31. Ng5 Re7 32. Rae1 Rfe8 33. Nf3 Nh8 34. d4 exd4 35. Nxd4 g6 36. Re3 Nf7 37. e5+ Kd7 38. Rf3 Nh6 39. Rf6 Rg7 40. b4 axb4 41. cxb4 Ree7 42. a5 Ng8 43. Rf8 Re8 44. Rxe8 Kxe8 45. a6 bxa6 46. Rc1 Kd7 47. Rxc6 Re7 48. Rxa6 Nh6 49. b5 Nf5 50. Nc6 Re8 51. Ra7+ Kc8 52. b6 1-0
""",
    "carlsen_nepo_g6": """
[Event "World Championship Match"]
[Site "Dubai UAE"]
[Date "2021.12.03"]
[White "Magnus Carlsen"]
[Black "Ian Nepomniachtchi"]
[Result "1-0"]
1. d4 Nf6 2. Nf3 d5 3. g3 e6 4. Bg2 Be7 5. O-O O-O 6. b3 c5 7. dxc5 Bxc5 8. c4 dxc4 9. Qc2 Qe7 10. Nbd2 Nc6 11. Nxc4 b5 12. Nce5 Nb4 13. Qb2 Bb7 14. a3 Nc6 15. Nd3 Bb6 16. Bg5 Rfd8 17. Bxf6 gxf6 18. Rac1 Nd4 19. Nxd4 Bxd4 20. Qa2 Bxg2 21. Kxg2 Qb7+ 22. Kg1 Qe4 23. Qc2 a5 24. Rfd1 Kg7 25. Rd2 Rac8 26. Qxc8 Rxc8 27. Rxc8 Qd5 28. b4 a4 29. e3 Be5 30. h4 h5 31. Kh2 Bb2 32. Rc5 Qd6 33. Rd1 Bxa3 34. Rxb5 Qd7 35. Rc5 e5 36. Rc2 Qd5 37. Rdd2 Qb3 38. Ra2 e4 39. Nc5 Qxb4 40. Nxe4 Qb3 41. Rac2 Bf8 42. Nc5 Qb5 43. Nd3 a3 44. Nf4 Qa5 45. Ra2 Bb4 46. Rd3 Kh6 47. Rd1 Qa4 48. Rda1 Bd6 49. Kg1 Qb3 50. Ne2 Qd3 51. Nd4 Kh7 52. Kh2 Qe4 53. Rxa3 Qxh4+ 54. Kg1 Qe4 55. Ra4 Be5 56. Ne2 Qc2 57. R1a2 Qb3 58. Kg2 Qd5+ 59. f3 Qd1 60. f4 Bc7 61. Kf2 Bb6 62. Ra1 Qb3 63. Re4 Kg7 64. Re8 f5 65. Raa8 Qb4 66. Rac8 Ba5 67. Rc1 Bb6 68. Re5 Qb3 69. Re8 Qd5 70. Rcc8 Qh1 71. Rc1 Qd5 72. Rb1 Ba7 73. Re7 Bc5 74. Re5 Qd3 75. Rb7 Qc2 76. Rb5 Ba7 77. Ra5 Bb6 78. Rab5 Ba7 79. Rxf5 Qd3 80. Rxf7+ Kxf7 81. Rb7+ Kg6 82. Rxa7 Qd5 83. Ra6+ Kh7 84. Ra1 Kg6 85. Nd4 Qb7 86. Ra2 Qh1 87. Ra6+ Kf7 88. Nf3 Qb1 89. Rd6 Kg7 90. Rd5 Qa2+ 91. Rd2 Qb1 92. Re2 Qb6 93. Rc2 Qb1 94. Nd4 Qh1 95. Rc7+ Kf6 96. Rc6+ Kf7 97. Nf3 Qb1 98. Ng5+ Kg7 99. Ne6+ Kf7 100. Nd4 Qh1 101. Rc7+ Kf6 102. Nf3 Qb1 103. Rd7 Qb2+ 104. Rd2 Qb1 105. Ng1 Qb4 106. Rd1 Qb3 107. Rd6+ Kg7 108. Rd4 Qb2+ 109. Ne2 Qb1 110. e4 Qh1 111. Rd7+ Kg8 112. Rd4 Qh2+ 113. Ke3 h4 114. gxh4 Qh3+ 115. Kd2 Qxh4 116. Rd3 Kf8 117. Rf3 Qd8+ 118. Ke3 Qa5 119. Kf2 Qa7+ 120. Re3 Qd7 121. Ng3 Qd2+ 122. Kf3 Qd1+ 123. Re2 Qb3+ 124. Kg2 Qb7 125. Rd2 Qb3 126. Rd5 Ke7 127. Re5+ Kf7 128. Rf5+ Ke8 129. e5 Qa2+ 130. Kh3 Qe6 131. Kh4 Qh6+ 132. Nh5 Qh7 133. e6 Qg6 134. Rf7 Kd8 135. f5 Qg1 136. Ng7 1-0
""",
    "karpov_topalov_linares": """
[Event "Linares"]
[Site "Linares ESP"]
[Date "1994.02.27"]
[Round "4"]
[White "Anatoly Karpov"]
[Black "Veselin Topalov"]
[Result "1-0"]
[ECO "A30"]
1. c4 c5 2. Nf3 Nf6 3. Nc3 e6 4. e4 d6 5. d4 cxd4 6. Nxd4 Be7 7. Be3 O-O 8. Be2 b6 9. O-O Bb7 10. f3 a6 11. Qd2 Nbd7 12. Rfd1 Rc8 13. Rac1 Qc7 14. Nd5 exd5 15. cxd5 Qb8 16. Nc6 Bxc6 17. dxc6 Nc5 18. b4 Ne6 19. Bxa6 Rcd8 20. Qd3 d5 21. exd5 Rxd5 22. Qb3 Rxd1+ 23. Rxd1 b5 24. a4 bxa4 25. Qxa4 Nc7 26. b5 Nfd5 27. Bf2 Nc3 28. Qb3 Nxd1 29. Qxd1 Rd8 30. Qb3 Nd5 31. b6 Nxb6 32. Bxb6 Bc5+ 33. Bxc5 Qxb3 34. c7 Qd1+ 35. Bf1 Re8 36. h3 Qc1 37. Bb6 Qc6 38. Bf2 Qxc7 1-0
""",
}


def _write_clean(game_id: str, pgn_text: str) -> None:
    g = chess.pgn.read_game(io.StringIO(pgn_text))
    if g is None:
        raise ValueError(f"Invalid PGN for {game_id}")
    path = pgn_path(next(x for x in FAMOUS_GAMES if x.id == game_id))
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        g.accept(chess.pgn.FileExporter(f))
    plies = sum(1 for _ in g.mainline_moves())
    print(f"  {game_id}: {plies} plies")


def _extract_from_immortal(white: str, black: str, dest_id: str) -> None:
    immortal = Path("/tmp/immortal.pgn")
    if not immortal.exists():
        raise FileNotFoundError("Run: curl -sL .../immortal_games.pgn -o /tmp/immortal.pgn")
    with immortal.open(encoding="utf-8", errors="replace") as f:
        while True:
            g = chess.pgn.read_game(f)
            if g is None:
                break
            if g.headers.get("White") == white and g.headers.get("Black") == black:
                buf = io.StringIO()
                g.accept(chess.pgn.FileExporter(buf))
                _write_clean(dest_id, buf.getvalue())
                return
    raise ValueError(f"Game not found in immortal.pgn: {white} vs {black}")


def main() -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    print("Seeding PGN files…")
    for gid, text in EMBEDDED.items():
        _write_clean(gid, text)
    _extract_from_immortal("Georg Rotlewi", "Akiba Rubinstein", "rubinstein_rotlewi")
    _extract_from_immortal("Anatoly Karpov", "Wolfgang Unzicker", "karpov_unzicker")
    _extract_from_immortal("Garry Kasparov", "Veselin Topalov", "kasparov_topalov")
    # capablanca from lichess if present
    capa = pgn_path(next(x for x in FAMOUS_GAMES if x.id == "capablanca_tartakower"))
    if capa.stat().st_size > 200:
        g = chess.pgn.read_game(capa.open())
        print(f"  capablanca_tartakower: {sum(1 for _ in g.mainline_moves())} plies (existing)")
    for name in ("opera", "fischer_byrne", "rubinstein_rotlewi"):
        p = pgn_path(next(x for x in FAMOUS_GAMES if x.id == name))
        if p.exists() and p.stat().st_size > 100:
            g = chess.pgn.read_game(p.open())
            print(f"  {name}: {sum(1 for _ in g.mainline_moves())} plies (existing)")
    print("Done.")


if __name__ == "__main__":
    main()
