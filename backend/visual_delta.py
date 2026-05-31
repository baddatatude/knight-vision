"""Before/after visual facts for a move (square control, hanging pieces, threats)."""

from __future__ import annotations

import chess

from analysis import compute_undefended, piece_contacts_at
from pv_plan import _detect_fork, _piece_word

PIECE_VALUE: dict[chess.PieceType, int] = {
    chess.PAWN: 1,
    chess.KNIGHT: 3,
    chess.BISHOP: 3,
    chess.ROOK: 5,
    chess.QUEEN: 9,
    chess.KING: 0,
}


def _sq_name(sq: int) -> str:
    return chess.SQUARE_NAMES[sq]


def _king_zone_squares(board: chess.Board, color: chess.Color, radius: int = 1) -> set[int]:
    """Squares within `radius` Chebyshev steps of the king (default 3×3)."""
    king_sq = board.king(color)
    if king_sq is None:
        return set()
    kf, kr = chess.square_file(king_sq), chess.square_rank(king_sq)
    out: set[int] = set()
    for df in range(-radius, radius + 1):
        for dr in range(-radius, radius + 1):
            f, r = kf + df, kr + dr
            if 0 <= f <= 7 and 0 <= r <= 7:
                out.add(chess.square(f, r))
    return out


def _side_attacked_squares(board: chess.Board, color: chess.Color) -> set[int]:
    attacked: set[int] = set()
    for sq in chess.SQUARES:
        if board.is_attacked_by(color, sq):
            attacked.add(sq)
    return attacked


def _piece_label(board: chess.Board, sq: int) -> str:
    p = board.piece_at(sq)
    if p is None:
        return _sq_name(sq)
    side = "White" if p.color == chess.WHITE else "Black"
    return f"{side} {_piece_word(p.piece_type)} on {_sq_name(sq)}"


def _undefended_lists(board: chess.Board) -> tuple[list[str], list[str]]:
    uw, ub = compute_undefended(board)
    return uw, ub


def _undefended_labels(board: chess.Board, squares: list[str]) -> list[str]:
    labels: list[str] = []
    for name in squares:
        sq = chess.parse_square(name)
        labels.append(_piece_label(board, sq))
    return labels


def _contacts_summary(board: chess.Board, sq: int) -> dict | None:
    c = piece_contacts_at(board, sq)
    if not c:
        return None
    return {
        "square": c["square"],
        "piece": c["piece"],
        "defender_count": len(c["defenders"]),
        "attacker_count": len(c["attackers"]),
        "defenders": c["defenders"],
        "attackers": c["attackers"],
    }


def visual_snapshot(board: chess.Board, focus_color: chess.Color | None = None) -> dict:
    """Measurable board facts for narration (no engine judgment)."""
    white_attacks = _side_attacked_squares(board, chess.WHITE)
    black_attacks = _side_attacked_squares(board, chess.BLACK)
    uw, ub = _undefended_lists(board)

    w_king_zone = _king_zone_squares(board, chess.WHITE)
    b_king_zone = _king_zone_squares(board, chess.BLACK)

    def zone_attack_count(zone: set[int], attacks: set[int]) -> int:
        return len(zone & attacks)

    snap: dict = {
        "fen": board.fen(),
        "turn": "white" if board.turn == chess.WHITE else "black",
        "white_attacked_square_count": len(white_attacks),
        "black_attacked_square_count": len(black_attacks),
        "white_king_zone_attacks": zone_attack_count(w_king_zone, white_attacks),
        "black_king_zone_attacks": zone_attack_count(b_king_zone, black_attacks),
        "white_king_zone_enemy_attacks": zone_attack_count(w_king_zone, black_attacks),
        "black_king_zone_enemy_attacks": zone_attack_count(b_king_zone, white_attacks),
        "undefended_white": uw,
        "undefended_black": ub,
        "undefended_white_labels": _undefended_labels(board, uw),
        "undefended_black_labels": _undefended_labels(board, ub),
        "in_check": board.is_check(),
    }

    if focus_color is not None:
        enemy = not focus_color
        focus_zone = _king_zone_squares(board, focus_color)
        focus_attacks = white_attacks if focus_color == chess.WHITE else black_attacks
        enemy_attacks = black_attacks if focus_color == chess.WHITE else white_attacks
        side = "white" if focus_color == chess.WHITE else "black"
        snap[f"{side}_focus_king_zone_own_attacks"] = zone_attack_count(
            focus_zone, focus_attacks
        )
        snap[f"{side}_focus_king_zone_enemy_attacks"] = zone_attack_count(
            focus_zone, enemy_attacks
        )

    return snap


