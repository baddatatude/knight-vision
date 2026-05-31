from __future__ import annotations

from pathlib import Path

import chess
import chess.engine
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from openai import APIConnectionError, APIStatusError, AuthenticationError, RateLimitError
from pydantic import BaseModel, Field

from analysis import (
    compute_attack_map,
    compute_piece_contacts,
    compute_piece_threats,
    compute_undefended,
    legal_moves_uci,
)
from config import cors_origins, openai_api_key
from errors import register_exception_handlers
from engine_uci import (
    default_stockfish_path,
    engine_analyse,
    reset_engine,
    resolved_engine_binary,
)
from famous_games import catalog_dict, get_famous_game
from lesson_builder import load_or_build_lesson
from move_quality import score_move
from openings_db import classify_opening, classify_side_openings
from openai_explain import attach_explanations_to_steps, explain_plan_narrative
from pv_plan import build_plan_steps
from rate_limit import RateLimitMiddleware
from validation import validate_fen, validate_moves_uci

_REPO_ROOT = Path(__file__).resolve().parent.parent
_FRONTEND_DIST = _REPO_ROOT / "frontend" / "dist"

app = FastAPI(title="Knight Vision Chess API", version="0.2.0")
register_exception_handlers(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RateLimitMiddleware)


class FenBody(BaseModel):
    fen: str = Field(..., min_length=10, max_length=120, description="Position FEN")
    moves_uci: list[str] = Field(
        default_factory=list,
        max_length=500,
        description="Game line from start in UCI (e.g. e2e4) for opening identification",
    )


class EngineEvalBody(BaseModel):
    fen: str = Field(..., min_length=10, max_length=120)
    depth: int = Field(12, ge=1, le=40)
    movetime_ms: int | None = Field(None, ge=50, le=60_000)


class EnginePlanBody(BaseModel):
    fen: str = Field(..., min_length=10, max_length=120)
    depth: int = Field(12, ge=1, le=40)
    user_color: str = Field("white", pattern="^(white|black)$")
    explain: bool = Field(True, description="Call OpenAI for numbered English summary")


class MoveQualityBody(BaseModel):
    fen: str = Field(..., min_length=10, max_length=120)
    played_uci: str = Field(..., min_length=4, max_length=5)
    depth: int = Field(6, ge=1, le=40, description="Lower depth for fast accuracy scoring")


def _run_engine(fen: str, *, depth: int, movetime_ms: int | None = None) -> dict:
    try:
        if movetime_ms is not None:
            return engine_analyse(fen, depth=depth, movetime_ms=movetime_ms)
        return engine_analyse(fen, depth=depth)
    except FileNotFoundError as e:
        raise EngineError(
            "Stockfish is not installed or STOCKFISH_PATH is wrong.",
            code="engine_not_found",
        ) from e
    except chess.engine.EngineTerminatedError as e:
        reset_engine()
        raise EngineError(
            "Engine stopped unexpectedly. Tap evaluate again.",
            code="engine_terminated",
        ) from e
    except Exception as e:  # noqa: BLE001
        reset_engine()
        raise EngineError(
            "Engine analysis failed. Try again in a moment.",
            code="engine_error",
        ) from e


def _run_openai_explain(
    fen: str,
    pv: list[str],
    cp_white: int | None,
    mate_white: int | None,
    user_color: chess.Color,
) -> dict:
    try:
        return explain_plan_narrative(fen, pv, cp_white, mate_white, user_color)
    except RuntimeError as e:
        msg = str(e)
        if "OPENAI_API_KEY" in msg:
            raise OpenAIError(
                "OpenAI is not configured on the server.",
                code="openai_not_configured",
            ) from e
        raise OpenAIError(msg, code="openai_error") from e
    except AuthenticationError as e:
        raise OpenAIError(
            "OpenAI API key is invalid. Check server configuration.",
            code="openai_auth",
        ) from e
    except RateLimitError as e:
        raise OpenAIError(
            "OpenAI rate limit reached. Wait a moment and try again.",
            code="openai_rate_limit",
        ) from e
    except (APIConnectionError, APIStatusError) as e:
        raise OpenAIError(
            "Could not reach OpenAI. Check network and try again.",
            code="openai_unavailable",
        ) from e
    except Exception as e:  # noqa: BLE001
        raise OpenAIError(
            "Explanation failed. The engine line is still available.",
            code="openai_error",
        ) from e


@app.get("/favicon.ico", include_in_schema=False)
def favicon() -> Response:
    return Response(status_code=204)


if not _FRONTEND_DIST.is_dir():

    @app.get("/")
    def root() -> dict[str, str]:
        return {
            "service": "Knight Vision API",
            "ui_dev": "http://localhost:5173",
            "health": "/health",
            "docs": "/docs",
        }


