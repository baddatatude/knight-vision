import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Chessboard,
  type SquareHandlerArgs,
  type SquareRenderer,
} from 'react-chessboard'
import { Chess, type Move, type Square } from 'chess.js'
import { ApiClientError } from './apiClient'
import {
  analyzePosition,
  storedMoveToUci,
  engineEval,
  enginePlan as fetchEnginePlan,
  engineStatus,
  fetchStudyCatalog,
  fetchStudyLesson,
  openaiStatus,
  scoreMoveQuality,
  ACCURACY_DEPTH,
  ENGINE_DEPTH_DEFAULT,
  type OpeningInfo,
  type AnalyzeResponse,
  type EngineEvalResponse,
  type EnginePlanResponse,
  type MoveQualityResponse,
  type PlanStep,
  type PieceContacts,
  type StudyGameCatalogEntry,
} from './api'
import {
  classificationLabel,
  findLatestUnscoredUserMoveIndex,
  summarizeAccuracy,
} from './accuracy'
import {
  highlightPlanSteps,
  moveEventLabelText,
  nextHighlightStep,
  prevHighlightStep,
  stepEventLabels,
  type MoveEventLabel,
} from './studyHighlights'
import {
  enginePieceColor,
  getPresetWhiteMove,
  getWhiteOpeningPreset,
  userPieceColor,
  WHITE_OPENING_PRESETS,
  type VsEngineMode,
} from './openingPresets'
import './App.css'

/** Coordinates always white; dark halo for contrast on light squares and rings. */
const BOARD_NOTATION_OPTIONS = {
  showNotation: true as const,
  darkSquareNotationStyle: {
    color: '#ffffff',
    zIndex: 30,
    position: 'relative' as const,
    pointerEvents: 'none' as const,
  },
  lightSquareNotationStyle: {
    color: '#ffffff',
    zIndex: 30,
    position: 'relative' as const,
    pointerEvents: 'none' as const,
  },
  alphaNotationStyle: {
    zIndex: 31,
    color: '#ffffff',
    textShadow:
      '0 0 1px #000, 0 0 3px #000, 0 1px 2px #000, 0 -1px 1px rgba(0,0,0,0.75)',
  },
  numericNotationStyle: {
    zIndex: 31,
    color: '#ffffff',
    textShadow:
      '0 0 1px #000, 0 0 3px #000, 0 1px 2px #000, 0 -1px 1px rgba(0,0,0,0.75)',
  },
}

/** Minimal move record for replay (avoids holding `Move` tied to old `Chess`). */
type StoredMove = {
  from: Square
  to: Square
  promotion?: string
  /** Piece type taken (lowercase piece symbol), if any. */
  captured?: 'p' | 'n' | 'b' | 'r' | 'q' | 'k'
  /** Side that played this move (`w` = White moved, including captures). */
  by?: 'w' | 'b'
}

const PIECE_LABEL: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
}

const PIECE_VALUE: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
}

/** Black-style glyphs for pieces Black lost (shown above board). */
const GLYPH_BLACK: Record<string, string> = {
  p: '♟',
  n: '♞',
  b: '♝',
  r: '♜',
  q: '♛',
  k: '♚',
}

/** White-style glyphs for pieces White lost (shown below board). */
const GLYPH_WHITE: Record<string, string> = {
  p: '♙',
  n: '♘',
  b: '♗',
  r: '♖',
  q: '♕',
  k: '♔',
}

function captureSortKey(t: string): number {
  return ({ q: 5, r: 4, b: 3, n: 2, p: 1, k: 0 } as Record<string, number>)[t] ?? 0
}

function toStored(m: Move): StoredMove {
  const s: StoredMove = { from: m.from as Square, to: m.to as Square }
  if (m.promotion) s.promotion = m.promotion
  s.by = m.color
  if (m.captured) s.captured = m.captured
  return s
}

function deriveCaptures(moves: StoredMove[]) {
  const blackLost: string[] = []
  const whiteLost: string[] = []
  let whitePts = 0
  let blackPts = 0
  for (const m of moves) {
    if (!m.captured || !m.by) continue
    const v = PIECE_VALUE[m.captured] ?? 0
    if (m.by === 'w') {
      blackLost.push(m.captured)
      whitePts += v
    } else {
      whiteLost.push(m.captured)
      blackPts += v
    }
  }
  blackLost.sort((a, b) => captureSortKey(b) - captureSortKey(a))
  whiteLost.sort((a, b) => captureSortKey(b) - captureSortKey(a))
  return { blackLost, whiteLost, whitePts, blackPts }
}

function playThrough(moves: StoredMove[], count: number): Chess {
  const g = new Chess()
  for (let i = 0; i < count; i++) {
    const s = moves[i]
    try {
      g.move({
        from: s.from,
        to: s.to,
        ...(s.promotion ? { promotion: s.promotion } : {}),
      })
    } catch {
      break
    }
  }
  return g
}

/** Try a drag-drop move; mutates `game`. Returns stored move or null. */
function tryMove(game: Chess, from: Square, to: Square): StoredMove | null {
  try {
    const piece = game.get(from)
    const promotion =
      piece?.type === 'p' && (to[1] === '8' || to[1] === '1') ? 'q' : undefined
    const move = game.move(
      promotion ? { from, to, promotion } : { from, to },
    )
    return toStored(move)
  } catch {
    return null
  }
}

/** Apply a UCI move (e.g. `e2e4`, `e7e8q`) from Stockfish; mutates `game`. */
function applyUci(game: Chess, uci: string): StoredMove | null {
  if (uci.length < 4) return null
  const from = uci.slice(0, 2) as Square
  const to = uci.slice(2, 4) as Square
  const promotion =
    uci.length >= 5 ? (uci[4] as 'q' | 'r' | 'b' | 'n') : undefined
  try {
    const move = game.move(
      promotion ? { from, to, promotion } : { from, to },
    )
    return toStored(move)
  } catch {
    return null
  }
}

const ATTACK_BORDER_COLORS: Record<string, string> = {
  white: '#2563eb',
  black: '#ef4444',
  both: '#a855f7',
  none: '#22c55e',
}

function canUserSelectSquare(
  game: Chess,
  square: Square,
  userColor: 'w' | 'b' | null,
): boolean {
  const piece = game.get(square)
  if (!piece) return false
  const isWhite = piece.color === 'w'
  if (!userColor) {
    return (game.turn() === 'w' && isWhite) || (game.turn() === 'b' && !isWhite)
  }
  return game.turn() === userColor && (userColor === 'w' ? isWhite : !isWhite)
}

function legalTargetsFrom(game: Chess, from: Square): Square[] {
  return game.moves({ square: from, verbose: true }).map((m) => m.to as Square)
}

