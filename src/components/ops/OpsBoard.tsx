'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { X, MessageSquare, FileText, CalendarDays } from 'lucide-react'

import {
  OPS_COLUMNS,
  OPS_COLUMN_LABELS,
  OPS_OWNERS,
  type OpsCard,
  type OpsColumn,
  type OpsComment,
  type OpsEvent,
  type OpsOwner,
} from '@/lib/ops/types'

type Props = { initialCards: OpsCard[]; docTitles: Record<string, string> }

const OWNER_STYLE: Record<OpsOwner, { bg: string; fg: string }> = {
  Marco: { bg: 'rgba(212,175,55,0.18)', fg: '#8f6c18' },
  Lando: { bg: 'rgba(24,40,40,0.10)', fg: '#182828' },
  Ilene: { bg: 'rgba(191,160,67,0.16)', fg: '#7a5d16' },
  Eli: { bg: 'rgba(47,107,74,0.14)', fg: '#2f6b4a' },
}

function when(iso: string, withTime = false) {
  try {
    const d = new Date(iso)
    return withTime
      ? d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

function shortActor(a: string) {
  return a.includes('@') ? a.split('@')[0] : a
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  const json = await res.json()
  if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`)
  return json as T
}

export default function OpsBoard({ initialCards, docTitles }: Props) {
  const [cards, setCards] = useState<OpsCard[]>(initialCards)
  const [filter, setFilter] = useState<'all' | OpsOwner>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [undo, setUndo] = useState<{ card: OpsCard; fromCol: OpsColumn } | null>(null)
  const undoTimer = useRef<number | null>(null)

  // add form
  const [title, setTitle] = useState('')
  const [owner, setOwner] = useState<OpsOwner>('Lando')
  const [col, setCol] = useState<OpsColumn>('backlog')
  const [adding, setAdding] = useState(false)

  const visible = useMemo(() => cards.filter((c) => filter === 'all' || c.owner === filter), [cards, filter])
  const open = useMemo(() => cards.find((c) => c.id === openId) ?? null, [cards, openId])

  const replace = useCallback((card: OpsCard) => setCards((cs) => cs.map((c) => (c.id === card.id ? card : c))), [])

  const moveTo = useCallback(
    async (card: OpsCard, next: OpsColumn, silent = false) => {
      if (card.col === next) return
      const fromCol = card.col
      setError(null)
      replace({ ...card, col: next })
      try {
        const json = await api<{ card: OpsCard }>(`/api/ops/cards/${encodeURIComponent(card.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ col: next }),
        })
        replace(json.card)
        if (!silent) {
          if (undoTimer.current) window.clearTimeout(undoTimer.current)
          setUndo({ card: json.card, fromCol })
          undoTimer.current = window.setTimeout(() => setUndo(null), 8000)
        }
      } catch (e) {
        replace({ ...card, col: fromCol })
        setError(`Move not saved: ${(e as Error).message}`)
      }
    },
    [replace],
  )

  async function undoMove() {
    if (!undo) return
    const { card, fromCol } = undo
    setUndo(null)
    await moveTo(card, fromCol, true)
  }

  async function add(e: FormEvent) {
    e.preventDefault()
    const t = title.trim()
    if (t.length < 3) return
    setAdding(true)
    setError(null)
    try {
      const json = await api<{ card: OpsCard }>('/api/ops/cards', { method: 'POST', body: JSON.stringify({ title: t, owner, col }) })
      setCards((cs) => [...cs.filter((c) => c.id !== json.card.id), json.card])
      setTitle('')
      setOpenId(json.card.id)
    } catch (e2) {
      setError(`Card not added: ${(e2 as Error).message}`)
    } finally {
      setAdding(false)
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
          {cards.length} cards · tap a card to read it, respond, or move it
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
        <button type="submit" disabled={adding || title.trim().length < 3} className="text-sm px-4 py-2 rounded text-white disabled:opacity-50" style={{ backgroundColor: 'var(--color-teal)' }}>
          {adding ? 'Adding…' : 'Add card'}
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
                  const os = OWNER_STYLE[card.owner]
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => setOpenId(card.id)}
                      aria-haspopup="dialog"
                      className="text-left rounded bg-white border p-2.5 shadow-sm hover:border-[var(--color-teal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-teal)]"
                      style={{ borderColor: 'var(--color-stone)' }}
                    >
                      <div className="text-[10px] tracking-[0.1em] uppercase" style={{ color: 'var(--color-gold-accessible)' }}>
                        {card.id}
                      </div>
                      <div className="text-sm font-medium leading-snug mt-0.5" style={{ color: 'var(--color-charcoal)' }}>
                        {card.title}
                      </div>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className="text-[10px] tracking-[0.08em] uppercase px-2 py-0.5 rounded-full" style={{ backgroundColor: os.bg, color: os.fg }}>
                          {card.owner}
                        </span>
                        {card.docSlug && docTitles[card.docSlug] && (
                          <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: 'var(--color-charcoal-light)' }}>
                            <FileText className="size-3" aria-hidden="true" />
                            {docTitles[card.docSlug].split(' ')[0]}
                          </span>
                        )}
                        {card.dueDate && (
                          <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: 'var(--color-charcoal-light)' }}>
                            <CalendarDays className="size-3" aria-hidden="true" />
                            {card.dueDate}
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      {undo && (
        <div role="status" className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded px-4 py-2.5 text-sm shadow-lg" style={{ backgroundColor: 'var(--color-teal)', color: 'white' }}>
          <span>
            Moved “{undo.card.title}” to {OPS_COLUMN_LABELS[undo.card.col]}.
          </span>
          <button type="button" onClick={undoMove} className="underline font-medium">
            Undo
          </button>
        </div>
      )}

      {open && (
        <CardDrawer
          card={open}
          docTitle={open.docSlug ? docTitles[open.docSlug] : undefined}
          onClose={() => setOpenId(null)}
          onMove={(next) => moveTo(open, next)}
          onUpdated={replace}
          onError={setError}
        />
      )}
    </div>
  )
}

