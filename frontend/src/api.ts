import { apiRequest } from './apiClient'

export type AttackKind = 'none' | 'white' | 'black' | 'both'

export type PieceRef = {
  square: string
  color: 'white' | 'black'
  type: string
}

export type PieceContacts = {
  square: string
  piece: { color: 'white' | 'black'; type: string }
  defenders: PieceRef[]
  attackers: PieceRef[]
}

export type OpeningInfo = {
  eco: string | null
  name: string | null
  san_moves: string[]
  plies_matched: number
  line_depth?: number
}

export type SideOpenings = {
  line: OpeningInfo
  white: OpeningInfo | null
  black: OpeningInfo | null
}

export type AnalyzeResponse = {
  fen: string
  turn: 'white' | 'black'
  attacks: Record<string, AttackKind>
  piece_contacts: Record<string, PieceContacts>
  /** Squares each occupied square's piece attacks (for threat circles). */
  piece_threats: Record<string, string[]>
  undefended: { white: string[]; black: string[] }
  legal_moves_uci: string[]
  is_check: boolean
  is_checkmate: boolean
  is_stalemate: boolean
  is_insufficient_material: boolean
  /** Full line (same as openings.line). */
  opening: OpeningInfo
  openings: SideOpenings
}

export type EngineEvalResponse = {
  bestmove_uci: string | null
  pv_uci: string[]
  cp_white: number | null
  mate_white: number | null
}

export type MoveQualityResponse = {
  played_uci: string
  best_uci: string
  cp_loss: number
  classification: string
  accuracy_depth: number
  mover: 'white' | 'black'
}

/** Engine plays / eval / plan — user-adjustable (default 12). */
export const ENGINE_DEPTH_DEFAULT = 12
/** Fast accuracy scoring — fixed, separate from engine depth. */
export const ACCURACY_DEPTH = 6

export type EngineStatusResponse = {
  ok: boolean
  path: string
  configured_path?: string
  error?: string
}

export function storedMoveToUci(m: {
  from: string
  to: string
  promotion?: string
}): string {
  return m.from + m.to + (m.promotion ?? '')
}

export async function analyzePosition(
  fen: string,
  movesUci: string[] = [],
): Promise<AnalyzeResponse> {
  return apiRequest<AnalyzeResponse>('/api/analyze', {
    method: 'POST',
    body: JSON.stringify({ fen, moves_uci: movesUci }),
  })
}

export async function engineEval(
  fen: string,
  depth: number,
  movetimeMs?: number | null,
): Promise<EngineEvalResponse> {
  return apiRequest<EngineEvalResponse>('/api/engine/eval', {
    method: 'POST',
    body: JSON.stringify({ fen, depth, movetime_ms: movetimeMs ?? null }),
  })
}

export async function scoreMoveQuality(
  fen: string,
  playedUci: string,
  depth: number = ACCURACY_DEPTH,
): Promise<MoveQualityResponse> {
  return apiRequest<MoveQualityResponse>('/api/engine/move-quality', {
    method: 'POST',
    body: JSON.stringify({ fen, played_uci: playedUci, depth }),
  })
}

export async function engineStatus(): Promise<EngineStatusResponse> {
  return apiRequest<EngineStatusResponse>('/api/engine/status')
}

export type PlanStep = {
  ply: number
  uci: string
  san: string
  from_square?: string
  to_square?: string
  piece_moved?: string
  fen: string
  mover: 'white' | 'black'
  perspective: 'user' | 'opponent'
  is_capture: boolean
  captured_type: string | null
  is_check: boolean
  legal_moves_count: number
  events: { type: string; piece?: string; squares?: string[]; count?: number }[]
  explanation?: string
  visual_interest?: number
  labels?: string[]
}

export type EnginePlanResponse = {
  start_fen: string
  bestmove_uci: string | null
  pv_uci: string[]
  cp_white: number | null
  mate_white: number | null
  steps: PlanStep[]
  narrative: string | null
  intro: string | null
  summary: string | null
  explain_error: string | null
  explain_code?: string | null
  highlight_plies?: number[]
}

export async function enginePlan(
  fen: string,
  depth: number,
  userColor: 'white' | 'black' = 'white',
  explain = true,
): Promise<EnginePlanResponse> {
  return apiRequest<EnginePlanResponse>('/api/engine/plan', {
    method: 'POST',
    body: JSON.stringify({
      fen,
      depth,
      user_color: userColor,
      explain,
    }),
  })
}

export async function openaiStatus(): Promise<{ configured: boolean }> {
  return apiRequest<{ configured: boolean }>('/api/openai/status')
}

export type StudyGameCatalogEntry = {
  id: string
  name: string
  white: string
  black: string
  event: string
  year: number
  tags: string[]
}

export type StudyLessonResponse = EnginePlanResponse & {
  game_id: string
  title: string
  white: string
  black: string
  event: string
  year: number
  tags: string[]
  moves_uci: string[]
  annotation_plies: number[]
  highlight_plies?: number[]
}

export async function fetchStudyCatalog(): Promise<{
  games: StudyGameCatalogEntry[]
}> {
  return apiRequest<{ games: StudyGameCatalogEntry[] }>('/api/study/catalog')
}

export async function fetchStudyLesson(
  gameId: string,
): Promise<StudyLessonResponse> {
  return apiRequest<StudyLessonResponse>(`/api/study/lessons/${gameId}`)
}

export async function healthCheck(): Promise<{ status: string }> {
  return apiRequest<{ status: string }>('/health')
}