function formatPieceRef(ref: { color: string; type: string; square: string }): string {
  const side = ref.color === 'white' ? 'White' : 'Black'
  const name = PIECE_LABEL[ref.type] ?? ref.type
  return `${side} ${name} on ${ref.square}`
}

const DOUBLE_CLICK_MS = 380

function squareAnchorPercent(
  square: Square,
  boardOrientation: 'white' | 'black',
): { left: string; top: string } {
  const file = square.charCodeAt(0) - 97
  const rank = parseInt(square[1], 10)
  if (boardOrientation === 'white') {
    return {
      left: `${((file + 0.5) / 8) * 100}%`,
      top: `${((8 - rank + 0.5) / 8) * 100}%`,
    }
  }
  return {
    left: `${((7 - file + 0.5) / 8) * 100}%`,
    top: `${((rank - 0.5) / 8) * 100}%`,
  }
}

function buildSquareStyles(opts: {
  lastMove: { from: Square; to: Square } | null
  selectedSquare: Square | null
  legalTargets: Square[]
  contactPopupSquare: Square | null
}): Record<string, React.CSSProperties> {
  const styles: Record<string, React.CSSProperties> = {}
  if (opts.lastMove) {
    styles[opts.lastMove.from] = {
      ...styles[opts.lastMove.from],
      backgroundColor: 'rgba(250, 204, 21, 0.45)',
    }
    styles[opts.lastMove.to] = {
      ...styles[opts.lastMove.to],
      backgroundColor: 'rgba(250, 204, 21, 0.55)',
    }
  }
  if (opts.selectedSquare) {
    styles[opts.selectedSquare] = {
      ...styles[opts.selectedSquare],
      backgroundColor: 'rgba(250, 204, 21, 0.72)',
    }
    for (const sq of opts.legalTargets) {
      if (sq === opts.selectedSquare) continue
      styles[sq] = {
        ...styles[sq],
        backgroundColor: 'rgba(34, 197, 94, 0.28)',
      }
    }
  }
  if (opts.contactPopupSquare) {
    styles[opts.contactPopupSquare] = {
      ...styles[opts.contactPopupSquare],
      outline: '2px solid var(--accent)',
      outlineOffset: '-2px',
    }
  }
  return styles
}

