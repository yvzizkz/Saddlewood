'use client'

import { useMemo, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, FileText, ClipboardList } from 'lucide-react'

import {
  GOAL_HORIZONS,
  GOAL_HORIZON_LABELS,
  GOAL_KINDS,
  GOAL_OWNERS,
  type GoalHorizon,
  type GoalKind,
  type GoalOwner,
  type OpsGoal,
} from '@/lib/ops/types'

type Props = { initialGoals: OpsGoal[]; docTitles: Record<string, string>; today: string }

const KIND_COLOR: Record<GoalKind, string> = {
  goal: '#182828',
  milestone: '#8f6c18',
  deadline: '#b3392c',
  recurring: '#2f6b4a',
}
const KIND_LABEL: Record<GoalKind, string> = { goal: 'Goal', milestone: 'Milestone', deadline: 'Deadline', recurring: 'Rhythm' }
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function parse(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
function fmt(s: string) {
  const d = parse(s)
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}
function fmtLong(s: string) {
  const d = parse(s)
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

/** Does a recurring goal fall on this date? Daily rhythm = weekdays. */
function occursOn(g: OpsGoal, d: Date) {
  if (g.kind !== 'recurring' || g.status === 'done') return false
  if (g.recurMonthday) return d.getDate() === g.recurMonthday
  if (g.recurWeekday !== null && g.recurWeekday !== undefined) return d.getDay() === g.recurWeekday
  const wd = d.getDay()
  return wd >= 1 && wd <= 5
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  const json = await res.json()
  if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`)
  return json as T
}

export default function OpsCalendar({ initialGoals, docTitles, today }: Props) {
  const [goals, setGoals] = useState<OpsGoal[]>(initialGoals)
  const [view, setView] = useState<'upcoming' | 'month'>('upcoming')
  const todayDate = useMemo(() => parse(today), [today])
  const [cursor, setCursor] = useState(() => new Date(todayDate.getFullYear(), todayDate.getMonth(), 1))
  const [selectedDay, setSelectedDay] = useState<string>(today)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(false)

  // add form
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<GoalKind>('goal')
  const [owner, setOwner] = useState<GoalOwner>('Team')
  const [dueDate, setDueDate] = useState('')
  const [weekday, setWeekday] = useState(5)
  const [horizon, setHorizon] = useState<GoalHorizon>('quarter')
  const [adding, setAdding] = useState(false)

  const replace = (g: OpsGoal) => setGoals((gs) => gs.map((x) => (x.id === g.id ? g : x)))

  async function toggle(g: OpsGoal) {
    const next = g.status === 'done' ? 'open' : 'done'
    setBusy(g.id)
    setError(null)
    replace({ ...g, status: next })
    try {
      const j = await api<{ goal: OpsGoal }>(`/api/ops/goals/${encodeURIComponent(g.id)}`, { method: 'PATCH', body: JSON.stringify({ status: next }) })
      replace(j.goal)
    } catch (e) {
      replace(g)
      setError(`Not saved: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault()
    const t = title.trim()
    if (t.length < 3) return
    setAdding(true)
    setError(null)
    const body: Record<string, unknown> = { title: t, kind, owner, horizon }
    if (kind === 'recurring') body.recurWeekday = weekday
    else if (dueDate) body.dueDate = dueDate
    try {
      const j = await api<{ goal: OpsGoal }>('/api/ops/goals', { method: 'POST', body: JSON.stringify(body) })
      setGoals((gs) => [...gs.filter((x) => x.id !== j.goal.id), j.goal])
      setTitle('')
      setDueDate('')
    } catch (e2) {
      setError(`Not added: ${(e2 as Error).message}`)
    } finally {
      setAdding(false)
    }
  }

  // ---- derived views
  const open = goals.filter((g) => g.status === 'open')
  const dated = open.filter((g) => g.dueDate && g.kind !== 'recurring')
  const in7 = iso(addDays(todayDate, 7))
  const in30 = iso(addDays(todayDate, 30))
  const overdue = dated.filter((g) => g.dueDate! < today)
  const thisWeek = dated.filter((g) => g.dueDate! >= today && g.dueDate! <= in7)
  const next30 = dated.filter((g) => g.dueDate! > in7 && g.dueDate! <= in30)
  const later = dated.filter((g) => g.dueDate! > in30)
  const rhythm = open.filter((g) => g.kind === 'recurring')
  const done = goals.filter((g) => g.status === 'done')

  const monthDays = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const start = addDays(first, -first.getDay())
    const days: Date[] = []
    for (let i = 0; i < 42; i++) days.push(addDays(start, i))
    return days
  }, [cursor])

  function itemsOn(d: Date) {
    const s = iso(d)
    return goals.filter((g) => (g.dueDate === s && g.kind !== 'recurring') || occursOn(g, d))
  }

  const label = 'text-[10px] tracking-[0.12em] uppercase'

  function Row({ g, dateText }: { g: OpsGoal; dateText?: string }) {
    const isDone = g.status === 'done'
    return (
      <li className="flex gap-3 items-start rounded border bg-white px-3 py-2.5" style={{ borderColor: 'var(--color-stone)' }}>
        {g.kind !== 'recurring' ? (
          <input
            type="checkbox"
            checked={isDone}
            disabled={busy === g.id}
            onChange={() => toggle(g)}
            aria-label={`Mark ${g.title} ${isDone ? 'open' : 'done'}`}
            className="mt-1 size-4 shrink-0 accent-[var(--color-teal)]"
          />
        ) : (
          <span aria-hidden="true" className="mt-1.5 size-2.5 rounded-full shrink-0" style={{ backgroundColor: KIND_COLOR.recurring }} />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm leading-snug" style={{ color: 'var(--color-charcoal)', textDecoration: isDone ? 'line-through' : 'none', opacity: isDone ? 0.6 : 1 }}>
            {g.title}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]" style={{ color: 'var(--color-charcoal-light)' }}>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] uppercase tracking-[0.06em]" style={{ backgroundColor: `${KIND_COLOR[g.kind]}1a`, color: KIND_COLOR[g.kind] }}>
              {KIND_LABEL[g.kind]}
            </span>
            <span>{g.owner}</span>
            {dateText && <span>· {dateText}</span>}
            {g.cardId && (
              <Link href="/internal/ops" className="inline-flex items-center gap-1 underline" style={{ color: 'var(--color-teal)' }}>
                <ClipboardList className="size-3" aria-hidden="true" /> {g.cardId}
              </Link>
            )}
            {g.docSlug && docTitles[g.docSlug] && (
              <Link href={`/internal/ops/docs/${g.docSlug}`} className="inline-flex items-center gap-1 underline" style={{ color: 'var(--color-teal)' }}>
                <FileText className="size-3" aria-hidden="true" /> {docTitles[g.docSlug].split(' ').slice(0, 2).join(' ')}
              </Link>
            )}
          </div>
          {g.notes && (
            <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--color-charcoal-light)' }}>
              {g.notes}
            </p>
          )}
        </div>
      </li>
    )
  }

  function Group({ heading, items, dateOf }: { heading: string; items: OpsGoal[]; dateOf?: (g: OpsGoal) => string | undefined }) {
    if (items.length === 0) return null
    return (
      <section className="mb-5">
        <h3 className={`${label} mb-2`} style={{ color: 'var(--color-gold-accessible)' }}>
          {heading} <span style={{ color: 'var(--color-charcoal-light)' }}>· {items.length}</span>
        </h3>
        <ul className="flex flex-col gap-2">
          {items.map((g) => (
            <Row key={g.id} g={g} dateText={dateOf ? dateOf(g) : undefined} />
          ))}
        </ul>
      </section>
    )
  }

  const selectedItems = itemsOn(parse(selectedDay))

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div role="group" aria-label="View" className="flex gap-1.5">
          {(['upcoming', 'month'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className="text-xs px-3 py-1.5 rounded-full border"
              style={{
                borderColor: view === v ? 'var(--color-teal)' : 'var(--color-stone)',
                backgroundColor: view === v ? 'var(--color-teal)' : 'white',
                color: view === v ? 'white' : 'var(--color-charcoal)',
              }}
            >
              {v === 'upcoming' ? 'Upcoming' : 'Month'}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs" style={{ color: 'var(--color-charcoal-light)' }}>
          {open.length} open · {done.length} done
        </span>
      </div>

      <form onSubmit={add} className="grid gap-2 mb-5 rounded border p-3 bg-white" style={{ borderColor: 'var(--color-stone)', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New goal or date" maxLength={200} aria-label="Title" className="col-span-full text-sm px-3 py-2 rounded border outline-none" style={{ borderColor: 'var(--color-stone)', color: 'var(--color-charcoal)' }} />
        <select value={kind} onChange={(e) => setKind(e.target.value as GoalKind)} aria-label="Kind" className="text-sm px-2 py-2 rounded border bg-white" style={{ borderColor: 'var(--color-stone)' }}>
          {GOAL_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <select value={owner} onChange={(e) => setOwner(e.target.value as GoalOwner)} aria-label="Owner" className="text-sm px-2 py-2 rounded border bg-white" style={{ borderColor: 'var(--color-stone)' }}>
          {GOAL_OWNERS.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        {kind === 'recurring' ? (
          <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} aria-label="Weekday" className="text-sm px-2 py-2 rounded border bg-white" style={{ borderColor: 'var(--color-stone)' }}>
            {WEEKDAYS.map((w, i) => (
              <option key={w} value={i}>
                Every {w}
              </option>
            ))}
          </select>
        ) : (
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label="Date" className="text-sm px-2 py-2 rounded border bg-white" style={{ borderColor: 'var(--color-stone)' }} />
        )}
        <select value={horizon} onChange={(e) => setHorizon(e.target.value as GoalHorizon)} aria-label="Horizon" className="text-sm px-2 py-2 rounded border bg-white" style={{ borderColor: 'var(--color-stone)' }}>
          {GOAL_HORIZONS.map((h) => (
            <option key={h} value={h}>
              {GOAL_HORIZON_LABELS[h]}
            </option>
          ))}
        </select>
        <button type="submit" disabled={adding || title.trim().length < 3} className="text-sm px-4 py-2 rounded text-white disabled:opacity-50" style={{ backgroundColor: 'var(--color-teal)' }}>
          {adding ? 'Adding…' : 'Add'}
        </button>
      </form>

      {error && (
        <p role="alert" className="text-sm mb-3 text-red-700">
          {error}
        </p>
      )}

      {view === 'month' ? (
        <div>
          <div className="flex items-center justify-between mb-2">
            <button type="button" aria-label="Previous month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="size-9 inline-flex items-center justify-center rounded border bg-white" style={{ borderColor: 'var(--color-stone)' }}>
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <h3 style={{ fontFamily: 'var(--font-fraunces)', color: 'var(--color-charcoal)' }} className="text-lg">
              {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
            </h3>
            <button type="button" aria-label="Next month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="size-9 inline-flex items-center justify-center rounded border bg-white" style={{ borderColor: 'var(--color-stone)' }}>
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-px rounded border overflow-hidden" style={{ borderColor: 'var(--color-stone)', backgroundColor: 'var(--color-stone)' }}>
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-[10px] uppercase tracking-[0.08em] text-center py-1.5" style={{ backgroundColor: 'var(--color-cream)', color: 'var(--color-charcoal-light)' }}>
                {w}
              </div>
            ))}
            {monthDays.map((d) => {
              const s = iso(d)
              const items = itemsOn(d)
              const inMonth = d.getMonth() === cursor.getMonth()
              const isToday = s === today
              const selected = s === selectedDay
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSelectedDay(s)}
                  aria-label={`${fmtLong(s)}, ${items.length} items`}
                  aria-pressed={selected}
                  className="min-h-[56px] md:min-h-[76px] p-1.5 text-left flex flex-col gap-1"
                  style={{
                    backgroundColor: selected ? 'var(--color-cream)' : 'white',
                    opacity: inMonth ? 1 : 0.45,
                    outline: isToday ? '2px solid var(--color-teal)' : 'none',
                    outlineOffset: '-2px',
                  }}
                >
                  <span className="text-xs" style={{ color: 'var(--color-charcoal)', fontVariantNumeric: 'tabular-nums', fontWeight: isToday ? 600 : 400 }}>
                    {d.getDate()}
                  </span>
                  <span className="flex flex-wrap gap-0.5">
                    {items.slice(0, 6).map((g) => (
                      <span key={g.id} aria-hidden="true" className="size-1.5 rounded-full" style={{ backgroundColor: KIND_COLOR[g.kind], opacity: g.status === 'done' ? 0.35 : 1 }} />
                    ))}
                  </span>
                  {items.length > 0 && (
                    <span className="hidden md:block text-[10px] leading-tight truncate" style={{ color: 'var(--color-charcoal-light)' }}>
                      {items[0].title}
                      {items.length > 1 ? ` +${items.length - 1}` : ''}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <div className="mt-4">
            <h3 className={`${label} mb-2`} style={{ color: 'var(--color-gold-accessible)' }}>
              {fmtLong(selectedDay)}
            </h3>
            {selectedItems.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--color-charcoal-light)' }}>
                Nothing on this day.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {selectedItems.map((g) => (
                  <Row key={g.id} g={g} />
                ))}
              </ul>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-3 text-[11px]" style={{ color: 'var(--color-charcoal-light)' }}>
            {GOAL_KINDS.map((k) => (
              <span key={k} className="inline-flex items-center gap-1">
                <span className="size-2 rounded-full" style={{ backgroundColor: KIND_COLOR[k] }} /> {KIND_LABEL[k]}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <Group heading="Overdue" items={overdue} dateOf={(g) => fmt(g.dueDate!)} />
          <Group heading="This week" items={thisWeek} dateOf={(g) => fmt(g.dueDate!)} />
          <Group heading="Next 30 days" items={next30} dateOf={(g) => fmt(g.dueDate!)} />
          {GOAL_HORIZONS.filter((h) => h !== 'rhythm').map((h) => (
            <Group key={h} heading={GOAL_HORIZON_LABELS[h]} items={later.filter((g) => g.horizon === h)} dateOf={(g) => fmt(g.dueDate!)} />
          ))}
          <Group heading="No date yet" items={open.filter((g) => !g.dueDate && g.kind !== 'recurring')} />
          <Group heading="The weekly rhythm" items={rhythm} dateOf={(g) => (g.recurMonthday ? `the ${g.recurMonthday}th each month` : g.recurWeekday !== null && g.recurWeekday !== undefined ? `every ${WEEKDAYS[g.recurWeekday]}` : 'every working day')} />
          {done.length > 0 && (
            <section className="mb-5">
              <button type="button" onClick={() => setShowDone((v) => !v)} className={`${label} underline`} style={{ color: 'var(--color-charcoal-light)' }}>
                {showDone ? 'Hide' : 'Show'} done · {done.length}
              </button>
              {showDone && (
                <ul className="mt-2 flex flex-col gap-2">
                  {done.map((g) => (
                    <Row key={g.id} g={g} dateText={g.dueDate ? fmt(g.dueDate) : undefined} />
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  )
}
