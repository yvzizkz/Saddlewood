'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { createClient } from '@/lib/supabase/client'
import type { BotFileRef } from '@/lib/bot/types'
import type { CrewActInput, CrewHome, CrewLang, Geo } from '@/lib/crew/types'
import { STRINGS, type CrewStrings } from './strings'

// One live picture of a crew member's day for every screen, and the one place
// that talks to the server. Re-read every 30 seconds while the app is on
// screen, and whenever it comes back to the front.
//
// A clock-in or clock-out that cannot be sent (no signal on the jobsite) is
// kept on the phone with the time of the tap and sent as soon as the phone is
// back online. The server records it with that time and marks it as sent
// late, so the office can see the difference.

type Toast = { id: number; text: string; tone: 'ok' | 'bad' | 'info' }

type PunchInput = Extract<CrewActInput, { kind: 'punch.in' | 'punch.out' | 'punch.switch' }>
type OtherInput = Exclude<CrewActInput, PunchInput>
type Unsent<T> = T extends unknown ? Omit<T, 'clientId' | 'at'> : never

export type QueuedPunch = { act: PunchInput; label: string }

type Result = { ok: boolean; text: string }

type Ctx = {
  home: CrewHome | null
  error: string | null
  lang: CrewLang
  t: CrewStrings
  setLang: (lang: CrewLang) => void
  refresh: () => Promise<CrewHome | null>
  /** Anything but a punch. Fails loudly: the form stays open so nothing typed is lost. */
  act: (input: Unsent<OtherInput> & { clientId?: string }) => Promise<Result>
  /** A punch. Kept on the phone and sent later when there is no signal. */
  punch: (input: Unsent<PunchInput>, label: string) => Promise<Result & { queued: boolean }>
  queue: QueuedPunch[]
  flush: () => Promise<void>
  toast: (text: string, tone?: Toast['tone']) => void
}

const CrewContext = createContext<Ctx | null>(null)

const POLL_MS = 30_000
// One queue per person on a phone: a punch one person tapped must never be
// sent under whoever signs in on that phone next.
const queueKey = (email: string) => `sw_crew_punches:${email}`
const LEGACY_QUEUE_KEY = 'sw_crew_punches'

class OfflineError extends Error {}
class RefusedError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

export function newClientId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return Array.from({ length: 4 }, () => Math.random().toString(16).slice(2, 10)).join('-')
}

export async function crewApi<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      ...init,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
  } catch {
    throw new OfflineError('offline')
  }
  if (res.status === 401) {
    window.location.href = '/login?next=/app'
    throw new RefusedError('Signed out', 401)
  }
  let json: { ok?: boolean; error?: string } = {}
  try {
    json = await res.json()
  } catch {
    // an HTML error page
  }
  if (res.status >= 500) throw new OfflineError(json.error || `server ${res.status}`)
  if (!res.ok || !json.ok) throw new RefusedError(json.error || `Could not reach Saddlewood (${res.status})`, res.status)
  return json as T
}

function loadQueue(email: string): QueuedPunch[] {
  try {
    localStorage.removeItem(LEGACY_QUEUE_KEY)
    const raw = JSON.parse(localStorage.getItem(queueKey(email)) ?? '[]')
    return Array.isArray(raw) ? (raw as QueuedPunch[]).filter((q) => q && q.act && typeof q.act.kind === 'string') : []
  } catch {
    return []
  }
}

function saveQueue(email: string, queue: QueuedPunch[]): void {
  try {
    if (queue.length) localStorage.setItem(queueKey(email), JSON.stringify(queue))
    else localStorage.removeItem(queueKey(email))
  } catch {
    // private mode: the queue lives only as long as the app stays open
  }
}

/** Not an answer about the punch itself: no signal, the server is struggling, or the session ran out. Keep the punch. */
function shouldKeep(e: unknown): boolean {
  return e instanceof OfflineError || (e instanceof RefusedError && e.status === 401)
}

/** Where the phone is, once. Null when the person said no or it took too long. */
export function locate(timeoutMs = 4000): Promise<Geo | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null)
    const timer = window.setTimeout(() => resolve(null), timeoutMs + 500)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(timer)
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: Math.round(pos.coords.accuracy) })
      },
      () => {
        window.clearTimeout(timer)
        resolve(null)
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    )
  })
}

/** A phone photo is 3 to 12 MB. Shrink it before it goes over a jobsite connection. */
async function shrink(file: File): Promise<{ blob: Blob; type: string; name: string }> {
  const original = { blob: file as Blob, type: file.type || 'image/jpeg', name: file.name || 'photo.jpg' }
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return original
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return original
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85))
    if (!blob || blob.size >= file.size) return original
    return { blob, type: 'image/jpeg', name: `${(file.name || 'photo').replace(/\.[A-Za-z0-9]+$/, '')}.jpg` }
  } catch {
    return original // a format this browser cannot draw: send it as it is
  }
}

const UPLOADABLE = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'application/pdf']

