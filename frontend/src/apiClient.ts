import { apiUrl } from './config'
import { friendlyApiMessage } from './apiErrors'

export class ApiClientError extends Error {
  readonly status: number
  readonly code: string | undefined

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
    this.code = code
  }
}

async function parsePayload(res: Response): Promise<{
  payload: { detail?: unknown; code?: string } | null
  fallbackText: string
}> {
  const fallbackText = await res.text()
  try {
    const payload = JSON.parse(fallbackText) as {
      detail?: unknown
      code?: string
    }
    return { payload, fallbackText }
  } catch {
    return { payload: null, fallbackText }
  }
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  let res: Response
  try {
    res = await fetch(apiUrl(path), {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    })
  } catch {
    throw new ApiClientError(friendlyApiMessage(0, null, ''), 0, 'network_error')
  }

  if (!res.ok) {
    const { payload, fallbackText } = await parsePayload(res)
    const msg = friendlyApiMessage(res.status, payload, fallbackText)
    throw new ApiClientError(
      msg,
      res.status,
      typeof payload?.code === 'string' ? payload.code : undefined,
    )
  }

  return res.json() as Promise<T>
}