type DrawerProps = {
  card: OpsCard
  docTitle?: string
  onClose: () => void
  onMove: (next: OpsColumn) => void
  onUpdated: (card: OpsCard) => void
  onError: (msg: string | null) => void
}

function CardDrawer({ card, docTitle, onClose, onMove, onUpdated, onError }: DrawerProps) {
  const [comments, setComments] = useState<OpsComment[] | null>(null)
  const [events, setEvents] = useState<OpsEvent[]>([])
  const [target, setTarget] = useState<OpsColumn>(card.col)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [nextStep, setNextStep] = useState(card.nextStep)
  const [note, setNote] = useState(card.note)
  const [dueDate, setDueDate] = useState(card.dueDate ?? '')
  const os = OWNER_STYLE[card.owner]

  useEffect(() => {
    setTarget(card.col)
  }, [card.col])

  useEffect(() => {
    let alive = true
    setComments(null)
    api<{ comments: OpsComment[]; events: OpsEvent[] }>(`/api/ops/cards/${encodeURIComponent(card.id)}`)
      .then((j) => {
        if (!alive) return
        setComments(j.comments)
        setEvents(j.events)
      })
      .catch((e) => alive && onError(`Could not load the card: ${(e as Error).message}`))
    return () => {
      alive = false
    }
  }, [card.id, onError])

  async function respond(e: FormEvent) {
    e.preventDefault()
    const body = text.trim()
    if (!body) return
    setBusy(true)
    try {
      const j = await api<{ comment: OpsComment }>(`/api/ops/cards/${encodeURIComponent(card.id)}/comments`, { method: 'POST', body: JSON.stringify({ body }) })
      setComments((cs) => [...(cs ?? []), j.comment])
      setText('')
    } catch (err) {
      onError(`Response not saved: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function saveDetails() {
    setBusy(true)
    try {
      const j = await api<{ card: OpsCard }>(`/api/ops/cards/${encodeURIComponent(card.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ nextStep: nextStep.trim(), note: note.trim(), dueDate: dueDate || null }),
      })
      onUpdated(j.card)
      setEditing(false)
    } catch (err) {
      onError(`Details not saved: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const label = 'text-[10px] tracking-[0.12em] uppercase'
  const labelStyle = { color: 'var(--color-gold-accessible)' }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/30" />
      <aside className="relative h-full w-full md:w-[460px] overflow-y-auto shadow-2xl flex flex-col" style={{ backgroundColor: 'var(--color-background)' }}>
        <div className="sticky top-0 flex items-start gap-3 px-5 py-4 border-b" style={{ backgroundColor: 'var(--color-background)', borderColor: 'var(--color-stone)' }}>
          <div className="min-w-0 flex-1">
            <div className={label} style={labelStyle}>
              {card.id} · {OPS_COLUMN_LABELS[card.col]}
            </div>
            <h2 id="drawer-title" className="text-lg leading-snug mt-0.5" style={{ fontFamily: 'var(--font-fraunces)', color: 'var(--color-charcoal)' }}>
              {card.title}
            </h2>
            <span className="inline-block mt-1.5 text-[10px] tracking-[0.08em] uppercase px-2 py-0.5 rounded-full" style={{ backgroundColor: os.bg, color: os.fg }}>
              {card.owner}
            </span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="size-9 inline-flex items-center justify-center rounded border" style={{ borderColor: 'var(--color-stone)', color: 'var(--color-charcoal)' }}>
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-5 text-sm" style={{ color: 'var(--color-charcoal)' }}>
          <section>
            <div className="flex items-center justify-between">
              <div className={label} style={labelStyle}>How to act on this</div>
              {!editing && (
                <button type="button" onClick={() => setEditing(true)} className="text-xs underline" style={{ color: 'var(--color-teal)' }}>
                  Edit
                </button>
              )}
            </div>
            {editing ? (
              <div className="mt-2 flex flex-col gap-2">
                <textarea value={nextStep} onChange={(e) => setNextStep(e.target.value)} rows={3} maxLength={600} aria-label="How to act" className="w-full text-sm px-3 py-2 rounded border bg-white" style={{ borderColor: 'var(--color-stone)' }} />
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} aria-label="Note" placeholder="Note" className="w-full text-sm px-3 py-2 rounded border bg-white" style={{ borderColor: 'var(--color-stone)' }} />
                <label className="text-xs flex items-center gap-2" style={{ color: 'var(--color-charcoal-light)' }}>
                  Due
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="text-sm px-2 py-1 rounded border bg-white" style={{ borderColor: 'var(--color-stone)' }} />
                </label>
                <div className="flex gap-2">
                  <button type="button" disabled={busy} onClick={saveDetails} className="text-sm px-3 py-1.5 rounded text-white disabled:opacity-50" style={{ backgroundColor: 'var(--color-teal)' }}>
                    Save
                  </button>
                  <button type="button" onClick={() => { setEditing(false); setNextStep(card.nextStep); setNote(card.note); setDueDate(card.dueDate ?? '') }} className="text-sm px-3 py-1.5 rounded border" style={{ borderColor: 'var(--color-stone)' }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="mt-1 leading-relaxed">{card.nextStep || 'No next step written yet. Edit to add one.'}</p>
                {card.note && (
                  <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--color-charcoal-light)' }}>
                    {card.note}
                  </p>
                )}
                {card.dueDate && (
                  <p className="mt-2 text-xs inline-flex items-center gap-1" style={{ color: 'var(--color-charcoal-light)' }}>
                    <CalendarDays className="size-3.5" aria-hidden="true" /> Due {card.dueDate}
                  </p>
                )}
              </>
            )}
          </section>

          {card.docSlug && (
            <section>
              <div className={label} style={labelStyle}>Read</div>
              <Link href={`/internal/ops/docs/${card.docSlug}`} className="mt-1 inline-flex items-center gap-2 underline" style={{ color: 'var(--color-teal)' }}>
                <FileText className="size-4" aria-hidden="true" />
                {docTitle ?? card.docSlug}
              </Link>
            </section>
          )}

          <section className="rounded border p-3 bg-white" style={{ borderColor: 'var(--color-stone)' }}>
            <div className={label} style={labelStyle}>Move this card</div>
            <div className="mt-2 flex gap-2 items-center">
              <select value={target} onChange={(e) => setTarget(e.target.value as OpsColumn)} aria-label="Column" className="flex-1 text-sm px-2 py-2 rounded border bg-white" style={{ borderColor: 'var(--color-stone)' }}>
                {OPS_COLUMNS.map((c) => (
                  <option key={c} value={c}>
                    {OPS_COLUMN_LABELS[c]}
                  </option>
                ))}
              </select>
              <button type="button" disabled={target === card.col} onClick={() => onMove(target)} className="text-sm px-4 py-2 rounded text-white disabled:opacity-40" style={{ backgroundColor: 'var(--color-teal)' }}>
                Move
              </button>
            </div>
            <p className="mt-2 text-xs" style={{ color: 'var(--color-charcoal-light)' }}>
              Every move is recorded with your name, and you get eight seconds to undo it.
            </p>
          </section>

          <section>
            <div className={label} style={labelStyle}>
              <span className="inline-flex items-center gap-1"><MessageSquare className="size-3.5" aria-hidden="true" /> Responses</span>
            </div>
            <div className="mt-2 flex flex-col gap-2">
              {comments === null && <p className="text-xs" style={{ color: 'var(--color-charcoal-light)' }}>Loading…</p>}
              {comments && comments.length === 0 && (
                <p className="text-xs" style={{ color: 'var(--color-charcoal-light)' }}>
                  No responses yet. Anything written here stays with the card as part of the record.
                </p>
              )}
              {comments?.map((m) => (
                <div key={m.id} className="rounded border bg-white px-3 py-2" style={{ borderColor: 'var(--color-stone)' }}>
                  <div className="text-[11px]" style={{ color: 'var(--color-charcoal-light)' }}>
                    <b style={{ color: 'var(--color-charcoal)' }}>{shortActor(m.author)}</b> · {when(m.at, true)}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap leading-relaxed">{m.body}</p>
                </div>
              ))}
            </div>
            <form onSubmit={respond} className="mt-3 flex flex-col gap-2">
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} placeholder="Write a response: a decision, a question, what you did, what is blocking." aria-label="Response" className="w-full text-sm px-3 py-2 rounded border bg-white" style={{ borderColor: 'var(--color-stone)' }} />
              <div className="flex justify-end">
                <button type="submit" disabled={busy || !text.trim()} className="text-sm px-4 py-2 rounded text-white disabled:opacity-40" style={{ backgroundColor: 'var(--color-teal)' }}>
                  {busy ? 'Saving…' : 'Add response'}
                </button>
              </div>
            </form>
          </section>

          {events.length > 0 && (
            <section className="pb-6">
              <div className={label} style={labelStyle}>History</div>
              <ul className="mt-2 flex flex-col gap-1 text-xs" style={{ color: 'var(--color-charcoal-light)' }}>
                {events.slice(0, 10).map((e) => (
                  <li key={e.id}>
                    {when(e.at, true)} · {shortActor(e.actor)}
                    {e.fromCol && e.toCol ? ` moved ${OPS_COLUMN_LABELS[e.fromCol]} → ${OPS_COLUMN_LABELS[e.toCol]}` : e.toCol ? ` added in ${OPS_COLUMN_LABELS[e.toCol]}` : ' updated'}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </aside>
    </div>
  )
}