export async function uploadPhoto(file: File): Promise<BotFileRef> {
  const { blob, type, name } = await shrink(file)
  if (!UPLOADABLE.includes(type)) throw new Error('unsupported')
  const slot = await crewApi<{ bucket: string; path: string; token: string; file: BotFileRef }>('/api/crew/uploads', {
    method: 'POST',
    body: JSON.stringify({ name, type, size: blob.size }),
  })
  const supabase = createClient()
  const { error } = await supabase.storage.from(slot.bucket).uploadToSignedUrl(slot.path, slot.token, blob, { contentType: type })
  if (error) throw new Error(error.message)
  return slot.file
}

export function CrewProvider({ children, initialLang, email }: { children: ReactNode; initialLang: CrewLang; email: string }) {
  const [home, setHome] = useState<CrewHome | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lang, setLangState] = useState<CrewLang>(initialLang)
  const [queue, setQueue] = useState<QueuedPunch[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)
  const flushing = useRef(false)
  const langTouched = useRef(false)
  const t = STRINGS[lang]

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = ++toastId.current
    setToasts((ts) => [...ts.slice(-2), { id, text, tone }])
    window.setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), tone === 'bad' ? 9000 : 5000)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const next = await crewApi<CrewHome>('/api/crew/me')
      setHome(next)
      setError(null)
      if (!langTouched.current) setLangState(next.me.lang)
      return next
    } catch (e) {
      setError((e as Error).message)
      return null
    }
  }, [])

  const flush = useCallback(async () => {
    if (flushing.current) return
    flushing.current = true
    try {
      let pending = loadQueue(email)
      let sent = false
      while (pending.length) {
        try {
          await crewApi('/api/crew/act', { method: 'POST', body: JSON.stringify(pending[0].act) })
          sent = true
        } catch (e) {
          if (shouldKeep(e)) break // still no signal, or signed out: it goes when they are back
          toast((e as Error).message, 'bad') // refused: it will never go through, so let it go and say why
        }
        pending = pending.slice(1)
        saveQueue(email, pending)
        setQueue(pending)
      }
      if (sent) await refresh()
    } finally {
      flushing.current = false
    }
  }, [email, refresh, toast])

  useEffect(() => {
    setQueue(loadQueue(email))
    let timer: number | undefined
    let stopped = false
    async function tick() {
      if (stopped) return
      if (document.visibilityState === 'visible') {
        await flush()
        await refresh()
      }
      if (stopped) return
      timer = window.setTimeout(tick, POLL_MS)
    }
    function wake() {
      if (document.visibilityState !== 'visible') return
      window.clearTimeout(timer)
      void tick()
    }
    void tick()
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('online', wake)
    return () => {
      stopped = true
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('online', wake)
    }
  }, [email, flush, refresh])

  const act = useCallback<Ctx['act']>(
    async (input) => {
      const needsId = input.kind.endsWith('.add')
      const body = needsId ? { ...input, clientId: input.clientId ?? newClientId() } : input
      try {
        const res = await crewApi<{ ok: true; note?: string }>('/api/crew/act', { method: 'POST', body: JSON.stringify(body) })
        void refresh()
        return { ok: true, text: res.note ?? '' }
      } catch (e) {
        const text = e instanceof OfflineError ? STRINGS[lang].noConnection : (e as Error).message
        return { ok: false, text }
      }
    },
    [lang, refresh],
  )

  const punch = useCallback<Ctx['punch']>(
    async (input, label) => {
      const full = { ...input, at: new Date().toISOString(), clientId: newClientId() } as PunchInput
      const waiting = loadQueue(email)
      if (!waiting.length) {
        try {
          await crewApi('/api/crew/act', { method: 'POST', body: JSON.stringify(full) })
          await refresh()
          return { ok: true, queued: false, text: '' }
        } catch (e) {
          if (!shouldKeep(e)) {
            void refresh()
            return { ok: false, queued: false, text: (e as Error).message }
          }
        }
      }
      // No signal (or an earlier punch is still waiting, and order matters).
      const next = [...waiting, { act: full, label }]
      saveQueue(email, next)
      setQueue(next)
      return { ok: true, queued: true, text: STRINGS[lang].punchWaiting }
    },
    [email, lang, refresh],
  )

  const setLang = useCallback(
    (next: CrewLang) => {
      langTouched.current = true
      setLangState(next)
      void crewApi('/api/crew/act', { method: 'POST', body: JSON.stringify({ kind: 'prefs', lang: next }) }).catch(() => {})
    },
    [],
  )

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const value = useMemo<Ctx>(
    () => ({ home, error, lang, t, setLang, refresh, act, punch, queue, flush, toast }),
    [home, error, lang, t, setLang, refresh, act, punch, queue, flush, toast],
  )

  return (
    <CrewContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="ph-no-capture pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4"
        style={{ bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))' }}
      >
        {toasts.map((x) => (
          <div
            key={x.id}
            role="status"
            className="bot-toast pointer-events-auto w-full max-w-md whitespace-pre-wrap rounded-xl px-4 py-3 text-sm shadow-lg"
            style={{ backgroundColor: x.tone === 'bad' ? '#7f1d1d' : 'var(--color-teal)', color: 'white' }}
          >
            {x.text}
          </div>
        ))}
      </div>
    </CrewContext.Provider>
  )
}

export function useCrew(): Ctx {
  const ctx = useContext(CrewContext)
  if (!ctx) throw new Error('useCrew must be used inside <CrewProvider>')
  return ctx
}
