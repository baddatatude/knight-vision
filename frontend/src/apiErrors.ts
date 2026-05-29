type ErrorPayload = {
  detail?: string | unknown
  code?: string
}

const FRIENDLY: Record<string, string> = {
  engine_not_found:
    'Stockfish is not available on the server. Install Stockfish or set STOCKFISH_PATH.',
  engine_terminated: 'The chess engine stopped. Try again.',
  engine_error: 'Engine analysis failed. Try again in a moment.',
  openai_not_configured:
    'AI explanations are not set up on the server. Walk-through still works.',
  openai_auth: 'Server OpenAI key is invalid. Contact the app operator.',
  openai_rate_limit: 'OpenAI is busy. Wait a minute and try again.',
  openai_unavailable: 'Could not reach OpenAI. Check your connection.',
  openai_error: 'Explanation failed. You can still use the engine line.',
  rate_limited: 'Too many requests. Please wait a minute.',
  network_error:
    'Cannot reach the Knight Vision server. Check Wi-Fi and that the API is running.',
}

export function friendlyApiMessage(
  status: number,
  payload: ErrorPayload | null,
  fallbackText: string,
): string {
  const code =
    typeof payload?.code === 'string' ? payload.code : undefined
  if (code && FRIENDLY[code]) return FRIENDLY[code]

  const detail = payload?.detail
  if (typeof detail === 'string' && detail.trim()) {
    if (status === 400) return `Invalid position: ${detail}`
    if (status === 503) return detail
    if (status === 502) return detail
    if (status === 429) return detail
    return detail
  }

  if (status === 0 || status >= 500) {
    return FRIENDLY.network_error
  }
  if (status === 429) return FRIENDLY.rate_limited
  if (status === 503) return FRIENDLY.engine_error
  if (fallbackText.trim()) return fallbackText.trim()
  return `Request failed (${status})`
}