@app.get("/health")
@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/openai/status")
def openai_status() -> dict[str, bool]:
    """Whether OPENAI_API_KEY is loaded (does not call OpenAI)."""
    return {"configured": openai_api_key() is not None}


@app.post("/api/analyze")
def analyze(body: FenBody) -> dict:
    board = validate_fen(body.fen)
    moves_uci = validate_moves_uci(body.moves_uci)
    uw, ub = compute_undefended(board)
    opening = classify_side_openings(moves_uci)
    return {
        "fen": board.fen(),
        "turn": "white" if board.turn == chess.WHITE else "black",
        "attacks": compute_attack_map(board),
        "piece_contacts": compute_piece_contacts(board),
        "piece_threats": compute_piece_threats(board),
        "undefended": {"white": uw, "black": ub},
        "legal_moves_uci": legal_moves_uci(board),
        "is_check": board.is_check(),
        "is_checkmate": board.is_checkmate(),
        "is_stalemate": board.is_stalemate(),
        "is_insufficient_material": board.is_insufficient_material(),
        "opening": opening["line"],
        "openings": opening,
    }


@app.post("/api/engine/eval")
def engine_eval(body: EngineEvalBody) -> dict:
    validate_fen(body.fen)
    return _run_engine(body.fen, depth=body.depth, movetime_ms=body.movetime_ms)


@app.post("/api/engine/move-quality")
def engine_move_quality(body: MoveQualityBody) -> dict:
    """Score one move vs engine best (typically depth 6 for user accuracy)."""
    validate_fen(body.fen)
    played = body.played_uci.strip().lower()
    if len(played) < 4:
        raise HTTPException(status_code=400, detail="played_uci is required")
    try:
        return score_move(body.fen, played, depth=body.depth)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except FileNotFoundError as e:
        raise EngineError(
            "Stockfish is not installed or STOCKFISH_PATH is wrong.",
            code="engine_not_found",
        ) from e
    except chess.engine.EngineTerminatedError as e:
        reset_engine()
        raise EngineError(
            "Engine stopped unexpectedly. Retry move scoring.",
            code="engine_terminated",
        ) from e
    except Exception as e:  # noqa: BLE001
        reset_engine()
        raise EngineError(
            "Move scoring failed. Try again in a moment.",
            code="engine_error",
        ) from e


@app.post("/api/engine/plan")
def engine_plan(body: EnginePlanBody) -> dict:
    """Stockfish PV + step FENs for click-through; optional OpenAI narrative."""
    board = validate_fen(body.fen)
    user_color = chess.WHITE if body.user_color == "white" else chess.BLACK
    analysis = _run_engine(body.fen, depth=body.depth)

    pv = analysis.get("pv_uci") or []
    steps = build_plan_steps(body.fen, pv, user_color)
    narrative: str | None = None
    intro: str | None = None
    summary: str | None = None
    explain_error: str | None = None
    explain_code: str | None = None

    if body.explain:
        if not openai_api_key():
            explain_error = "AI explanations are not configured on the server."
            explain_code = "openai_not_configured"
        else:
            try:
                explained = _run_openai_explain(
                    body.fen,
                    pv,
                    analysis.get("cp_white"),
                    analysis.get("mate_white"),
                    user_color,
                )
                narrative = str(explained.get("narrative", ""))
                intro = str(explained.get("intro", "")) or None
                summary = str(explained.get("summary", "")) or None
                steps = attach_explanations_to_steps(steps, explained)
            except OpenAIError as e:
                explain_error = e.message
                explain_code = e.code

    return {
        "start_fen": board.fen(),
        "bestmove_uci": analysis.get("bestmove_uci"),
        "pv_uci": pv,
        "cp_white": analysis.get("cp_white"),
        "mate_white": analysis.get("mate_white"),
        "steps": steps,
        "narrative": narrative,
        "intro": intro,
        "summary": summary,
        "explain_error": explain_error,
        "explain_code": explain_code,
    }


@app.get("/api/study/catalog")
def study_catalog() -> dict:
    """Famous games available for step-through study."""
    return {"games": catalog_dict()}


@app.get("/api/study/lessons/{game_id}")
def study_lesson(game_id: str) -> dict:
    """Lesson JSON: full move list + visual-awareness explanations where generated."""
    try:
        get_famous_game(game_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return load_or_build_lesson(game_id)


@app.get("/api/engine/status")
def engine_status() -> dict[str, str | bool]:
    """Does not start the engine — avoids reserving Stockfish hash RAM on page load."""
    resolved = resolved_engine_binary()
    raw = default_stockfish_path()
    if resolved:
        return {"ok": True, "path": resolved, "configured_path": raw}
    return {
        "ok": False,
        "path": raw,
        "error": "Engine binary not found or not executable",
    }


if _FRONTEND_DIST.is_dir():
    app.mount(
        "/",
        StaticFiles(directory=_FRONTEND_DIST, html=True),
        name="frontend",
    )
