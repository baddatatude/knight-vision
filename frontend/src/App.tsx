import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Chessboard,
  type PieceDropHandlerArgs,
  type PieceHandlerArgs,
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
  openaiStatus,
  type AnalyzeResponse,
  type EngineEvalResponse,
  type EnginePlanResponse,
} from './api'
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

/** Inset frame thickness (px) for attack / unattacked square rings */
const ATTACK_RING_WIDTH = 6

function buildSquareStyles(
  analysis: AnalyzeResponse | null,
  opts: {
    showAttacks: boolean
    lastMove: { from: Square; to: Square } | null
  },
): Record<string, React.CSSProperties> {
  const styles: Record<string, React.CSSProperties> = {}
  const w = ATTACK_RING_WIDTH
  if (analysis && opts.showAttacks) {
    for (const sq of Object.keys(analysis.attacks)) {
      const k = analysis.attacks[sq]
      let ring: string | undefined
      if (k === 'white') ring = `inset 0 0 0 ${w}px rgba(59, 130, 246, 0.92)`
      else if (k === 'black') ring = `inset 0 0 0 ${w}px rgba(220, 38, 38, 0.92)`
      else if (k === 'both') ring = `inset 0 0 0 ${w}px rgba(147, 51, 234, 0.95)`
      else if (k === 'none') ring = `inset 0 0 0 ${w}px rgba(22, 163, 74, 0.88)`
      if (!ring) continue
      const prev = styles[sq]?.boxShadow
      styles[sq] = {
        ...styles[sq],
        boxShadow: prev ? `${prev}, ${ring}` : ring,
      }
    }
  }
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
  return styles
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
  const [showAttacks, setShowAttacks] = useState(true)
  const [showUndefended, setShowUndefended] = useState(true)
  const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>(
    'white',
  )

  const [engineOk, setEngineOk] = useState<boolean | null>(null)
  const [enginePath, setEnginePath] = useState<string>('')
  const [depth, setDepth] = useState(12)
  const [evalResult, setEvalResult] = useState<EngineEvalResponse | null>(null)
  const [evalError, setEvalError] = useState<string | null>(null)
  const [evalLoading, setEvalLoading] = useState(false)

  const [enginePlaysBlack, setEnginePlaysBlack] = useState(true)
  const [engineMoveLoading, setEngineMoveLoading] = useState(false)
  const [enginePlayError, setEnginePlayError] = useState<string | null>(null)
  const enginePlayRequestRef = useRef(0)

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
  }, [])

  useEffect(() => {
    if (planViewActive) {
      setEngineMoveLoading(false)
      return
    }
    if (!enginePlaysBlack) {
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
    if (g.turn() !== 'b') {
      setEngineMoveLoading(false)
      return
    }

    const reqId = ++enginePlayRequestRef.current
    let cancelled = false
    setEngineMoveLoading(true)
    setEnginePlayError(null)

    const fenBefore = g.fen()
    engineEval(fenBefore, depth)
      .then((r) => {
        if (cancelled || enginePlayRequestRef.current !== reqId) return
        if (!r.bestmove_uci) {
          setEnginePlayError('Engine returned no move')
          return
        }
        const trial = playThrough(moves, moves.length)
        if (trial.fen() !== fenBefore) return
        const sm = applyUci(trial, r.bestmove_uci)
        if (!sm) {
          setEnginePlayError('Engine move could not be played')
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
      })
      .catch((e: unknown) => {
        if (!cancelled && enginePlayRequestRef.current === reqId)
          setEnginePlayError(
            e instanceof ApiClientError
              ? e.message
              : e instanceof Error
                ? e.message
                : String(e),
          )
      })
      .finally(() => {
        if (!cancelled && enginePlayRequestRef.current === reqId)
          setEngineMoveLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [moves, cursor, enginePlaysBlack, depth, planViewActive])

  const squareStyles = useMemo(
    () => buildSquareStyles(analysis, { showAttacks, lastMove }),
    [analysis, showAttacks, lastMove],
  )

  const squareRenderer = useMemo<SquareRenderer>(
    () =>
      function SquareWithOverlays({ piece, square, children }) {
        const style: React.CSSProperties = {
          width: '100%',
          height: '100%',
          position: 'relative',
          zIndex: 1,
          ...squareStyles[square],
        }
        const showDot =
          showUndefended &&
          analysis &&
          piece &&
          (analysis.undefended.white.includes(square) ||
            analysis.undefended.black.includes(square))
        return (
          <div style={style}>
            {children}
            {showDot ? (
              <span className="undefended-piece-dot" aria-hidden />
            ) : null}
          </div>
        )
      },
    [squareStyles, analysis, showUndefended],
  )

  const onPieceDrop = useCallback((args: PieceDropHandlerArgs) => {
    const { sourceSquare, targetSquare } = args
    if (!targetSquare) return false
    const from = sourceSquare as Square
    const to = targetSquare as Square
    const s = lineRef.current
    const g = playThrough(s.moves, s.cursor)
    const sm = tryMove(g, from, to)
    if (!sm) return false
    setLine({
      moves: [...s.moves.slice(0, s.cursor), sm],
      cursor: s.cursor + 1,
    })
    setEnginePlayError(null)
    return true
  }, [])

  const canDragPiece = useCallback(
    ({ isSparePiece, piece }: PieceHandlerArgs) => {
      if (isSparePiece) return false
      if (planViewActive) return false
      if (engineMoveLoading) return false
      const g = playThrough(moves, cursor)
      if (g.isGameOver()) return false
      const color = piece.pieceType[0]
      if (color !== 'w' && color !== 'b') return false
      if (!enginePlaysBlack) {
        return (
          (g.turn() === 'w' && color === 'w') || (g.turn() === 'b' && color === 'b')
        )
      }
      return g.turn() === 'w' && color === 'w'
    },
    [planViewActive, engineMoveLoading, enginePlaysBlack, moves, cursor],
  )

  const exitPlanView = () => {
    setPlanViewActive(false)
    setPlanStep(0)
  }

  const runPlan = async () => {
    setPlanLoading(true)
    setPlanError(null)
    try {
      const userColor: 'white' | 'black' = enginePlaysBlack
        ? 'white'
        : game.turn() === 'w'
          ? 'white'
          : 'black'
      const plan = await fetchEnginePlan(
        gameFen,
        depth,
        userColor,
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

      // Vs Stockfish on Black: always take back a full "step" — your last White
      // move plus Black's reply — so you don't land on Black-to-move and see the
      // engine play the same reply again. If only one ply exists, it's White's
      // first move.
      if (enginePlaysBlack) {
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
  }, [enginePlaysBlack])

  const reset = () => {
    setLine({ moves: [], cursor: 0 })
    setEnginePlayError(null)
    setPlanData(null)
    setPlanViewActive(false)
    setPlanStep(0)
    setPlanError(null)
  }

  const runEval = async () => {
    setEvalLoading(true)
    setEvalError(null)
    try {
      const r = await engineEval(fen, depth)
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
      ? `Engine plan: step ${planStep} / ${planData.steps.length} (from this position)`
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
  const openingLine =
    analysis?.opening?.name && analysis.opening.plies_matched > 0
      ? `${analysis.opening.eco ? `${analysis.opening.eco} — ` : ''}${analysis.opening.name}`
      : analysis?.opening?.name ?? null

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
    enginePlaysBlack && engineMoveLoading
      ? 'Stockfish is thinking (Black)…'
      : enginePlayError
        ? `Engine: ${enginePlayError}`
        : null

  return (
    <div className="app">
      <header className="header">
        <h1>Knight Vision</h1>
        <p className="tagline">
          Offline practice board: attack rings, undefended markers, Stockfish.
        </p>
      </header>

      <div className="layout">
        <section className="board-wrap">
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
          <Chessboard
            options={{
              position: fen,
              boardOrientation,
              squareStyles,
              squareRenderer,
              onPieceDrop,
              canDragPiece,
              allowDragging: !engineMoveLoading && !planViewActive,
              allowAutoScroll: true,
              ...BOARD_NOTATION_OPTIONS,
            }}
          />
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
          {planViewActive && planData ? (
            <div className="plan-walkthrough">
              <p className="plan-walkthrough-title">
                Walking through Stockfish&apos;s predicted line
              </p>
              <div className="board-toolbar plan-toolbar">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Previous plan step"
                  disabled={planStep === 0}
                  onClick={planStepBack}
                >
                  ←
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Next plan step"
                  disabled={planStep >= planData.steps.length}
                  onClick={planStepForward}
                >
                  →
                </button>
                <button type="button" onClick={exitPlanView}>
                  Exit plan (back to game)
                </button>
              </div>
              {planStepExplanation ? (
                <div className="plan-step-explanation" aria-live="polite">
                  <h3 className="plan-step-explanation-title">
                    {planStep === 0 ? 'Before the line' : `Move ${planStep}`}
                  </h3>
                  <p>{planStepExplanation}</p>
                </div>
              ) : null}
              <ol className="plan-step-list">
                <li>
                  <button
                    type="button"
                    className={planStep === 0 ? 'plan-step-active' : ''}
                    onClick={() => setPlanStep(0)}
                  >
                    Start (current position)
                  </button>
                </li>
                {planData.steps.map((s, i) => (
                  <li key={s.ply}>
                    <button
                      type="button"
                      className={planStep === i + 1 ? 'plan-step-active' : ''}
                      onClick={() => setPlanStep(i + 1)}
                    >
                      {s.ply}. {s.perspective === 'user' ? 'I' : 'You'}: {s.san}
                      {s.is_check
                        ? ` — check (${s.legal_moves_count} replies)`
                        : ''}
                    </button>
                  </li>
                ))}
              </ol>
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
                enginePlaysBlack
                  ? 'Take back your last White move and Black’s reply (two plies), or your first move if that’s all there is'
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
          {openingLine && !planViewActive ? (
            <p className="status opening-line">
              <strong>Opening</strong> {openingLine}
            </p>
          ) : null}
          <p className="hint board-hint">
            Use ← → to replay. From an old position, play a new move to replace
            the rest of the game (branch).
          </p>
          {playStatus ? <p className="status play-status">{playStatus}</p> : null}
          {analyzeError ? (
            <p className="error">Analysis: {analyzeError}</p>
          ) : null}
        </section>

        <aside className="sidebar">
          <h2>Overlays</h2>
          <label className="check">
            <input
              type="checkbox"
              checked={showAttacks}
              onChange={(e) => setShowAttacks(e.target.checked)}
            />
            Square attack rings (thick edges: blue = White only, red = Black only,
            purple = both, green = neither side attacks this square)
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={showUndefended}
              onChange={(e) => setShowUndefended(e.target.checked)}
            />
            Undefended pieces (red dot on the piece)
          </label>
          <p className="hint">
            A friendly piece is undefended when no friendly piece attacks its
            square (python-chess <code>board.attackers(color, square)</code>).
          </p>

          <h2>Play vs engine</h2>
          <label className="check">
            <input
              type="checkbox"
              checked={enginePlaysBlack}
              onChange={(e) => {
                setEnginePlaysBlack(e.target.checked)
                setEnginePlayError(null)
              }}
            />
            Engine plays Black (you play White; Stockfish moves after each of
            yours)
          </label>
          <p className="hint">
            Uses the same Depth as below. Turn this off for two-player or solo
            analysis on both sides.
          </p>

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
            <label htmlFor="depth">Depth</label>
            <input
              id="depth"
              type="number"
              min={1}
              max={40}
              value={depth}
              onChange={(e) => setDepth(Number(e.target.value) || 12)}
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
