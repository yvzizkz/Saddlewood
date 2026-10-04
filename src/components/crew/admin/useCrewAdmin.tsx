'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { botApi, useBot } from '@/components/bot/BotProvider'
import type { AdminActInput, CrewAdminHome } from '@/lib/crew/types'

// The owners' live picture of the crew, shared by the four views of the Crew
// tab. Re-read every 30 seconds while the app is on screen.

type RunResult = { ok: boolean; text: string; code?: string; link?: string; hours?: number }

type Ctx = {
  data: CrewAdminHome | null
  error: string | null
  /** Monday of the week the Hours view shows; null is the current week. */
  week: string | null
  setWeek: (week: string | null) => void
  refresh: () => Promise<void>
  /** Carry out an owner's action, say how it went, and re-read. */
  run: (input: AdminActInput, quiet?: boolean) => Promise<RunResult>
  nameOf: (email: string) => string
}

const AdminContext = createContext<Ctx | null>(null)

const POLL_MS = 30_000

export function CrewAdminProvider({ children }: { children: ReactNode }) {
  const { toast } = useBot()
  const [data, setData] = useState<CrewAdminHome | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [week, setWeekState] = useState<string | null>(null)
  const weekRef = useRef<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const q = weekRef.current ? `?week=${weekRef.current}` : ''
      const next = await botApi<CrewAdminHome>(`/api/crew/admin${q}`)
      setData(next)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  const setWeek = useCallback(
    (next: string | null) => {
      weekRef.current = next
      setWeekState(next)
      void refresh()
    },
    [refresh],
  )

  useEffect(() => {
    let timer: number | undefined
    let stopped = false
    async function tick() {
      if (stopped) return
      if (document.visibilityState === 'visible') await refresh()
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
    return () => {
      stopped = true
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [refresh])

  const run = useCallback<Ctx['run']>(
    async (input, quiet = false) => {
      try {
        const res = await botApi<{ ok: true; note?: string; code?: string; link?: string; hours?: number }>('/api/crew/admin', {
          method: 'POST',
          body: JSON.stringify(input),
        })
        if (res.note && !quiet) toast(res.note, 'ok')
        await refresh()
        return { ok: true, text: res.note ?? '', code: res.code, link: res.link, hours: res.hours }
      } catch (e) {
        const text = (e as Error).message
        if (!quiet) toast(text, 'bad')
        return { ok: false, text }
      }
    },
    [refresh, toast],
  )

  const names = useMemo(() => new Map((data?.people ?? []).map((p) => [p.email, p.name])), [data])
  const nameOf = useCallback((email: string) => names.get(email) ?? email.split('@')[0], [names])

  const value = useMemo<Ctx>(() => ({ data, error, week, setWeek, refresh, run, nameOf }), [data, error, week, setWeek, refresh, run, nameOf])
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
}

export function useCrewAdmin(): Ctx {
  const ctx = useContext(AdminContext)
  if (!ctx) throw new Error('useCrewAdmin must be used inside <CrewAdminProvider>')
  return ctx
}
