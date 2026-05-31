/**
 * API base URL for backend calls.
 *
 * - Empty (default in dev): relative `/api/...` — Vite dev server proxies to FastAPI.
 * - LAN / Capacitor / production build: set `VITE_API_BASE` (no trailing slash).
 *
 * Examples:
 *   http://192.168.1.42:8000
 *   https://api.knight-vision.example
 */
export function getApiBase(): string {
  const raw =
    (import.meta.env.VITE_API_BASE as string | undefined) ||
    (import.meta.env.VITE_API_BASE_URL as string | undefined)
  if (!raw) return ''
  return raw.replace(/\/$/, '')
}

export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  const base = getApiBase()
  return base ? `${base}${p}` : p
}
