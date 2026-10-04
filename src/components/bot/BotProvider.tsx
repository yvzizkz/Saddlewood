'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { laneForAction, type BotAction, type BotActionInput, type BotHome } from '@/lib/bot/types'

// One live picture of the bot for every screen. Home is re-read every 12
// seconds while the app is on screen, every 2.5 while a tap is waiting on the
// Mac, and not at all while the phone is locked or the app is in the
// background.

type Toast = { id: number; text: string; tone: 'ok' | 'bad' | 'info' }

type ActResult = { ok: boolean; text: string; action: BotAction | null }

type Ctx = {
  home: BotHome | null
  error: string | null
  refresh: () => Promise<BotHome | null>
  /** Queue a tap, wait for the Mac's answer, toast it. `key` marks what is busy. */
  act: (input: BotActionInput, key?: string) => Promise<ActResult>
  busy: Record<string, boolean>
  toast: (text: string, tone?: Toast['tone']) => void
}

const BotContext = createContext<Ctx | null>(null)

const IDLE_MS = 12_000
const WAITING_MS = 2_500
const ANSWER_TIMEOUT_MS = 90_000

export async function botApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (res.status === 401) {
    // The session ended. Send them through sign-in and back to where they were.
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`
    throw new Error('Signed out')
  }
  let json: { ok?: boolean; error?: string } = {}
  try {
    json = await res.json()
  } catch {
    // an HTML error page
  }
  if (!res.ok || !json.ok) throw new Error(json.error || `Could not reach Saddlewood (${res.status})`)
  return json as T
}

export function BotProvider({ children }: { children: ReactNode }) {
  const [home, setHome] = useState<BotHome | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [toasts, setToasts] = useState<Toast[]>([])
  const waiting = useRef(0)
  const toastId = useRef(0)

  const refresh = useCallback(async () => {
    try {
      const next = await botApi<BotHome>('/api/bot/home')
      setHome(next)
      setError(null)
      return next
    } catch (e) {
      setError((e as Error).message)
      return null
    }
  }, [])

  useEffect(() => {
    let timer: number | undefined
    let stopped = false
    async function tick() {
      if (stopped) return
      if (document.visibilityState === 'visible') await refresh()
      if (stopped) return
      timer = window.setTimeout(tick, waiting.current > 0 ? WAITING_MS : IDLE_MS)
    }
    function onVisible() {
      if (document.visibilityState !== 'visible') return
      window.clearTimeout(timer)
      void tick()
    }
    void tick()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = ++toastId.current
    setToasts((ts) => [...ts.slice(-2), { id, text, tone }])
    window.setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), tone === 'bad' ? 9000 : 6000)
  }, [])

  const act = useCallback(
    async (input: BotActionInput, key?: string): Promise<ActResult> => {
      if (key) setBusy((b) => ({ ...b, [key]: true }))
      waiting.current += 1
      try {
        const { action } = await botApi<{ action: BotAction }>('/api/bot/actions', {
          method: 'POST',
          body: JSON.stringify(input),
        })
        if (laneForAction(input) === 'agent') {
          // Minutes, not seconds. Home shows the result when it lands.
          const text = 'The bot is on it. This one takes a few minutes; the result will show up on Home.'
          toast(text, 'info')
          void refresh()
          return { ok: true, text, action }
        }
        const deadline = Date.now() + ANSWER_TIMEOUT_MS
        while (Date.now() < deadline) {
          await new Promise((r) => window.setTimeout(r, WAITING_MS))
          const next = await refresh()
          const done = next?.actions.find((a) => a.id === action.id)
          if (done && done.status !== 'queued' && done.status !== 'working') {
            const ok = done.status === 'done'
            const text = done.result || (ok ? 'Done.' : 'That did not go through.')
            toast(text, ok ? 'ok' : 'bad')
            return { ok, text, action: done }
          }
        }
        // The Mac still carries out a tap it collects within five minutes.
        const text = 'The bot has not answered yet. It may still do this if it is back within a few minutes, so check Home before trying again.'
        toast(text, 'bad')
        return { ok: false, text, action }
      } catch (e) {
        const text = (e as Error).message
        toast(text, 'bad')
        return { ok: false, text, action: null }
      } finally {
        waiting.current -= 1
        if (key) setBusy((b) => ({ ...b, [key]: false }))
      }
    },
    [refresh, toast],
  )

  const value = useMemo<Ctx>(() => ({ home, error, refresh, act, busy, toast }), [home, error, refresh, act, busy, toast])

  return (
    <BotContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="ph-no-capture pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4"
        style={{ bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))' }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="bot-toast pointer-events-auto max-w-md w-full rounded-xl px-4 py-3 text-sm shadow-lg whitespace-pre-wrap"
            style={{
              backgroundColor: t.tone === 'bad' ? '#7f1d1d' : 'var(--color-teal)',
              color: 'white',
            }}
          >
            {t.text}
          </div>
        ))}
      </div>
    </BotContext.Provider>
  )
}

export function useBot(): Ctx {
  const ctx = useContext(BotContext)
  if (!ctx) throw new Error('useBot must be used inside <BotProvider>')
  return ctx
}
