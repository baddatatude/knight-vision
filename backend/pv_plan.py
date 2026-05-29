"""Replay Stockfish PV and extract facts for narration and UI step-through."""

from __future__ import annotations

import chess

PIECE_WORD: dict[chess.PieceType, str] = {
    chess.PAWN: "pawn",
    chess.KNIGHT: "knight",
    chess.BISHOP: "bishop",
    chess.ROOK: "rook",
    chess.QUEEN: "queen",
    chess.KING: "king",
}

PIECE_VALUE: dict[chess.PieceType, int] = {
    chess.PAWN: 1,
    chess.KNIGHT: 3,
    chess.BISHOP: 3,
    chess.ROOK: 5,
    chess.QUEEN: 9,
    chess.KING: 0,
}


def _piece_word(piece_type: chess.PieceType) -> str:
    return PIECE_WORD.get(piece_type, "piece")


def _detect_fork(board: chess.Board, by_color: chess.Color) -> dict | None:
    """One friendly piece attacks two enemy targets (king counts)."""
    enemy = not by_color
    for piece_sq in chess.SQUARES:
        p = board.piece_at(piece_sq)
        if not p or p.color != by_color:
            continue
        pt = p.piece_type
        attacked: list[tuple[chess.Square, int]] = []
        for target in board.attacks(piece_sq):
            p = board.piece_at(target)
            if p and p.color == enemy:
                attacked.append((target, PIECE_VALUE.get(p.piece_type, 0)))
        if len(attacked) < 2:
            continue
        has_king = any(board.piece_at(t) and board.piece_at(t).piece_type == chess.KING for t, _ in attacked)
        valuable = [t for t, v in attacked if v >= 3 or has_king]
        if len(valuable) >= 2 or (has_king and len(attacked) >= 2):
            squares = [chess.square_name(t) for t, _ in attacked[:3]]
            return {"squares": squares, "count": len(attacked)}
    return None


def build_plan_steps(
    start_fen: str,
    pv_uci: list[str],
    user_color: chess.Color = chess.WHITE,
) -> list[dict]:
    board = chess.Board(start_fen)
    user_is_white = user_color == chess.WHITE
    steps: list[dict] = []

    for idx, uci in enumerate(pv_uci):
        move = chess.Move.from_uci(uci)
        mover = board.turn
        from_sq = chess.square_name(move.from_square)
        to_sq = chess.square_name(move.to_square)
        piece_before = board.piece_at(move.from_square)
        piece_name = _piece_word(piece_before.piece_type) if piece_before else "piece"
        san = board.san(move)
        is_capture = board.is_capture(move)
        captured_type: str | None = None
        if is_capture:
            if board.is_en_passant(move):
                captured_type = "pawn"
            else:
                cap_piece = board.piece_at(move.to_square)
                if cap_piece:
                    captured_type = _piece_word(cap_piece.piece_type)

        board.push(move)
        in_check = board.is_check()
        legal_count = board.legal_moves.count()
        fork = _detect_fork(board, mover)

        perspective = (
            "user"
            if (mover == chess.WHITE) == user_is_white
            else "opponent"
        )
        events: list[dict] = []
        if is_capture and captured_type:
            events.append({"type": "capture", "piece": captured_type})
        if in_check:
            events.append({"type": "check"})
        if fork:
            events.append({"type": "fork", **fork})

        steps.append(
            {
                "ply": idx + 1,
                "uci": uci,
                "san": san,
                "from_square": from_sq,
                "to_square": to_sq,
                "piece_moved": piece_name,
                "fen": board.fen(),
                "mover": "white" if mover == chess.WHITE else "black",
                "perspective": perspective,
                "is_capture": is_capture,
                "captured_type": captured_type,
                "is_check": in_check,
                "legal_moves_count": legal_count,
                "events": events,
                "explanation": "",
            }
        )

    return steps


def plan_facts_for_prompt(
    start_fen: str,
    steps: list[dict],
    cp_white: int | None,
    mate_white: int | None,
    user_color: chess.Color = chess.WHITE,
) -> str:
    """Plain-text facts for the LLM (no prose)."""
    side = "White" if user_color == chess.WHITE else "Black"
    lines = [
        f"Student plays: {side}. Opponent is Stockfish.",
        f"Start FEN: {start_fen}",
    ]
    if mate_white is not None:
        lines.append(f"Engine eval: mate for White in {mate_white} (0 = drawn line).")
    elif cp_white is not None:
        lines.append(f"Engine eval: {cp_white} centipawns (White's perspective).")
    lines.append(f"Main line length: {len(steps)} half-moves (plies).")
    lines.append("")
    for s in steps:
        who = "Student (I)" if s["perspective"] == "user" else "Opponent (you)"
        line = (
            f"Plie {s['ply']}. {who}: {s['piece_moved']} {s['from_square']}->{s['to_square']} "
            f"({s['san']}, UCI {s['uci']})"
        )
        if s["is_capture"] and s["captured_type"]:
            line += f"; captures {s['captured_type']}"
        if s["is_check"]:
            line += "; gives check"
        if s["legal_moves_count"] is not None:
            line += f"; after this move the side to move has {s['legal_moves_count']} legal moves"
        for ev in s.get("events", []):
            if ev.get("type") == "fork":
                line += f"; fork threatening squares {ev.get('squares')}"
        lines.append(line)
    return "\n".join(lines)
