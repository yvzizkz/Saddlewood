'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import { Loader2, Mic, Search, X } from 'lucide-react'

import { botApi, useBotOptional } from '@/components/bot/BotProvider'
import { Button, Chip, Empty, INPUT } from '@/components/bot/ui'
import { day, money } from '@/components/money/format'
import type { SearchResult, SearchTrip } from '@/lib/crew/purchaseSearch'
import { tradeShort } from '@/lib/accounting/tradeList'
import { TRADES } from '@/lib/crew/purchases'

// Find a purchase (0026): the words, a trade chip row, trips as cards with
// the matched lines pointed at. Phone first. On the owners' Money tab it
// searches every job; inside a job's Material block it is scoped to that job
// (the route checks the scope again; a project manager only ever gets his
// jobs). The mic fills the field with what was said when the browser can
// listen (iOS Safari can). "Ask the bot" sends the words to the owner's own
// Ask thread, the same POST the Ask screen makes, so the bot answers there.

/** How many plain lines show before "N more lines" when nothing on the trip was matched (no words, only filters). */
const PLAIN_LINES = 3

// The browser's speech recognizer, where there is one (Safari and Chrome; Firefox has none).
type Recognition = {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start(): void
  abort(): void
}
type RecognitionCtor = new () => Recognition

function recognizer(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

// Whether this browser can listen: false on the server and while hydrating, then the browser's answer.
const noop = () => () => {}
const canListenNow = () => !!recognizer()
const canListenOnServer = () => false

type Load = { state: 'idle' } | { state: 'loading' } | { state: 'error'; error: string } | { state: 'ok'; result: SearchResult }

export default function PurchaseSearch({
  jobId = '',
  jobName = '',
  open: openAtStart = true,
}: {
  /** Scope to one field job (the Material block). */
  jobId?: string
  jobName?: string
  /** Start folded behind a "Find a purchase" link (inside a card). */
  open?: boolean
}) {
  const bot = useBotOptional()
  const [open, setOpen] = useState(openAtStart)
  const [q, setQ] = useState('')
  const [trade, setTrade] = useState('')
  const [load, setLoad] = useState<Load>({ state: 'idle' })
  const canListen = useSyncExternalStore(noop, canListenNow, canListenOnServer)
  const [listening, setListening] = useState(false)
  const [asked, setAsked] = useState<'idle' | 'sending' | 'sent'>('idle')
  const seq = useRef(0)
  const timer = useRef<number | null>(null)
  const rec = useRef<Recognition | null>(null)
  const field = useRef<HTMLInputElement>(null)

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current)
      rec.current?.abort()
    },
    [],
  )

  const run = useCallback(
    async (words: string, forTrade: string) => {
      const clean = words.trim()
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = null
      if (!clean) {
        setLoad({ state: 'idle' })
        return
      }
      const n = ++seq.current
      setLoad({ state: 'loading' })
      setAsked('idle')
      const params = new URLSearchParams({ q: clean })
      if (jobId) params.set('job', jobId)
      if (forTrade) params.set('trade', forTrade)
      try {
        const res = await botApi<{ ok: true } & SearchResult>(`/api/crew/purchases/search?${params}`)
        if (n === seq.current) setLoad({ state: 'ok', result: res })
      } catch (e) {
        if (n === seq.current) setLoad({ state: 'error', error: (e as Error).message })
      }
    },
    [jobId],
  )

  // A pause in typing searches; Enter and a chip search at once.
  function onType(next: string) {
    setQ(next)
    if (timer.current) window.clearTimeout(timer.current)
    if (next.trim().length < 2) {
      if (!next.trim()) setLoad({ state: 'idle' })
      return
    }
    timer.current = window.setTimeout(() => void run(next, trade), 450)
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    field.current?.blur()
    void run(q, trade)
  }

  function pickTrade(t: string) {
    const next = t === trade ? '' : t
    setTrade(next)
    if (q.trim()) void run(q, next)
  }

  function listen() {
    const R = recognizer()
    if (!R || listening) return
    const r = new R()
    r.lang = 'en-US'
    r.interimResults = false
    r.maxAlternatives = 1
    r.onresult = (e) => {
      const said = e.results[0]?.[0]?.transcript?.trim() ?? ''
      if (!said) return
      setQ(said)
      void run(said, trade)
    }
    r.onend = () => {
      setListening(false)
      rec.current = null
    }
    r.onerror = () => {
      setListening(false)
      rec.current = null
    }
    rec.current = r
    setListening(true)
    try {
      r.start()
    } catch {
      setListening(false)
      rec.current = null
    }
  }

  // The owner's own thread with the bot: the same message the Ask screen sends.
  const seat = !!bot?.home?.me.role
  async function ask() {
    const words = q.trim()
    if (!words || !bot || asked === 'sending') return
    setAsked('sending')
    try {
      await botApi('/api/bot/messages', {
        method: 'POST',
        body: JSON.stringify({ body: `Find a purchase: ${words}${jobName ? ` (${jobName})` : ''}`, attachments: [] }),
      })
      setAsked('sent')
      bot.toast('Sent to the bot. The answer lands in Ask.', 'ok')
    } catch (e) {
      setAsked('idle')
      bot.toast((e as Error).message, 'bad')
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-[var(--color-teal)]">
        <Search className="size-4" aria-hidden="true" />
        Find a purchase{jobName ? ` on ${jobName}` : ''}
      </button>
    )
  }

  const result = load.state === 'ok' ? load.result : null
  const shown = result?.trips.length ?? 0
  const scopeLine = result
    ? [
        result.filters.from && result.filters.to
          ? result.filters.from === result.filters.to
            ? day(result.filters.from)
            : `${day(result.filters.from)} – ${day(result.filters.to)}`
          : result.filters.from
            ? `from ${day(result.filters.from)}`
            : result.filters.to
              ? `to ${day(result.filters.to)}`
              : '',
        !jobId && result.filters.jobName ? result.filters.jobName : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : ''

  return (
    <div className={openAtStart ? '' : 'mt-3'}>
      <form onSubmit={onSubmit} role="search" aria-label={jobName ? `Find a purchase on ${jobName}` : 'Find a purchase'}>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              ref={field}
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              value={q}
              onChange={(e) => onType(e.target.value)}
              placeholder={jobId ? 'Find a purchase: screws, august, 8/12…' : 'Find a purchase: drywall point loma, august…'}
              aria-label="Words to find"
              className={`${INPUT} pr-10`}
            />
            {q ? (
              <button
                type="button"
                aria-label="Clear"
                onClick={() => {
                  setQ('')
                  setLoad({ state: 'idle' })
                  field.current?.focus()
                }}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[var(--color-charcoal-light)]"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
          {canListen ? (
            <button
              type="button"
              onClick={listen}
              aria-label={listening ? 'Listening' : 'Say what to find'}
              aria-pressed={listening}
              className={`flex size-11 shrink-0 items-center justify-center rounded-full border ${
                listening ? 'border-[#9a2a1f] bg-[rgba(154,42,31,0.10)] text-[#9a2a1f]' : 'border-[var(--color-stone-mid)] bg-white text-[var(--color-charcoal)]'
              }`}
            >
              <Mic className="size-5" aria-hidden="true" />
            </button>
          ) : null}
          <button type="submit" aria-label="Search" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-teal)] text-white">
            {load.state === 'loading' ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <Search className="size-5" aria-hidden="true" />}
          </button>
        </div>
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]" role="group" aria-label="Trade">
          {TRADES.map((t) => {
            const active = t === trade
            return (
              <button
                key={t}
                type="button"
                aria-pressed={active}
                onClick={() => pickTrade(t)}
                className={`min-h-9 shrink-0 rounded-full border px-3 text-[13px] font-medium ${
                  active ? 'border-[var(--color-teal)] bg-[var(--color-teal)] text-white' : 'border-[var(--color-stone-mid)] bg-white text-[var(--color-charcoal)]'
                }`}
              >
                {tradeShort(t)}
              </button>
            )
          })}
        </div>
      </form>

      {load.state === 'error' ? (
        <p className="mt-2 text-[13px] text-[#9a2a1f]">{load.error}</p>
      ) : result ? (
        <div className="mt-2">
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--color-charcoal-light)]">
            <span>
              {result.total === 0 ? 'No trips' : shown < result.total ? `${shown} of ${result.total.toLocaleString('en-US')} trips` : `${shown} trip${shown === 1 ? '' : 's'}`}
              {scopeLine ? ` · ${scopeLine}` : ''}
            </span>
            {result.took === 'fuzzy' && result.total > 0 ? <Chip tone="warn">close matches</Chip> : null}
            {seat && result.total > 0 ? (
              <Button onClick={() => void ask()} busy={asked === 'sending'} disabled={asked === 'sent'} className="ml-auto">
                {asked === 'sent' ? 'Sent to the bot' : 'Ask the bot'}
              </Button>
            ) : null}
          </div>
          {result.total === 0 ? (
            <div className="mt-2">
              <Empty>No matches; try fewer words.</Empty>
              {seat ? (
                <div className="mt-2 flex items-center gap-2">
                  <Button onClick={() => void ask()} busy={asked === 'sending'} disabled={asked === 'sent'}>
                    {asked === 'sent' ? 'Sent to the bot' : 'Ask the bot'}
                  </Button>
                  {asked === 'sent' ? (
                    <a href="/app/ask" className="text-sm font-medium text-[var(--color-teal)]">
                      Open Ask
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <ul className="mt-2 space-y-2">
              {result.trips.map((t) => (
                <TripCard key={t.tripKey} trip={t} showJob={!jobId} />
              ))}
            </ul>
          )}
          {asked === 'sent' && result.total > 0 ? (
            <p className="mt-2 text-[12px] text-[var(--color-charcoal-light)]">
              The bot is on it.{' '}
              <a href="/app/ask" className="font-medium text-[var(--color-teal)]">
                Open Ask
              </a>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function TripCard({ trip, showJob }: { trip: SearchTrip; showJob: boolean }) {
  const [more, setMore] = useState(false)
  const matched = trip.lines.filter((l) => l.matched)
  const plain = trip.lines.filter((l) => !l.matched)
  // Matched lines always show; with none (only filters) the first few do. The rest fold.
  const lead = matched.length ? matched : plain.slice(0, PLAIN_LINES)
  const folded = matched.length ? plain : plain.slice(PLAIN_LINES)
  // Lines past SEARCH_MAX_LINES never arrive: still count them.
  const hidden = folded.length + Math.max(0, trip.lineCount - trip.lines.length)
  const store = trip.store ? `${trip.vendor} #${trip.store}` : trip.vendor
  return (
    <li className="rounded-2xl border border-[var(--color-stone)] bg-white px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-[13px] text-[var(--color-charcoal-light)]">
          {/* With no job set this is the owners' search (Accounting › Purchases): the trip and its job open their pages. */}
          {showJob ? (
            <Link href={`/app/accounting/purchases/trip/${encodeURIComponent(trip.tripKey)}`} className="font-medium text-[var(--color-charcoal)] underline-offset-2 hover:underline">
              {day(trip.purchasedOn)}
            </Link>
          ) : (
            <span className="font-medium text-[var(--color-charcoal)]">{day(trip.purchasedOn)}</span>
          )}{' '}
          · {store}
          {showJob && trip.jobName ? (
            <>
              {' · '}
              {trip.jobId ? (
                <Link href={`/app/jobs/${encodeURIComponent(trip.jobId)}`} className="underline underline-offset-2">
                  {trip.jobName}
                </Link>
              ) : (
                trip.jobName
              )}
            </>
          ) : null}
        </p>
        <p className="shrink-0 text-[14px] font-semibold tabular-nums text-[var(--color-charcoal)]">{money(trip.totalCents)}</p>
      </div>
      {trip.trades.length ? <p className="mt-0.5 text-[11px] text-[var(--color-charcoal-light)]">{trip.trades.map((t) => tradeShort(t)).join(' · ')}</p> : null}
      <ul className="mt-2 space-y-1">
        {[...lead, ...(more ? folded : [])].map((l, i) => (
          <li
            key={`${l.sku}-${i}`}
            className={`flex items-start justify-between gap-3 text-[13px] ${l.matched ? 'border-l-2 border-[var(--color-teal)] pl-2 font-medium text-[var(--color-charcoal)]' : 'pl-2.5 text-[var(--color-charcoal-light)]'}`}
          >
            <span className="min-w-0">
              {l.description || l.sku || 'Line'}
              {l.qty && l.qty !== 1 ? <span className="font-normal text-[var(--color-charcoal-light)]"> × {l.qty}</span> : null}
            </span>
            <span className="shrink-0 tabular-nums">{money(l.lineTotalCents)}</span>
          </li>
        ))}
      </ul>
      {hidden > 0 && !more ? (
        <button type="button" onClick={() => setMore(true)} className="mt-1.5 min-h-9 text-[13px] font-medium text-[var(--color-teal)]">
          {hidden} more line{hidden === 1 ? '' : 's'}
        </button>
      ) : null}
    </li>
  )
}