def visual_delta(
    board_before: chess.Board,
    board_after: chess.Board,
    move: chess.Move,
    mover: chess.Color,
) -> dict:
    """Compare positions before/after one ply; focus on mover's visual gains."""
    before = visual_snapshot(board_before, focus_color=mover)
    after = visual_snapshot(board_after, focus_color=mover)

    side = "white" if mover == chess.WHITE else "black"
    enemy = "black" if mover == chess.WHITE else "white"
    mover_key = f"{side}_focus_king_zone_own_attacks"
    enemy_on_mover_king = f"{side}_focus_king_zone_enemy_attacks"

    before_u = before[f"undefended_{side}"]
    after_u = after[f"undefended_{side}"]
    before_e = before[f"undefended_{enemy}"]
    after_e = after[f"undefended_{enemy}"]

    hanging_removed = sorted(set(before_u) - set(after_u))
    hanging_created = sorted(set(after_u) - set(before_u))
    enemy_hanging_new = sorted(set(after_e) - set(before_e))
    enemy_hanging_removed = sorted(set(before_e) - set(after_e))

    before_attacks = _side_attacked_squares(
        board_before, chess.WHITE if mover == chess.WHITE else chess.BLACK
    )
    after_attacks = _side_attacked_squares(
        board_after, chess.WHITE if mover == chess.WHITE else chess.BLACK
    )
    newly_attacked = sorted(_sq_name(s) for s in after_attacks - before_attacks)

    from_sq = move.from_square
    to_sq = move.to_square
    moved_piece = board_before.piece_at(from_sq)
    piece_name = _piece_word(moved_piece.piece_type) if moved_piece else "piece"

    fork = _detect_fork(board_after, mover)
    to_contacts = _contacts_summary(board_after, to_sq)

    delta: dict = {
        "move_uci": move.uci(),
        "move_san": board_before.san(move),
        "mover": side,
        "piece_moved": piece_name,
        "from_square": _sq_name(from_sq),
        "to_square": _sq_name(to_sq),
        "is_capture": board_before.is_capture(move),
        "is_check": board_after.is_check(),
        "king_zone_own_attacks_before": before[mover_key],
        "king_zone_own_attacks_after": after[mover_key],
        "king_zone_own_attacks_delta": after[mover_key] - before[mover_key],
        "king_zone_enemy_attacks_before": before[enemy_on_mover_king],
        "king_zone_enemy_attacks_after": after[enemy_on_mover_king],
        "king_zone_enemy_attacks_delta": after[enemy_on_mover_king] - before[enemy_on_mover_king],
        "side_attacked_square_count_delta": (
            after[f"{side}_attacked_square_count"]
            - before[f"{side}_attacked_square_count"]
        ),
        "hanging_removed": hanging_removed,
        "hanging_created": hanging_created,
        "hanging_removed_labels": _undefended_labels(board_before, hanging_removed),
        "hanging_created_labels": _undefended_labels(board_after, hanging_created),
        "enemy_hanging_new": enemy_hanging_new,
        "enemy_hanging_removed": enemy_hanging_removed,
        "enemy_hanging_new_labels": _undefended_labels(board_after, enemy_hanging_new),
        "newly_attacked_squares": newly_attacked[:12],
        "newly_attacked_square_count": len(newly_attacked),
        "undefended_before": {
            "white": before["undefended_white"],
            "black": before["undefended_black"],
        },
        "undefended_after": {
            "white": after["undefended_white"],
            "black": after["undefended_black"],
        },
        "destination_contacts": to_contacts,
        "fork": fork,
    }
    return delta


def delta_interest_score(delta: dict) -> int:
    """Rank plies for annotation — higher = more visually interesting."""
    score = 0
    score += abs(delta.get("king_zone_own_attacks_delta", 0)) * 3
    score += abs(delta.get("king_zone_enemy_attacks_delta", 0)) * 2
    score += len(delta.get("hanging_removed", [])) * 8
    score += len(delta.get("hanging_created", [])) * 6
    score += len(delta.get("enemy_hanging_new", [])) * 10
    score += min(delta.get("newly_attacked_square_count", 0), 8)
    if delta.get("is_check"):
        score += 12
    if delta.get("is_capture"):
        score += 5
    if delta.get("fork"):
        score += 15
    return score


def delta_facts_for_prompt(delta: dict, ply: int) -> str:
    """Plain-text facts for OpenAI (no prose)."""
    lines = [
        f"Ply {ply}. {delta['mover']} played {delta['move_san']} "
        f"({delta['piece_moved']} {delta['from_square']}->{delta['to_square']}, UCI {delta['move_uci']}).",
    ]
    if delta["is_capture"]:
        lines.append("This move captures a piece.")
    if delta["is_check"]:
        lines.append("This move gives check.")

    kz = delta["king_zone_own_attacks_delta"]
    if kz:
        lines.append(
            f"Around {delta['mover']}'s king zone: own side now attacks "
            f"{delta['king_zone_own_attacks_after']} squares "
            f"(was {delta['king_zone_own_attacks_before']}, delta {kz:+d})."
        )

    ke = delta["king_zone_enemy_attacks_delta"]
    if ke:
        lines.append(
            f"Enemy attacks in {delta['mover']}'s king zone: "
            f"{delta['king_zone_enemy_attacks_after']} "
            f"(was {delta['king_zone_enemy_attacks_before']}, delta {ke:+d})."
        )

    sa = delta["side_attacked_square_count_delta"]
    if sa:
        lines.append(f"Total squares this side attacks changed by {sa:+d}.")

    if delta["hanging_removed_labels"]:
        lines.append(
            "Hanging pieces removed: " + "; ".join(delta["hanging_removed_labels"])
        )
    if delta["hanging_created_labels"]:
        lines.append(
            "New hanging pieces (mover): " + "; ".join(delta["hanging_created_labels"])
        )
    if delta["enemy_hanging_new_labels"]:
        lines.append(
            "New enemy hanging pieces: " + "; ".join(delta["enemy_hanging_new_labels"])
        )
    if delta["newly_attacked_squares"]:
        lines.append(
            "Newly attacked squares: " + ", ".join(delta["newly_attacked_squares"][:8])
        )

    dc = delta.get("destination_contacts")
    if dc:
        lines.append(
            f"On {dc['square']}: {dc['defender_count']} friendly defender(s), "
            f"{dc['attacker_count']} enemy attacker(s)."
        )

    fork = delta.get("fork")
    if fork:
        lines.append(f"Fork created threatening squares: {fork.get('squares')}.")

    return "\n".join(lines)
