import { money2 } from '@/lib/trackers/core'
import type { LineStatus } from '@/lib/trackers/core'

export const fmt = (x: number) => money2(x)

export const STATUS_LABEL: Record<LineStatus, string> = {
  complete: '100% complete',
  partial: 'In progress',
  normal: 'Not started',
  tbd: 'TBD pricing',
}

export const STATUS_STYLE: Record<LineStatus, { bg: string; fg: string }> = {
  complete: { bg: 'rgba(47,107,74,0.14)', fg: '#2f6b4a' },
  partial: { bg: 'rgba(212,175,55,0.22)', fg: '#8f6c18' },
  normal: { bg: 'rgba(24,40,40,0.08)', fg: '#5a5a5a' },
  tbd: { bg: 'rgba(24,40,40,0.08)', fg: '#6b665c' },
}

export const DUE_RED = '#a23b2a'

export class ApiError extends Error {
  status: number
  code?: string
  data: Record<string, unknown>
  constructor(status: number, data: Record<string, unknown>) {
    super(typeof data.error === 'string' ? data.error : `HTTP ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.code = typeof data.code === 'string' ? data.code : undefined
    this.data = data
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  let json: Record<string, unknown> = {}
  try {
    json = (await res.json()) as Record<string, unknown>
  } catch {
    json = {}
  }
  if (!res.ok || json.ok === false) throw new ApiError(res.status, json)
  return json as T
}

export function whenIso(iso: string, withTime = false): string {
  try {
    const d = new Date(iso)
    return withTime
      ? d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso
  }
}
