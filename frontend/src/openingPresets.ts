import { Chess, type Square } from 'chess.js'
import { storedMoveToUci } from './api'
import { OPENING_LINES } from './openingLines'

export type WhiteOpeningPreset = {
  id: string
  name: string
  /** Full UCI line from the start; engine plays White plies while the game matches. */
  movesUci: string[]
}

export type StoredMoveLike = {
  from: Square
  to: Square
  promotion?: string
}

export const WHITE_OPENING_PRESETS: WhiteOpeningPreset[] = [
  {
    id: 'stockfish',
    name: 'Stockfish chooses (no fixed line)',
    movesUci: [],
  },
  ...OPENING_LINES.map((o) => ({
    id: o.id,
    name: o.name,
    movesUci: o.movesUci,
  })),
]

export function getWhiteOpeningPreset(id: string): WhiteOpeningPreset {
  return (
    WHITE_OPENING_PRESETS.find((p) => p.id === id) ?? WHITE_OPENING_PRESETS[0]
  )
}

/** Next White move from the preset if the game still follows the book line. */
export function getPresetWhiteMove(
  moves: StoredMoveLike[],
  preset: WhiteOpeningPreset,
): string | null {
  if (!preset.movesUci.length) return null

  const played = moves.map(storedMoveToUci)
  for (let i = 0; i < played.length; i++) {
    if (played[i] !== preset.movesUci[i]) return null
  }

  const next = preset.movesUci[played.length]
  if (!next) return null

  const game = new Chess()
  for (const m of moves) {
    try {
      game.move(
        m.promotion
          ? { from: m.from, to: m.to, promotion: m.promotion }
          : { from: m.from, to: m.to },
      )
    } catch {
      return null
    }
  }
  if (game.turn() !== 'w') return null

  try {
    const trial = new Chess(game.fen())
    const from = next.slice(0, 2)
    const to = next.slice(2, 4)
    const promotion = next.length >= 5 ? next[4] : undefined
    trial.move(
      promotion ? { from, to, promotion } : { from, to },
    )
    return next
  } catch {
    return null
  }
}

export type VsEngineMode = 'off' | 'engine_black' | 'engine_white'

export function userPieceColor(mode: VsEngineMode): 'w' | 'b' | null {
  if (mode === 'engine_black') return 'w'
  if (mode === 'engine_white') return 'b'
  return null
}

export function enginePieceColor(mode: VsEngineMode): 'w' | 'b' | null {
  if (mode === 'engine_black') return 'b'
  if (mode === 'engine_white') return 'w'
  return null
}
