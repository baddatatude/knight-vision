import { Chess, type Square } from 'chess.js'
import { storedMoveToUci } from './api'

export type OpeningQuizColor = 'w' | 'b'

export type QuizStoredMove = {
  from: Square
  to: Square
  promotion?: string
  by?: 'w' | 'b'
  captured?: 'p' | 'n' | 'b' | 'r' | 'q' | 'k'
}

export function colorAtLineIndex(index: number): OpeningQuizColor {
  return index % 2 === 0 ? 'w' : 'b'
}

export function normalizeUci(uci: string): string {
  return uci.trim().toLowerCase()
}

export function uciMovesMatch(played: string, expected: string): boolean {
  return normalizeUci(played) === normalizeUci(expected)
}

function applyUciToGame(game: Chess, uci: string): QuizStoredMove | null {
  if (uci.length < 4) return null
  const from = uci.slice(0, 2) as Square
  const to = uci.slice(2, 4) as Square
  const promotion =
    uci.length >= 5 ? (uci[4] as 'q' | 'r' | 'b' | 'n') : undefined
  try {
    const move = game.move(
      promotion ? { from, to, promotion } : { from, to },
    )
    const s: QuizStoredMove = { from: move.from as Square, to: move.to as Square }
    if (move.promotion) s.promotion = move.promotion
    s.by = move.color
    if (move.captured) {
      s.captured = move.captured as QuizStoredMove['captured']
    }
    return s
  } catch {
    return null
  }
}

/** True if played moves still match the book line prefix. */
export function linePrefixMatches(
  played: QuizStoredMove[],
  movesUci: string[],
): boolean {
  if (played.length > movesUci.length) return false
  for (let i = 0; i < played.length; i++) {
    if (!uciMovesMatch(storedMoveToUci(played[i]), movesUci[i])) return false
  }
  return true
}

/** Index in `movesUci` of the next move the user must play, or null if line is done. */
export function nextUserMoveIndex(
  played: QuizStoredMove[],
  movesUci: string[],
  userColor: OpeningQuizColor,
): number | null {
  if (!linePrefixMatches(played, movesUci)) return null
  let i = played.length
  while (i < movesUci.length && colorAtLineIndex(i) !== userColor) {
    i++
  }
  return i < movesUci.length ? i : null
}

/** Opponent book moves to play immediately after index `afterIndex` (exclusive). */
export function opponentMovesAfter(
  played: QuizStoredMove[],
  movesUci: string[],
  userColor: OpeningQuizColor,
  afterIndex: number,
): QuizStoredMove[] {
  const out: QuizStoredMove[] = []
  const game = new Chess()
  for (const m of played) {
    try {
      game.move(
        m.promotion
          ? { from: m.from, to: m.to, promotion: m.promotion }
          : { from: m.from, to: m.to },
      )
    } catch {
      return out
    }
  }
  let i = afterIndex + 1
  while (i < movesUci.length && colorAtLineIndex(i) !== userColor) {
    const sm = applyUciToGame(game, movesUci[i])
    if (!sm) break
    out.push(sm)
    i++
  }
  return out
}

/** Book moves for the opponent to reach the user's first turn. */
export function openingQuizStartMoves(
  movesUci: string[],
  userColor: OpeningQuizColor,
): QuizStoredMove[] {
  return opponentMovesAfter([], movesUci, userColor, -1)
}

export function countUserMovesInLine(
  movesUci: string[],
  userColor: OpeningQuizColor,
): number {
  return movesUci.filter((_, i) => colorAtLineIndex(i) === userColor).length
}

export function countUserMovesPlayed(
  played: QuizStoredMove[],
  movesUci: string[],
  userColor: OpeningQuizColor,
): number {
  let n = 0
  for (let i = 0; i < played.length; i++) {
    if (
      colorAtLineIndex(i) === userColor &&
      uciMovesMatch(storedMoveToUci(played[i]), movesUci[i])
    ) {
      n++
    }
  }
  return n
}
