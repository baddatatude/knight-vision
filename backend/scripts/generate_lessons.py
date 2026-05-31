#!/usr/bin/env python3
"""Generate study lesson JSON for famous games (visual facts + optional OpenAI)."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from famous_games import FAMOUS_GAMES, get_famous_game  # noqa: E402
from lesson_builder import (  # noqa: E402
    build_lesson_dict,
    enrich_lesson,
    fallback_step_explanation,
    save_lesson,
    select_annotation_plies,
    visual_facts_for_plies,
)
from openai_visual_explain import explain_visual_lesson  # noqa: E402


def generate_one(game_id: str, *, explain: bool, max_annotations: int, all_moves: bool) -> None:
    game = get_famous_game(game_id)
    lesson = build_lesson_dict(game)
    limit = 0 if all_moves else max_annotations
    plies = select_annotation_plies(lesson["steps"], max_annotations=limit)
    lesson["annotation_plies"] = plies

    if explain:
        facts = visual_facts_for_plies(game, plies)
        try:
            explained = explain_visual_lesson(game, facts, brief=all_moves or limit <= 0)
            by_ply = explained.get("by_ply", {})
            for step in lesson["steps"]:
                text = by_ply.get(step["ply"], "").strip()
                if not text:
                    text = fallback_step_explanation(step)
                step["explanation"] = text
            lesson["intro"] = explained.get("intro")
            lesson["summary"] = explained.get("summary")
            lesson["narrative"] = explained.get("narrative")
            usage = explained.get("usage", {})
            filled = sum(1 for s in lesson["steps"] if (s.get("explanation") or "").strip())
            print(
                f"  OpenAI tokens: {usage.get('prompt_tokens', 0)} in, "
                f"{usage.get('completion_tokens', 0)} out  |  "
                f"{filled}/{len(lesson['steps'])} plies with commentary"
            )
        except Exception as e:  # noqa: BLE001
            lesson["explain_error"] = str(e)
            print(f"  OpenAI failed: {e}")

    path = save_lesson(enrich_lesson(lesson))
    print(f"  Wrote {path} ({len(lesson['steps'])} plies, {len(plies)} annotated)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate Knight Vision study lessons")
    parser.add_argument(
        "--game",
        action="append",
        help="Game id (repeatable). Default: all catalog games.",
    )
    parser.add_argument(
        "--explain",
        action="store_true",
        help="Call OpenAI for visual-awareness narration (requires OPENAI_API_KEY)",
    )
    parser.add_argument(
        "--all-moves",
        action="store_true",
        help="Annotate every ply (default when --explain is set)",
    )
    parser.add_argument(
        "--max-annotations",
        type=int,
        default=12,
        help="Max key plies to annotate (ignored with --all-moves)",
    )
    args = parser.parse_args()
    all_moves = args.all_moves or args.explain
    ids = args.game or [g.id for g in FAMOUS_GAMES]
    for gid in ids:
        print(f"Generating {gid}…")
        generate_one(
            gid,
            explain=args.explain,
            max_annotations=args.max_annotations,
            all_moves=all_moves,
        )


if __name__ == "__main__":
    main()