function PieceContactTooltip({
  contacts,
  anchor,
}: {
  contacts: PieceContacts
  anchor: { left: string; top: string }
}) {
  return (
    <div
      className="piece-contact-tooltip"
      style={{ left: anchor.left, top: anchor.top }}
      role="tooltip"
      aria-live="polite"
    >
      <p className="piece-contact-tooltip-title">
        {formatPieceRef({ ...contacts.piece, square: contacts.square })}
      </p>
      <div className="piece-contact-tooltip-section">
        <span className="piece-contact-tooltip-label">Defended by</span>
        {contacts.defenders.length === 0 ? (
          <span className="piece-contact-tooltip-none"> — none</span>
        ) : (
          <ul className="piece-contact-tooltip-list">
            {contacts.defenders.map((ref) => (
              <li key={`d-${ref.square}`}>{formatPieceRef(ref)}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="piece-contact-tooltip-section">
        <span className="piece-contact-tooltip-label">Attacked by</span>
        {contacts.attackers.length === 0 ? (
          <span className="piece-contact-tooltip-none"> — none</span>
        ) : (
          <ul className="piece-contact-tooltip-list">
            {contacts.attackers.map((ref) => (
              <li key={`a-${ref.square}`}>{formatPieceRef(ref)}</li>
            ))}
          </ul>
        )}
      </div>
      <p className="piece-contact-tooltip-dismiss">Click piece again to close</p>
    </div>
  )
}

function formatOpeningLabel(info: OpeningInfo | null | undefined): string | null {
  if (!info?.name || info.name === 'Starting position') return null
  return info.eco ? `${info.eco} — ${info.name}` : info.name
}

function formatEval(e: EngineEvalResponse): string {
  if (e.mate_white != null) {
    const m = e.mate_white
    if (m > 0) return `M${m} (White mates)`
    if (m < 0) return `M${-m} (Black mates)`
    return 'Draw (stalemate / dead?)'
  }
  if (e.cp_white == null) return '—'
  const pawns = (e.cp_white / 100).toFixed(2)
  return `${e.cp_white >= 0 ? '+' : ''}${pawns} (White POV)`
}

function formatPlanMoveLabel(step: PlanStep): string {
  const side = step.mover === 'white' ? 'W' : 'B'
  const num =
    step.mover === 'white'
      ? Math.ceil(step.ply / 2)
      : Math.floor(step.ply / 2)
  let label = `${side}${num}: ${step.san}`
  if (step.is_check) {
    label += ` — check (${step.legal_moves_count} replies)`
  }
  return label
}

function MoveLabelBadges({ labels }: { labels: MoveEventLabel[] }) {
  if (!labels.length) return null
  return (
    <span className="move-label-badges">
      {labels.map((label) => (
        <span key={label} className={`move-label move-label--${label}`}>
          {moveEventLabelText(label)}
        </span>
      ))}
    </span>
  )
}

type LineState = { moves: StoredMove[]; cursor: number }

export default function App() {
  const [line, setLine] = useState<LineState>({ moves: [], cursor: 0 })
  const lineRef = useRef(line)
  lineRef.current = line
  const { moves, cursor } = line

  const game = useMemo(() => playThrough(moves, cursor), [moves, cursor])
  const gameFen = game.fen()

  const [planData, setPlanData] = useState<EnginePlanResponse | null>(null)
  const [planViewActive, setPlanViewActive] = useState(false)
  const [planStep, setPlanStep] = useState(0)
  const [planLoading, setPlanLoading] = useState(false)
  const [planError, setPlanError] = useState<string | null>(null)
  const [openaiConfigured, setOpenaiConfigured] = useState<boolean | null>(null)

  const [studyCatalog, setStudyCatalog] = useState<StudyGameCatalogEntry[]>([])
  const [studyGameId, setStudyGameId] = useState('opera')
  const [studyLoading, setStudyLoading] = useState(false)
  const [studyError, setStudyError] = useState<string | null>(null)
  const [studyTitle, setStudyTitle] = useState<string | null>(null)
  const [overlaysMinimized, setOverlaysMinimized] = useState(false)
  const [studyNavMode, setStudyNavMode] = useState<'all' | 'highlights'>('all')

  const fen = useMemo(() => {
    if (!planViewActive || !planData) return gameFen
    if (planStep === 0) return planData.start_fen
    return planData.steps[planStep - 1]?.fen ?? gameFen
  }, [planViewActive, planData, planStep, gameFen])

  const lastMove = useMemo((): { from: Square; to: Square } | null => {
    if (planViewActive && planData && planStep > 0) {
      const s = planData.steps[planStep - 1]
      return { from: s.uci.slice(0, 2) as Square, to: s.uci.slice(2, 4) as Square }
    }
    if (cursor < 1) return null
    const m = moves[cursor - 1]
    return { from: m.from, to: m.to }
  }, [planViewActive, planData, planStep, moves, cursor])

  const captureState = useMemo(
    () => deriveCaptures(moves.slice(0, cursor)),
    [moves, cursor],
  )

  const movesUci = useMemo(
    () => moves.slice(0, cursor).map(storedMoveToUci),
    [moves, cursor],
  )

  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null)
  const [analyzeLoading, setAnalyzeLoading] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [showSquareColors, setShowSquareColors] = useState(true)
  const [showAttacks, setShowAttacks] = useState(true)
  const [showUndefended, setShowUndefended] = useState(true)
  const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>(
    'white',
  )

  const [engineOk, setEngineOk] = useState<boolean | null>(null)
  const [enginePath, setEnginePath] = useState<string>('')
  const [engineDepth, setEngineDepth] = useState(ENGINE_DEPTH_DEFAULT)
  const [evalResult, setEvalResult] = useState<EngineEvalResponse | null>(null)
  const [evalError, setEvalError] = useState<string | null>(null)
  const [evalLoading, setEvalLoading] = useState(false)

  const [accuracyScores, setAccuracyScores] = useState<
    (MoveQualityResponse | null)[]
  >([])
  const [accuracyLoading, setAccuracyLoading] = useState(false)
  const [accuracyError, setAccuracyError] = useState<string | null>(null)
  const scoringRequestRef = useRef(0)

  const [vsEngineMode, setVsEngineMode] = useState<VsEngineMode>('engine_black')
  const [whiteOpeningPresetId, setWhiteOpeningPresetId] = useState('london')
  const userColor = userPieceColor(vsEngineMode)
  const engineColor = enginePieceColor(vsEngineMode)
  const [engineMoveLoading, setEngineMoveLoading] = useState(false)
  const [enginePlayError, setEnginePlayError] = useState<string | null>(null)
  const enginePlayRequestRef = useRef(0)
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null)
  const [contactPopupSquare, setContactPopupSquare] = useState<Square | null>(
    null,
  )
  /** Single-click: show threat circles for this piece (any color). */
  const [threatViewSquare, setThreatViewSquare] = useState<Square | null>(null)
  const clickTimingRef = useRef<{ square: Square; time: number } | null>(null)
  const singleClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    setAnalyzeLoading(true)
    analyzePosition(fen, movesUci)
      .then((a) => {
        if (!cancelled) {
          setAnalysis(a)
          setAnalyzeError(null)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setAnalyzeError(
            e instanceof ApiClientError
              ? e.message
              : e instanceof Error
                ? e.message
                : String(e),
          )
        }
      })
      .finally(() => {
        if (!cancelled) setAnalyzeLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [fen, movesUci])

  useEffect(() => {
    engineStatus()
      .then((s) => {
        setEngineOk(s.ok)
        setEnginePath(s.path)
      })
      .catch(() => setEngineOk(false))
    openaiStatus()
      .then((s) => setOpenaiConfigured(s.configured))
      .catch(() => setOpenaiConfigured(false))
    fetchStudyCatalog()
      .then((c) => {
        setStudyCatalog(c.games)
        if (c.games.length && !c.games.some((g) => g.id === studyGameId)) {
          setStudyGameId(c.games[0].id)
        }
      })
      .catch(() => setStudyCatalog([]))
  }, [])

  useEffect(() => {
    if (planViewActive) {
      setEngineMoveLoading(false)
      return
    }
    if (!engineColor) {
      setEngineMoveLoading(false)
      return
    }
    if (cursor !== moves.length) {
      setEngineMoveLoading(false)
      return
    }
    const g = playThrough(moves, moves.length)
    if (g.isGameOver()) {
      setEngineMoveLoading(false)
      return
    }
    if (g.turn() !== engineColor) {
      setEngineMoveLoading(false)
      return
    }

    const reqId = ++enginePlayRequestRef.current
    let cancelled = false
    setEngineMoveLoading(true)
    setEnginePlayError(null)

    const fenBefore = g.fen()
    const preset =
      engineColor === 'w'
        ? getPresetWhiteMove(moves, getWhiteOpeningPreset(whiteOpeningPresetId))
        : null

    const finishEngineMove = (uci: string, errorMsg?: string) => {
      if (cancelled || enginePlayRequestRef.current !== reqId) return
      if (errorMsg) {
        setEnginePlayError(errorMsg)
        setEngineMoveLoading(false)
        return
      }
      const trial = playThrough(moves, moves.length)
      if (trial.fen() !== fenBefore) {
        setEngineMoveLoading(false)
        return
      }
      const sm = applyUci(trial, uci)
      if (!sm) {
        setEnginePlayError('Engine move could not be played')
        setEngineMoveLoading(false)
        return
      }
      setLine((s) => {
        if (s.cursor !== s.moves.length) return s
        const cur = playThrough(s.moves, s.moves.length)
        if (cur.fen() !== fenBefore) return s
        return {
          moves: [...s.moves, sm],
          cursor: s.moves.length + 1,
        }
      })
      setEngineMoveLoading(false)
    }

    if (preset) {
      finishEngineMove(preset)
      return () => {
        cancelled = true
      }
    }

    engineEval(fenBefore, engineDepth)
      .then((r) => {
        if (cancelled || enginePlayRequestRef.current !== reqId) return
        if (!r.bestmove_uci) {
          setEnginePlayError('Engine returned no move')
          setEngineMoveLoading(false)
          return
        }
        finishEngineMove(r.bestmove_uci)
      })
      .catch((e: unknown) => {
        if (!cancelled && enginePlayRequestRef.current === reqId) {
          setEnginePlayError(
            e instanceof ApiClientError
              ? e.message
              : e instanceof Error
                ? e.message
                : String(e),
          )
          setEngineMoveLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [
    moves,
    cursor,
    vsEngineMode,
    engineColor,
    engineDepth,
    planViewActive,
    whiteOpeningPresetId,
  ])

  useEffect(() => {
    setAccuracyScores((prev) =>
      prev.length > moves.length ? prev.slice(0, moves.length) : prev,
    )
  }, [moves.length])

  useEffect(() => {
    if (planViewActive) return
    if (cursor !== moves.length || moves.length === 0) return

    const movesBy = moves.map((m) => m.by)
    const idx = findLatestUnscoredUserMoveIndex(
      movesBy,
      accuracyScores,
      userColor,
    )
    if (idx < 0) return

    const reqId = ++scoringRequestRef.current
    let cancelled = false
    setAccuracyLoading(true)
    setAccuracyError(null)
    const fenBefore = playThrough(moves, idx).fen()
    const playedUci = storedMoveToUci(moves[idx])

    scoreMoveQuality(fenBefore, playedUci, ACCURACY_DEPTH)
      .then((result) => {
        if (cancelled || scoringRequestRef.current !== reqId) return
        setAccuracyScores((prev) => {
          const next = [...prev]
          while (next.length <= idx) next.push(null)
          next[idx] = result
          return next
        })
      })
      .catch((e: unknown) => {
        if (cancelled || scoringRequestRef.current !== reqId) return
        setAccuracyError(
          e instanceof ApiClientError
            ? e.message
            : e instanceof Error
              ? e.message
              : String(e),
        )
      })
      .finally(() => {
        if (!cancelled && scoringRequestRef.current === reqId) {
          setAccuracyLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [moves, cursor, userColor, planViewActive, accuracyScores])

  const accuracySummary = useMemo(
    () =>
      summarizeAccuracy(
        accuracyScores,
        moves.map((m) => m.by),
        userColor,
      ),
    [accuracyScores, moves, userColor],
  )

  const accuracyPendingIdx = useMemo(() => {
    if (planViewActive || cursor !== moves.length || moves.length === 0) {
      return -1
    }
    return findLatestUnscoredUserMoveIndex(
      moves.map((m) => m.by),
      accuracyScores,
      userColor,
    )
  }, [planViewActive, cursor, moves, accuracyScores, userColor])

  const gameForInput = useMemo(
    () => playThrough(moves, cursor),
    [moves, cursor],
  )

  const legalTargets = useMemo(() => {
    if (!selectedSquare) return [] as Square[]
    return legalTargetsFrom(gameForInput, selectedSquare)
  }, [selectedSquare, gameForInput])

  const legalTargetSet = useMemo(
    () => new Set<string>(legalTargets),
    [legalTargets],
  )

  const threatTargetSet = useMemo(() => {
    if (!threatViewSquare || !analysis?.piece_threats) return new Set<string>()
    return new Set(analysis.piece_threats[threatViewSquare] ?? [])
  }, [threatViewSquare, analysis])

  useEffect(() => {
    setSelectedSquare(null)
    setContactPopupSquare(null)
    setThreatViewSquare(null)
    if (singleClickTimerRef.current) {
      clearTimeout(singleClickTimerRef.current)
      singleClickTimerRef.current = null
    }
    clickTimingRef.current = null
  }, [fen, cursor, planViewActive, engineMoveLoading])

  const contactPopup = useMemo((): PieceContacts | null => {
    if (!contactPopupSquare || !analysis?.piece_contacts) return null
    return analysis.piece_contacts[contactPopupSquare] ?? null
  }, [contactPopupSquare, analysis])

  const contactAnchor = useMemo(() => {
    if (!contactPopupSquare) return null
    return squareAnchorPercent(contactPopupSquare, boardOrientation)
  }, [contactPopupSquare, boardOrientation])

  const commitMove = useCallback((from: Square, to: Square) => {
    const s = lineRef.current
    const g = playThrough(s.moves, s.cursor)
    const sm = tryMove(g, from, to)
    if (!sm) return false
    setLine({
      moves: [...s.moves.slice(0, s.cursor), sm],
      cursor: s.cursor + 1,
    })
    setEnginePlayError(null)
    setSelectedSquare(null)
    setContactPopupSquare(null)
    setThreatViewSquare(null)
    return true
  }, [])

  const handleMoveClick = useCallback(
    (sq: Square, g: Chess) => {
      if (selectedSquare) {
        if (sq === selectedSquare) {
          setSelectedSquare(null)
          setThreatViewSquare(null)
          return
        }
        if (legalTargetsFrom(g, selectedSquare).includes(sq)) {
          commitMove(selectedSquare, sq)
          return
        }
        if (canUserSelectSquare(g, sq, userColor)) {
          setSelectedSquare(sq)
          return
        }
        setSelectedSquare(null)
        return
      }

      if (canUserSelectSquare(g, sq, userColor)) {
        setSelectedSquare(sq)
      }
    },
    [selectedSquare, userColor, commitMove],
  )

  const onSquareClick = useCallback(
    ({ square }: SquareHandlerArgs) => {
      if (planViewActive || engineMoveLoading) return
      const sq = square as Square
      const now = Date.now()
      const last = clickTimingRef.current

      const scheduleSingleClick = () => {
        if (singleClickTimerRef.current) {
          clearTimeout(singleClickTimerRef.current)
        }
        singleClickTimerRef.current = setTimeout(() => {
          singleClickTimerRef.current = null
          clickTimingRef.current = null

          const s = lineRef.current
          const g = playThrough(s.moves, s.cursor)
          if (g.isGameOver()) return
          const pieceOnSquare = g.get(sq)

          if (contactPopupSquare === sq && pieceOnSquare) {
            setContactPopupSquare(null)
            return
          }

          if (!pieceOnSquare) {
            setContactPopupSquare(null)
            setThreatViewSquare(null)
            handleMoveClick(sq, g)
            return
          }

          if (threatViewSquare === sq && !selectedSquare) {
            setThreatViewSquare(null)
          } else {
            setThreatViewSquare(sq)
          }

          handleMoveClick(sq, g)
        }, DOUBLE_CLICK_MS)
      }

      if (last?.square === sq && now - last.time < DOUBLE_CLICK_MS) {
        if (singleClickTimerRef.current) {
          clearTimeout(singleClickTimerRef.current)
          singleClickTimerRef.current = null
        }
        clickTimingRef.current = null

        const g = playThrough(lineRef.current.moves, lineRef.current.cursor)
        if (!g.get(sq)) return
        setContactPopupSquare(sq)
        return
      }

      clickTimingRef.current = { square: sq, time: now }
      scheduleSingleClick()
    },
    [
      planViewActive,
      engineMoveLoading,
      contactPopupSquare,
      threatViewSquare,
      selectedSquare,
      handleMoveClick,
    ],
  )

  const squareStyles = useMemo(
    () =>
      buildSquareStyles({
        lastMove: showSquareColors ? lastMove : null,
        selectedSquare,
        legalTargets,
        contactPopupSquare,
      }),
    [showSquareColors, lastMove, selectedSquare, legalTargets, contactPopupSquare],
  )

  const squareRenderer = useMemo<SquareRenderer>(
    () =>
      function SquareWithOverlays({ piece, square, children }) {
        const attackKind =
          showSquareColors && showAttacks && analysis
            ? analysis.attacks[square]
            : null
        const style: React.CSSProperties = {
          width: '100%',
          height: '100%',
          position: 'relative',
          zIndex: 1,
          boxSizing: 'border-box',
          ...squareStyles[square],
          ...(attackKind
            ? { border: `5px solid ${ATTACK_BORDER_COLORS[attackKind]}` }
            : {}),
        }
        const showDot =
          showSquareColors &&
          showUndefended &&
          analysis &&
          piece &&
          (analysis.undefended.white.includes(square) ||
            analysis.undefended.black.includes(square))
        const showLegal =
          selectedSquare &&
          legalTargetSet.has(square) &&
          square !== selectedSquare
        const legalCapture = showLegal && Boolean(piece)
        const showThreat =
          threatViewSquare &&
          threatTargetSet.has(square) &&
          square !== threatViewSquare
        const threatCapture = showThreat && Boolean(piece)
        return (
          <div style={style}>
            {children}
            {showLegal ? (
              <span
                className={
                  legalCapture
                    ? 'legal-move-indicator legal-move-indicator--capture'
                    : 'legal-move-indicator'
                }
                aria-hidden
              />
            ) : null}
            {showThreat ? (
              <span
                className={
                  threatCapture
                    ? 'threat-indicator threat-indicator--capture'
                    : 'threat-indicator'
                }
                aria-hidden
              />
            ) : null}
            {showDot ? (
              <span className="undefended-piece-dot" aria-hidden />
            ) : null}
          </div>
        )
      },
    [
      squareStyles,
      analysis,
      showSquareColors,
      showAttacks,
      showUndefended,
      selectedSquare,
      legalTargetSet,
      threatViewSquare,
      threatTargetSet,
    ],
  )

  const exitPlanView = () => {
    setPlanViewActive(false)
    setPlanStep(0)
    setStudyTitle(null)
    setStudyNavMode('all')
  }

  const startStudy = async () => {
    setStudyLoading(true)
    setStudyError(null)
    try {
      const lesson = await fetchStudyLesson(studyGameId)
      setPlanData({
        start_fen: lesson.start_fen,
        bestmove_uci: null,
        pv_uci: lesson.moves_uci,
        cp_white: null,
        mate_white: null,
        steps: lesson.steps,
        narrative: lesson.narrative,
        intro: lesson.intro,
        summary: lesson.summary,
        explain_error: lesson.explain_error,
        explain_code: lesson.explain_code ?? null,
      })
      setStudyTitle(lesson.title)
      setStudyNavMode('all')
      setPlanStep(0)
      setPlanViewActive(true)
      setVsEngineMode('off')
      setLine({ moves: [], cursor: 0 })
      setEnginePlayError(null)
    } catch (e: unknown) {
      setStudyError(
        e instanceof ApiClientError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e),
      )
    } finally {
      setStudyLoading(false)
    }
  }

  const runPlan = async () => {
    setPlanLoading(true)
    setPlanError(null)
    try {
      const planUserColor: 'white' | 'black' =
        userColor === 'b'
          ? 'black'
          : userColor === 'w'
            ? 'white'
            : game.turn() === 'w'
              ? 'white'
              : 'black'
      const plan = await fetchEnginePlan(
        gameFen,
        engineDepth,
        planUserColor,
        openaiConfigured === true,
      )
      setPlanData(plan)
      setEvalResult({
        bestmove_uci: plan.bestmove_uci,
        pv_uci: plan.pv_uci,
        cp_white: plan.cp_white,
        mate_white: plan.mate_white,
      })
      setPlanStep(0)
      setPlanViewActive(true)
    } catch (e: unknown) {
      setPlanError(
        e instanceof ApiClientError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e),
      )
    } finally {
      setPlanLoading(false)
    }
  }

  const planStepBack = () => setPlanStep((s) => Math.max(0, s - 1))
  const planStepForward = () =>
    setPlanStep((s) =>
      planData ? Math.min(planData.steps.length, s + 1) : s,
    )

  const studyActive = planViewActive && !!studyTitle

  const studyHighlightSteps = useMemo(() => {
    if (!planData || !studyActive) return [0]
    return highlightPlanSteps(planData.steps, planData.highlight_plies)
  }, [planData, studyActive])

  const onStudyStepBack = () => {
    if (studyNavMode === 'highlights') {
      setPlanStep((s) => prevHighlightStep(s, studyHighlightSteps))
    } else {
      planStepBack()
    }
  }

  const onStudyStepForward = () => {
    if (studyNavMode === 'highlights') {
      setPlanStep((s) => nextHighlightStep(s, studyHighlightSteps))
    } else {
      planStepForward()
    }
  }

  const studyStepBackDisabled =
    studyNavMode === 'highlights'
      ? planStep <= studyHighlightSteps[0]!
      : planStep === 0

  const studyStepForwardDisabled =
    studyNavMode === 'highlights'
      ? planStep >= studyHighlightSteps[studyHighlightSteps.length - 1]!
      : !planData || planStep >= planData.steps.length

  const historyBack = () =>
    setLine((s) => ({ ...s, cursor: Math.max(0, s.cursor - 1) }))

  const historyForward = () =>
    setLine((s) => ({
      ...s,
      cursor: Math.min(s.moves.length, s.cursor + 1),
    }))

  const undo = useCallback(() => {
    setLine((s) => {
      if (s.cursor !== s.moves.length || s.moves.length === 0) return s

      if (vsEngineMode !== 'off') {
        if (s.moves.length >= 2) {
          const next = s.moves.slice(0, -2)
          return { moves: next, cursor: next.length }
        }
        return { moves: [], cursor: 0 }
      }

      const next = s.moves.slice(0, -1)
      return { moves: next, cursor: next.length }
    })
    setEnginePlayError(null)
  }, [vsEngineMode])

  const reset = () => {
    setLine({ moves: [], cursor: 0 })
    setEnginePlayError(null)
    setPlanData(null)
    setPlanViewActive(false)
    setPlanStep(0)
    setPlanError(null)
    setStudyTitle(null)
    setAccuracyScores([])
    setAccuracyError(null)
    scoringRequestRef.current = 0
  }

  const runEval = async () => {
    setEvalLoading(true)
    setEvalError(null)
    try {
      const r = await engineEval(fen, engineDepth)
      setEvalResult(r)
    } catch (e: unknown) {
      setEvalError(
        e instanceof ApiClientError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e),
      )
      setEvalResult(null)
    } finally {
      setEvalLoading(false)
    }
  }

  const browsing = !planViewActive && cursor < moves.length
  const planStatus =
    planViewActive && planData
      ? studyTitle
        ? `Study: ${studyTitle} — step ${planStep} / ${planData.steps.length}`
        : `Engine plan: step ${planStep} / ${planData.steps.length} (from this position)`
      : null

  const planStepExplanation = useMemo(() => {
    if (!planViewActive || !planData) return null
    if (planStep === 0) {
      return (
        planData.intro ||
        'Starting position — use → to step through what Stockfish expects next.'
      )
    }
    const step = planData.steps[planStep - 1]
    return step?.explanation || null
  }, [planViewActive, planData, planStep])
  const sideOpenings = analysis?.openings
  const whiteOpeningLabel = formatOpeningLabel(
    sideOpenings?.white ??
      (analysis?.opening && cursor >= 1 ? analysis.opening : null),
  )
  const blackOpeningLabel = formatOpeningLabel(sideOpenings?.black ?? null)
  const lineOpeningLabel = formatOpeningLabel(
    sideOpenings?.line ?? analysis?.opening,
  )

  const statusLine = analyzeLoading
    ? 'Updating position analysis…'
    : analysis
      ? `${analysis.turn} to move${analysis.is_check ? ' — check' : ''}${
          analysis.is_checkmate ? ' — checkmate' : ''
        }${analysis.is_stalemate ? ' — stalemate' : ''}${
          browsing ? ` — replay (${cursor}/${moves.length} plies)` : ''
        }${planStatus ? ` — ${planStatus}` : ''}`
      : analyzeError
        ? 'Position analysis unavailable'
        : 'Loading position…'

  const playStatus =
    vsEngineMode !== 'off' && engineMoveLoading
      ? engineColor === 'b'
        ? 'Stockfish is thinking (Black)…'
        : 'White is playing…'
      : enginePlayError
        ? `Engine: ${enginePlayError}`
        : null

  const planToolbar = planData ? (
    <div className="board-toolbar plan-toolbar">
      <button
        type="button"
        className="icon-btn"
        aria-label="Previous plan step"
        disabled={studyActive ? studyStepBackDisabled : planStep === 0}
        onClick={studyActive ? onStudyStepBack : planStepBack}
      >
        ←
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label="Next plan step"
        disabled={
          studyActive ? studyStepForwardDisabled : planStep >= planData.steps.length
        }
        onClick={studyActive ? onStudyStepForward : planStepForward}
      >
        →
      </button>
      <button type="button" onClick={exitPlanView}>
        Exit plan (back to game)
      </button>
    </div>
  ) : null

  const planListSteps = planData
    ? planData.steps
        .map((s, i) => ({ step: s, planStepIndex: i + 1 }))
        .filter(({ planStepIndex }) =>
          studyActive && studyNavMode === 'highlights'
            ? studyHighlightSteps.includes(planStepIndex)
            : true,
        )
    : []

  const planStepList = planData ? (
    <ul className="plan-step-list">
      {!(studyActive && studyNavMode === 'highlights') ? (
        <li>
          <button
            type="button"
            className={planStep === 0 ? 'plan-step-active' : ''}
            onClick={() => setPlanStep(0)}
          >
            Start (current position)
          </button>
        </li>
      ) : null}
      {planListSteps.map(({ step, planStepIndex }) => {
        const labels = stepEventLabels(step)
        return (
          <li key={step.ply}>
            <button
              type="button"
              className={
                planStep === planStepIndex ? 'plan-step-active' : ''
              }
              onClick={() => setPlanStep(planStepIndex)}
            >
              <span className="plan-step-line">
                {formatPlanMoveLabel(step)}
                <MoveLabelBadges labels={labels} />
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  ) : null

  const studyJumpRow =
    studyActive && planData ? (
      <div className="study-jump-row" aria-label="Jump to key moments">
        {studyHighlightSteps
          .filter((idx) => idx > 0)
          .map((planStepIndex) => {
            const step = planData.steps[planStepIndex - 1]!
            const labels = stepEventLabels(step)
            return (
              <button
                key={step.ply}
                type="button"
                className={`study-jump-chip${
                  planStep === planStepIndex ? ' study-jump-chip--active' : ''
                }`}
                onClick={() => setPlanStep(planStepIndex)}
              >
                {formatPlanMoveLabel(step)}
                <MoveLabelBadges labels={labels} />
              </button>
            )
          })}
      </div>
    ) : null

  const planExplanation = planStepExplanation ? (
    <div className="plan-step-explanation" aria-live="polite">
      <h3 className="plan-step-explanation-title">
        {planStep === 0
          ? 'Before the line'
          : planData?.steps[planStep - 1]
            ? formatPlanMoveLabel(planData.steps[planStep - 1])
            : `Move ${planStep}`}
      </h3>
      <p>{planStepExplanation}</p>
    </div>
  ) : null

  const overlaysPanel = (
    <div
      className={`overlays-panel${overlaysMinimized ? ' overlays-panel--minimized' : ''}`}
    >
      <div className="overlays-panel-header">
        <h2>Overlays</h2>
        <button
          type="button"
          className="overlays-toggle"
          aria-expanded={!overlaysMinimized}
          onClick={() => setOverlaysMinimized((m) => !m)}
        >
          {overlaysMinimized ? 'Show' : 'Minimize'}
        </button>
      </div>
      {!overlaysMinimized ? (
        <>
          <label className="check check--master">
            <input
              type="checkbox"
              checked={showSquareColors}
              onChange={(e) => setShowSquareColors(e.target.checked)}
            />
            Square colors (attack rings, undefended dots, last-move highlight)
          </label>
          <div
            className={`overlay-subtoggles${showSquareColors ? '' : ' overlay-subtoggles--off'}`}
          >
            <label className="check">
              <input
                type="checkbox"
                checked={showAttacks}
                disabled={!showSquareColors}
                onChange={(e) => setShowAttacks(e.target.checked)}
              />
              Attack rings per square (who attacks that square: blue = White,
              red = Black, purple = both, green = neither)
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={showUndefended}
                disabled={!showSquareColors}
                onChange={(e) => setShowUndefended(e.target.checked)}
              />
              Undefended pieces (red dot on the piece)
            </label>
          </div>
          <p className="hint overlays-hint">
            A friendly piece is undefended when no friendly piece attacks its
            square (python-chess <code>board.attackers(color, square)</code>).
          </p>
        </>
      ) : null}
    </div>
  )

  return (
    <div className="app">
      <header className="header">
        <h1>Knight Vision</h1>
        <p className="tagline">
          Offline practice board: attack rings, undefended markers, Stockfish.
        </p>
      </header>

      <div className="layout">
        <section className={`board-wrap${studyActive ? ' board-wrap--study' : ''}`}>
          {studyActive && planData ? (
            <div className="study-row">
              <div className="study-board-col">
                <div className="capture-zone capture-zone--black">
                  <div className="capture-zone-header">
                    <span className="capture-zone-title">Black lost</span>
                    <span className="material-score" aria-live="polite">
                      <span className="material-score-label">Material taken</span>
                      <span className="material-score-nums">
                        {captureState.whitePts} – {captureState.blackPts}
                      </span>
                    </span>
                  </div>
                  <div
                    className="capture-pieces"
                    aria-label="Pieces White captured from Black"
                  >
                    {captureState.blackLost.length === 0 ? (
                      <span className="capture-empty">—</span>
                    ) : (
                      captureState.blackLost.map((t, i) => (
                        <span
                          key={`bl-${i}-${t}`}
                          className="capture-glyph capture-glyph--black"
                          title={`Black ${t}`}
                        >
                          {GLYPH_BLACK[t] ?? t}
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <div className="board-surface">
                  <Chessboard
                    options={{
                      position: fen,
                      boardOrientation,
                      squareStyles,
                      squareRenderer,
                      onSquareClick,
                      allowDragging: false,
                      allowAutoScroll: true,
                      ...BOARD_NOTATION_OPTIONS,
                    }}
                  />
                </div>
                <div className="capture-zone capture-zone--white">
                  <div className="capture-zone-header">
                    <span className="capture-zone-title">White lost</span>
                    <span className="material-score" aria-live="polite">
                      <span className="material-score-label">Material taken</span>
                      <span className="material-score-nums">
                        {captureState.whitePts} – {captureState.blackPts}
                      </span>
                    </span>
                  </div>
                  <div
                    className="capture-pieces"
                    aria-label="Pieces Black captured from White"
                  >
                    {captureState.whiteLost.length === 0 ? (
                      <span className="capture-empty">—</span>
                    ) : (
                      captureState.whiteLost.map((t, i) => (
                        <span
                          key={`wl-${i}-${t}`}
                          className="capture-glyph capture-glyph--white"
                          title={`White ${t}`}
                        >
                          {GLYPH_WHITE[t] ?? t}
                        </span>
                      ))
                    )}
                  </div>
                </div>
                {overlaysPanel}
                {planToolbar}
                <p className="status">{statusLine}</p>
              </div>
              <aside className="study-panel" aria-label="Study annotations">
                <p className="plan-walkthrough-title">
                  Studying: {studyTitle}
                </p>
                <div className="study-nav-modes" role="tablist" aria-label="Navigation mode">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={studyNavMode === 'all'}
                    className={
                      studyNavMode === 'all' ? 'study-nav-mode--active' : ''
                    }
                    onClick={() => setStudyNavMode('all')}
                  >
                    Every move
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={studyNavMode === 'highlights'}
                    className={
                      studyNavMode === 'highlights'
                        ? 'study-nav-mode--active'
                        : ''
                    }
                    onClick={() => setStudyNavMode('highlights')}
                  >
                    Key moments
                  </button>
                </div>
                {studyJumpRow}
                {planExplanation ?? (
                  <p className="hint study-no-note">No note for this step.</p>
                )}
                {planStepList}
              </aside>
            </div>
          ) : (
            <>
              <div className="capture-zone capture-zone--black">
                <div className="capture-zone-header">
                  <span className="capture-zone-title">Black lost</span>
                  <span className="material-score" aria-live="polite">
                    <span className="material-score-label">Material taken</span>
                    <span className="material-score-nums">
                      {captureState.whitePts} – {captureState.blackPts}
                    </span>
                  </span>
                </div>
                <div
                  className="capture-pieces"
                  aria-label="Pieces White captured from Black"
                >
                  {captureState.blackLost.length === 0 ? (
                    <span className="capture-empty">—</span>
                  ) : (
                    captureState.blackLost.map((t, i) => (
                      <span
                        key={`bl-${i}-${t}`}
                        className="capture-glyph capture-glyph--black"
                        title={`Black ${t}`}
                      >
                        {GLYPH_BLACK[t] ?? t}
                      </span>
                    ))
                  )}
                </div>
              </div>
              <div className="board-surface">
                <Chessboard
                  options={{
                    position: fen,
                    boardOrientation,
                    squareStyles,
                    squareRenderer,
                    onSquareClick,
                    allowDragging: false,
                    allowAutoScroll: true,
                    ...BOARD_NOTATION_OPTIONS,
                  }}
                />
                {contactPopup && contactAnchor && !planViewActive ? (
                  <PieceContactTooltip contacts={contactPopup} anchor={contactAnchor} />
                ) : null}
              </div>
              <div className="capture-zone capture-zone--white">
                <div className="capture-zone-header">
                  <span className="capture-zone-title">White lost</span>
                  <span className="material-score" aria-live="polite">
                    <span className="material-score-label">Material taken</span>
                    <span className="material-score-nums">
                      {captureState.whitePts} – {captureState.blackPts}
                    </span>
                  </span>
                </div>
                <div
                  className="capture-pieces"
                  aria-label="Pieces Black captured from White"
                >
                  {captureState.whiteLost.length === 0 ? (
                    <span className="capture-empty">—</span>
                  ) : (
                    captureState.whiteLost.map((t, i) => (
                      <span
                        key={`wl-${i}-${t}`}
                        className="capture-glyph capture-glyph--white"
                        title={`White ${t}`}
                      >
                        {GLYPH_WHITE[t] ?? t}
                      </span>
                    ))
                  )}
                </div>
              </div>
              {overlaysPanel}
              {planViewActive && planData ? (
                <div className="plan-walkthrough">
                  <p className="plan-walkthrough-title">
                    Walking through Stockfish&apos;s predicted line
                  </p>
                  {planToolbar}
                  {planExplanation}
                  {planStepList}
                </div>
              ) : (
                <div className="board-toolbar">
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Previous position"
                    title="Step back through game moves"
                    disabled={cursor === 0}
                    onClick={historyBack}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Next position"
                    title="Step forward through game moves"
                    disabled={cursor === moves.length}
                    onClick={historyForward}
                  >
                    →
                  </button>
                  <button
                    type="button"
                    onClick={undo}
                    title={
                      vsEngineMode !== 'off'
                        ? 'Take back your last move and the engine reply (two plies)'
                        : 'Remove the last move from the line'
                    }
                    disabled={cursor !== moves.length || moves.length === 0}
                  >
                    Undo
                  </button>
                  <button type="button" onClick={reset}>
                    New game
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setBoardOrientation((o) => (o === 'white' ? 'black' : 'white'))
                    }
                  >
                    Flip board
                  </button>
                </div>
              )}
              <p className="status">{statusLine}</p>
              {!planViewActive ? (
                <div className="opening-lines">
                  <p className="status opening-line">
                    <strong>White</strong>{' '}
                    {whiteOpeningLabel ?? (
                      <span className="opening-pending">—</span>
                    )}
                  </p>
                  <p className="status opening-line">
                    <strong>Black</strong>{' '}
                    {blackOpeningLabel ?? (
                      <span className="opening-pending">—</span>
                    )}
                  </p>
                  {lineOpeningLabel &&
                  lineOpeningLabel !== whiteOpeningLabel &&
                  lineOpeningLabel !== blackOpeningLabel ? (
                    <p className="status opening-line opening-line--full">
                      <strong>Line</strong> {lineOpeningLabel}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <p className="hint board-hint">
                Single-click any piece for orange threat/defense circles; then click a
                green square to move yours. Double-click for defender/attacker list.
                Use ← → to replay or branch.
              </p>
              {playStatus ? <p className="status play-status">{playStatus}</p> : null}
              {analyzeError ? (
                <p className="error">Analysis: {analyzeError}</p>
              ) : null}
            </>
          )}
        </section>

        <aside className="sidebar">
          <h2>Study famous games</h2>
          <p className="hint">
            Step through a classic game with visual-awareness notes (attack rings
            and hanging pieces on the board).
          </p>
          <div className="field">
            <label htmlFor="study-game">Game</label>
            <select
              id="study-game"
              value={studyGameId}
              disabled={studyLoading || planViewActive}
              onChange={(e) => setStudyGameId(e.target.value)}
            >
              {studyCatalog.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.year})
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="primary"
            onClick={startStudy}
            disabled={studyLoading || planViewActive || studyCatalog.length === 0}
          >
            {studyLoading ? 'Loading lesson…' : 'Start study walkthrough'}
          </button>
          {studyError ? <p className="error">{studyError}</p> : null}

          <h2>Play vs engine</h2>
          <div className="field">
            <label htmlFor="vs-engine-mode">You play</label>
            <select
              id="vs-engine-mode"
              value={vsEngineMode}
              onChange={(e) => {
                const mode = e.target.value as VsEngineMode
                setVsEngineMode(mode)
                setEnginePlayError(null)
                setBoardOrientation(
                  mode === 'engine_white' ? 'black' : 'white',
                )
              }}
            >
              <option value="engine_black">White (engine plays Black)</option>
              <option value="engine_white">Black (engine plays White)</option>
              <option value="off">Both sides (no engine)</option>
            </select>
          </div>
          {vsEngineMode === 'engine_white' ? (
            <div className="field">
              <label htmlFor="white-opening">White opening (engine)</label>
              <select
                id="white-opening"
                value={whiteOpeningPresetId}
                disabled={moves.length > 0}
                onChange={(e) => setWhiteOpeningPresetId(e.target.value)}
              >
                {WHITE_OPENING_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <p className="hint">
                Pick before the first move. White follows this book line while
                it matches; then Stockfish at engine depth. Start a new game to
                change opening.
              </p>
            </div>
          ) : null}
          <p className="hint">
            Engine replies use engine depth below. Your moves are scored at
            depth {ACCURACY_DEPTH}.
          </p>

          <h2>Your accuracy</h2>
          <p className="accuracy-panel" aria-live="polite">
            {accuracyError ? (
              <>Accuracy unavailable for the last move.</>
            ) : accuracyLoading || accuracyPendingIdx >= 0 ? (
              <>Scoring your move (depth {ACCURACY_DEPTH})…</>
            ) : accuracySummary.accuracyPercent != null ? (
              <>
                <strong>{accuracySummary.accuracyPercent}%</strong>
                {' · '}
                {accuracySummary.scored.length} move
                {accuracySummary.scored.length === 1 ? '' : 's'}
                {accuracySummary.avgCpLoss != null
                  ? ` · avg ${accuracySummary.avgCpLoss} cp loss`
                  : ''}
              </>
            ) : (
              <>Play a move to start accuracy tracking.</>
            )}
          </p>
          {accuracySummary.last ? (
            <p className="hint accuracy-last">
              Last move:{' '}
              <strong>
                {classificationLabel(accuracySummary.last.classification)}
              </strong>
              {accuracySummary.last.cp_loss > 0
                ? ` (+${accuracySummary.last.cp_loss} cp vs best)`
                : accuracySummary.last.played_uci ===
                    accuracySummary.last.best_uci
                  ? ' (engine best)'
                  : ''}
            </p>
          ) : null}
          <p className="hint">
            Accuracy uses Stockfish depth {ACCURACY_DEPTH}. Engine moves and
            analysis below use engine depth ({engineDepth}).
          </p>
          {accuracyError ? (
            <p className="error">{accuracyError}</p>
          ) : null}

          <h2>Stockfish</h2>
          <p className="engine-meta">
            Engine:{' '}
            {engineOk === null
              ? 'checking…'
              : engineOk
                ? `ok (${enginePath})`
                : `unavailable (${enginePath})`}
          </p>
          <div className="field">
            <label htmlFor="engine-depth">Engine depth</label>
            <input
              id="engine-depth"
              type="number"
              min={1}
              max={40}
              value={engineDepth}
              onChange={(e) =>
                setEngineDepth(Number(e.target.value) || ENGINE_DEPTH_DEFAULT)
              }
            />
          </div>
          <button
            type="button"
            className="primary"
            onClick={runEval}
            disabled={evalLoading || planLoading || engineMoveLoading}
          >
            {evalLoading ? 'Stockfish is thinking…' : 'Evaluate position'}
          </button>
          <button
            type="button"
            className="primary secondary"
            onClick={runPlan}
            disabled={planLoading || evalLoading || engineMoveLoading}
            title="Stockfish main line; step through on the board. English story needs server OpenAI key."
          >
            {planLoading
              ? openaiConfigured
                ? 'Stockfish + AI explanation…'
                : 'Stockfish is building the line…'
              : 'Explain & walk plan'}
          </button>
          {openaiConfigured === false ? (
            <p className="hint">
              AI explanations need <code>OPENAI_API_KEY</code> on the server
              (repo-root <code>.env</code>). Walk-through without text still works.
            </p>
          ) : null}
          {planError ? <p className="error">{planError}</p> : null}
          {evalError ? <p className="error">{evalError}</p> : null}
          {planData?.narrative ? (
            <div className="plan-narrative">
              <h3>Full engine story</h3>
              <p className="hint">
                Step through the board to read one move at a time above the list.
              </p>
              <div className="plan-narrative-body">{planData.narrative}</div>
              {planData.summary ? (
                <p className="plan-summary">
                  <strong>Bottom line:</strong> {planData.summary}
                </p>
              ) : null}
              {planData.explain_error ? (
                <p className="error">{planData.explain_error}</p>
              ) : null}
            </div>
          ) : null}
          {evalResult ? (
            <div className="eval-out">
              <div>
                <strong>Eval</strong> {formatEval(evalResult)}
              </div>
              <div>
                <strong>Best</strong> {evalResult.bestmove_uci ?? '—'}
              </div>
              {evalResult.pv_uci.length ? (
                <div className="pv">
                  <strong>PV</strong> {evalResult.pv_uci.slice(0, 8).join(' ')}
                </div>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
