import { apiRequest } from './apiClient'

export type AttackKind = 'none' | 'white' | 'black' | 'both'

export type OpeningInfo = {
  eco: string | null
  name: string | null
  san_moves: string[]
  plies_matched: number
  line_depth?: number
}

export type AnalyzeResponse = {
  fen: string
  turn: 'white' | 'black'
  attacks: Record<string, AttackKind>
  undefended: { white: string[]; black: string[] }
  legal_moves_uci: string[]
  is_check: boolean
  is_checkmate: boolean
  is_stalemate: boolean
  is_insufficient_material: boolean
  opening: OpeningInfo
}

export type EngineEvalResponse = {
  bestmove_uci: string | null
  pv_uci: string[]
  cp_white: number | null
  mate_white: number | null
}

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

export async function healthCheck(): Promise<{ status: string }> {
  return apiRequest<{ status: string }>('/health')
}
