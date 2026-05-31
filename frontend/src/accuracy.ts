import type { MoveQualityResponse } from './api'

/** Lichess-style game accuracy from average centipawn loss. */
export function accuracyPercentFromAcpl(acpl: number): number {
  if (acpl <= 0) return 100
  return Math.round(103.1668 * Math.exp(-0.04354 * acpl) * 10) / 10
}

export function classificationLabel(classification: string): string {
  const labels: Record<string, string> = {
    best: 'Best',
    excellent: 'Excellent',
    good: 'Good',
    inaccuracy: 'Inaccuracy',
    mistake: 'Mistake',
    blunder: 'Blunder',
  }
  return labels[classification] ?? classification
}

export function shouldScoreUserMove(
  by: 'w' | 'b' | undefined,
  userColor: 'w' | 'b' | null,
): boolean {
  if (!by) return false
  if (!userColor) return true
  return by === userColor
}

/** Latest user ply that still needs a move-quality score (vs engine: not always last ply). */
export function findLatestUnscoredUserMoveIndex(
  movesBy: Array<'w' | 'b' | undefined>,
  scores: (MoveQualityResponse | null)[],
  userColor: 'w' | 'b' | null,
): number {
  for (let i = movesBy.length - 1; i >= 0; i--) {
    if (!shouldScoreUserMove(movesBy[i], userColor)) continue
    if (scores[i]) continue
    return i
  }
  return -1
}

export function summarizeAccuracy(
  scores: (MoveQualityResponse | null)[],
  movesBy: Array<'w' | 'b' | undefined>,
  userColor: 'w' | 'b' | null,
): {
  scored: MoveQualityResponse[]
  accuracyPercent: number | null
  avgCpLoss: number | null
  last: MoveQualityResponse | null
} {
  const scored: MoveQualityResponse[] = []
  for (let i = 0; i < scores.length; i++) {
    const s = scores[i]
    if (!s || !shouldScoreUserMove(movesBy[i], userColor)) continue
    scored.push(s)
  }
  if (scored.length === 0) {
    return { scored, accuracyPercent: null, avgCpLoss: null, last: null }
  }
  const avgCpLoss =
    scored.reduce((sum, s) => sum + s.cp_loss, 0) / scored.length
  return {
    scored,
    accuracyPercent: accuracyPercentFromAcpl(avgCpLoss),
    avgCpLoss: Math.round(avgCpLoss),
    last: scored[scored.length - 1] ?? null,
  }
}
