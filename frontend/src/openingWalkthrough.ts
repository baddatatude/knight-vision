import { Chess, type Square } from 'chess.js'
import type { PlanStep } from './api'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

const PIECE_NAMES: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
}

export function buildOpeningPlanSteps(movesUci: string[]): {
  start_fen: string
  steps: PlanStep[]
} {
  const board = new Chess()
  const steps: PlanStep[] = []

  for (let i = 0; i < movesUci.length; i++) {
    const uci = movesUci[i].trim().toLowerCase()
    if (uci.length < 4) continue

    const from = uci.slice(0, 2) as Square
    const to = uci.slice(2, 4) as Square
    const promotion =
      uci.length >= 5 ? (uci[4] as 'q' | 'r' | 'b' | 'n') : undefined
    const mover = board.turn() === 'w' ? 'white' : 'black'
    const piece = board.get(from)
    const pieceName = piece ? (PIECE_NAMES[piece.type] ?? 'piece') : 'piece'
    const targetBefore = board.get(to)
    const isCapture = targetBefore !== undefined

    let applied: ReturnType<Chess['move']>
    try {
      applied = board.move(
        promotion ? { from, to, promotion } : { from, to },
      )
    } catch {
      break
    }

    const capturedType = applied.captured
      ? (PIECE_NAMES[applied.captured] ?? 'piece')
      : null
    const san = applied.san
    const side = mover === 'white' ? 'White' : 'Black'
    let explanation = `${side} plays ${san}.`
    if (isCapture && capturedType) {
      explanation += ` This captures the ${capturedType}.`
    }
    if (board.isCheck()) {
      explanation += ' Check.'
    }

    steps.push({
      ply: i + 1,
      uci,
      san,
      from_square: from,
      to_square: to,
      piece_moved: pieceName,
      fen: board.fen(),
      mover,
      perspective: mover === 'white' ? 'user' : 'opponent',
      is_capture: isCapture,
      captured_type: capturedType,
      is_check: board.isCheck(),
      legal_moves_count: board.moves().length,
      events: isCapture
        ? [{ type: 'capture', piece: capturedType ?? 'piece' }]
        : board.isCheck()
          ? [{ type: 'check' }]
          : [],
      explanation,
    })
  }

  return { start_fen: START_FEN, steps }
}
