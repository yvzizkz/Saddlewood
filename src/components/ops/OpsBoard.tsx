'use client'

import { useCallback, useMemo, useState, type FormEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import {
  OPS_COLUMNS,
  OPS_COLUMN_LABELS,
  OPS_OWNERS,
  type OpsCard,
  type OpsColumn,
  type OpsOwner,
} from '@/lib/ops/types'

type Props = { initialCards: OpsCard[] }

const OWNER_STYLE: Record<OpsOwner, { bg: string; fg: string }> = {
  Marco: { bg: 'rgba(212,175,55,0.18)', fg: '#8f6c18' },
  Lando: { bg: 'rgba(24,40,40,0.10)', fg: '#182828' },
  Ilene: { bg: 'rgba(191,160,67,0.16)', fg: '#7a5d16' },
  Eli: { bg: 'rgba(47,107,74,0.14)', fg: '#2f6b4a' },
}

function colIndex(c: OpsColumn) {
  return OPS_COLUMNS.indexOf(c)
}

function when(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

export default function OpsBoard({ initialCards }: Props) {
  const [cards, setCards] = useState<OpsCard[]>(initialCards)
  const [filter, setFilter] = useState<'all' | OpsOwner>('all')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [owner, setOwner] = useState<OpsOwner>('Lando')
  const [col, setCol] = useState<OpsColumn>('backlog')

  const visible = useMemo(
    () => cards.filter((c) => filter === 'all' || c.owner === filter),
    [cards, filter],
  )

  const move = useCallback(
    async (card: OpsCard, dir: -1 | 1) => {
      const i = colIndex(card.col) + dir
      if (i < 0 || i >= OPS_COLUMNS.length) return
      const next = OPS_COLUMNS[i]
      const before = cards
      setBusy(card.id)
      setError(null)
      setCards((cs) => cs.map((c) => (c.id === card.id ? { ...c, col: next } : c)))
      try {
        const res = await fetch(`/api/ops/cards/${encodeURIComponent(card.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ col: next }),
        })
        const json = await res.json()
        if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`)
        setCards((cs) => cs.map((c) => (c.id === card.id ? json.card : c)))
      } catch (e) {
        setCards(before)
        setError(`Move not saved: ${(e as Error).message}`)
      } finally {
        setBusy(null)
      }
    },
    [cards],
  )

  async function add(e: FormEvent) {
    e.preventDefault()
    const t = title.trim()
    if (t.length < 3) return
    setBusy('new')
    setError(null)
    try {
      const res = await fetch('/api/ops/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: t, owner, col }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setCards((cs) => [...cs.filter((c) => c.id !== json.card.id), json.card])
      setTitle('')
    } catch (e2) {
      setError(`Card not added: ${(e2 as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div role="group" aria-label="Filter by owner" className="flex flex-wrap gap-1.5">
          {(['all', ...OPS_OWNERS] as const).map((o) => {
            const active = filter === o
            return (
              <button
                key={o}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(o)}
                className="text-xs px-3 py-1.5 rounded-full border transition-colors"
                style={{
                  borderColor: active ? 'var(--color-teal)' : 'var(--color-stone)',
                  backgroundColor: active ? 'var(--color-teal)' : 'white',
                  color: active ? 'white' : 'var(--color-charcoal)',
                }}
              >
                {o === 'all' ? 'All' : o}
              </button>
            )
          })}
        </div>
        <span className="ml-auto text-xs" style={{ color: 'var(--color-charcoal-light)' }}>
          {cards.length} cards · shared, saves on every move
        </span>
      </div>

      <form onSubmit={add} className="flex flex-wrap gap-2 items-center mb-4 rounded border p-3 bg-white" style={{ borderColor: 'var(--color-stone)' }}>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New card: what has to exist"
          maxLength={160}
          aria-label="New card title"
          className="flex-1 min-w-[180px] text-sm px-3 py-2 rounded border outline-none"
          style={{ borderColor: 'var(--color-stone)', color: 'var(--color-charcoal)' }}
        />
        <select value={owner} onChange={(e) => setOwner(e.target.value as OpsOwner)} aria-label="Owner" className="text-sm px-2 py-2 rounded border bg-white" style={{ borderColor: 'var(--color-stone)' }}>
          {OPS_OWNERS.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <select value={col} onChange={(e) => setCol(e.target.value as OpsColumn)} aria-label="Column" className="text-sm px-2 py-2 rounded border bg-white" style={{ borderColor: 'var(--color-stone)' }}>
          {OPS_COLUMNS.map((c) => (
            <option key={c} value={c}>
              {OPS_COLUMN_LABELS[c]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={busy === 'new' || title.trim().length < 3}
          className="text-sm px-4 py-2 rounded text-white disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-teal)' }}
        >
          {busy === 'new' ? 'Adding…' : 'Add card'}
        </button>
      </form>

      {error && (
        <p role="alert" className="text-sm mb-3 text-red-700">
          {error}
        </p>
      )}

      <div className="grid gap-3 overflow-x-auto pb-2" style={{ gridTemplateColumns: `repeat(${OPS_COLUMNS.length}, minmax(220px, 1fr))` }}>
        {OPS_COLUMNS.map((c) => {
          const list = visible.filter((k) => k.col === c)
          const good = c === 'live' || c === 'measured'
          return (
            <section key={c} aria-labelledby={`col-${c}`} className="rounded border flex flex-col" style={{ borderColor: 'var(--color-stone)', backgroundColor: 'var(--color-cream)' }}>
              <h3
                id={`col-${c}`}
                className="flex justify-between px-3 py-2 text-[11px] tracking-[0.12em] uppercase border-b"
                style={{
                  borderColor: 'var(--color-stone)',
                  color: good ? '#2f6b4a' : c === 'review' ? 'var(--color-gold-accessible)' : 'var(--color-charcoal-light)',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                <span>{OPS_COLUMN_LABELS[c]}</span>
                <span style={{ color: 'var(--color-charcoal)', fontVariantNumeric: 'tabular-nums' }}>{list.length}</span>
              </h3>
              <div className="flex flex-col gap-2 p-2 min-h-[120px]">
                {list.length === 0 && (
                  <p className="text-xs text-center py-3" style={{ color: 'var(--color-charcoal-light)' }}>
                    nothing here
                  </p>
                )}
                {list.map((card) => {
                  const i = colIndex(card.col)
                  const os = OWNER_STYLE[card.owner]
                  return (
                    <article key={card.id} className="rounded bg-white border p-2.5 shadow-sm" style={{ borderColor: 'var(--color-stone)' }}>
                      <div className="text-[10px] tracking-[0.1em] uppercase" style={{ color: 'var(--color-gold-accessible)' }}>
                        {card.id}
                      </div>
                      <div className="text-sm font-medium leading-snug mt-0.5" style={{ color: 'var(--color-charcoal)' }}>
                        {card.title}
                      </div>
                      {card.note && (
                        <p className="text-xs mt-1 leading-snug" style={{ color: 'var(--color-charcoal-light)' }}>
                          {card.note}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] tracking-[0.08em] uppercase px-2 py-0.5 rounded-full" style={{ backgroundColor: os.bg, color: os.fg }}>
                          {card.owner}
                        </span>
                        <span className="ml-auto inline-flex gap-1">
                          <button
                            type="button"
                            aria-label={`Move ${card.title} left`}
                            disabled={i === 0 || busy === card.id}
                            onClick={() => move(card, -1)}
                            className="size-8 rounded border inline-flex items-center justify-center disabled:opacity-30 hover:border-[var(--color-teal)]"
                            style={{ borderColor: 'var(--color-stone)', color: 'var(--color-charcoal)' }}
                          >
                            <ChevronLeft className="size-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Move ${card.title} right`}
                            disabled={i === OPS_COLUMNS.length - 1 || busy === card.id}
                            onClick={() => move(card, 1)}
                            className="size-8 rounded border inline-flex items-center justify-center disabled:opacity-30 hover:border-[var(--color-teal)]"
                            style={{ borderColor: 'var(--color-stone)', color: 'var(--color-charcoal)' }}
                          >
                            <ChevronRight className="size-4" aria-hidden="true" />
                          </button>
                        </span>
                      </div>
                      {card.updatedBy && (
                        <div className="text-[10px] mt-1.5" style={{ color: 'var(--color-charcoal-light)' }}>
                          {when(card.updatedAt)} · {card.updatedBy}
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
