'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Gavel, Phone, Plus, RefreshCw, Search, Settings } from 'lucide-react'

import { botApi } from '@/components/bot/BotProvider'
import { useSalesToast } from './useSalesToast'
import { Button, Card, Chip, Empty, INPUT, ScreenTitle, SectionTitle, Segmented, TONE } from '@/components/bot/ui'
import type { InboxItem } from '@/lib/sales/inbox'
import { agenda, valueOf, type Metrics, type OpportunityRow } from '@/lib/sales/pipeline'
import { KINDS, OPEN_STAGES, STAGES, stageInfo, type Opportunity, type OpportunityKind, type Stage } from '@/lib/sales/types'
import { usd } from './format'
import { contactLine, dialable, proofChip, stageAge } from './pipeline/labels'
import { QuickAddSheet } from './pipeline/QuickAddSheet'

// The pipeline: every prospect from the first call to the signed job. Three
// ways to look at the same list. "Today" is what to do now (the follow-ups the
// bot used to text about), "Board" is where everything stands, "List" finds
// anything, closed ones too. Callers and bid invites that are not tracked yet
// wait on top, one tap from the pipeline.

type Data = {
  today: string
  rows: OpportunityRow[]
  metrics: Metrics
  inbox: InboxItem[]
  inboxSyncedAt: string | null
  me: string
  canSyncLeads: boolean
}
type View = 'today' | 'board' | 'list'

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-[132px] shrink-0 snap-start rounded-2xl border border-[var(--color-stone)] bg-white px-3.5 py-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-gold-accessible)]">{label}</p>
      <p className="mt-1 text-xl font-medium tabular-nums text-[var(--color-charcoal)]" style={{ fontFamily: 'var(--font-fraunces)' }}>
        {value}
      </p>
      {sub ? <p className="text-[11px] text-[var(--color-charcoal-light)]">{sub}</p> : null}
    </div>
  )
}

function MetricsStrip({ m }: { m: Metrics }) {
  return (
    // Tiles scroll sideways on a phone; the page itself never does.
    <div className="-mx-4 mb-5 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      <Stat label="Open" value={usd(m.openCents, { whole: true, compact: true })} sub={`${m.openCount} job${m.openCount === 1 ? '' : 's'} · ${usd(m.weightedCents, { whole: true, compact: true })} weighted`} />
      <Stat label="Due today" value={String(m.dueToday)} sub={m.dueToday ? 'see Today' : 'all clear'} />
      <Stat label="Won · 90d" value={usd(m.wonCents90, { whole: true, compact: true })} sub={`${m.wonCount90} job${m.wonCount90 === 1 ? '' : 's'}`} />
      <Stat
        label="Win rate · 90d"
        value={m.winRate90 === null ? '—' : `${m.winRate90}%`}
        sub={m.medianDaysToWin === null ? `${m.wonCount90} won, ${m.lostCount90} lost` : `~${m.medianDaysToWin}d to close`}
      />
    </div>
  )
}

/** One opportunity, as a compact card: the board and the list share it. */
function OppCard({ o, today, note }: { o: OpportunityRow; today: string; note?: { text: string; tone: keyof typeof TONE } }) {
  const proof = proofChip(o.proposal)
  const value = valueOf(o)
  return (
    <Link href={`/app/sales/${o.id}`} className="block">
      <Card className="px-3.5 py-3 active:bg-[var(--color-cream)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-medium leading-snug text-[var(--color-charcoal)]">{o.title}</p>
            <p className="truncate text-[13px] text-[var(--color-charcoal-light)]">{contactLine(o) || o.address || o.number}</p>
          </div>
          <p className="shrink-0 text-[15px] font-medium tabular-nums text-[var(--color-charcoal)]">{value > 0 ? usd(value, { whole: true, compact: true }) : '—'}</p>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {note ? <Chip tone={note.tone}>{note.text}</Chip> : <Chip tone="quiet">{stageAge(o, today)}</Chip>}
          {proof ? <Chip tone={proof.tone}>{proof.text}</Chip> : null}
          {o.nextStepOn && !note ? (
            <span className={`text-[11px] ${o.nextStepOn < today ? 'text-[#9a2a1f]' : 'text-[var(--color-charcoal-light)]'}`}>
              {o.nextStep || 'Next'} · {o.nextStepOn === today ? 'today' : o.nextStepOn.slice(5).replace('-', '/')}
            </span>
          ) : null}
        </div>
      </Card>
    </Link>
  )
}

function TodayView({ data }: { data: Data }) {
  const items = useMemo(() => agenda(data.rows, data.today), [data])
  if (items.length === 0) return <Empty>Nothing is waiting. Every follow-up is on its date.</Empty>
  return (
    <div className="space-y-2">
      {items.map((a) => (
        <OppCard key={a.row.id} o={a.row} today={data.today} note={{ text: a.label, tone: a.tone }} />
      ))}
    </div>
  )
}

function BoardView({ data }: { data: Data }) {
  const cols = OPEN_STAGES.map((s) => {
    const rows = data.rows.filter((o) => o.stage === s)
    return { stage: s, rows, cents: rows.reduce((a, o) => a + valueOf(o), 0) }
  })
  return (
    // Columns snap one at a time on a phone; a desktop sees two and a half.
    <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:thin]">
      {cols.map((c) => (
        <section key={c.stage} aria-label={stageInfo(c.stage).label} className="w-[82%] max-w-[280px] shrink-0 snap-start">
          <div className="mb-2 flex items-baseline justify-between px-1">
            <p className="text-[13px] font-medium text-[var(--color-charcoal)]">
              {stageInfo(c.stage).label} <span className="font-mono text-[11px] text-[var(--color-charcoal-light)]">{c.rows.length}</span>
            </p>
            <p className="font-mono text-[11px] tabular-nums text-[var(--color-charcoal-light)]">{c.cents ? usd(c.cents, { whole: true, compact: true }) : ''}</p>
          </div>
          <div className="space-y-2 rounded-2xl bg-[var(--color-cream)] p-2 min-h-24">
            {c.rows.length === 0 ? <p className="px-2 py-6 text-center text-xs text-[var(--color-charcoal-light)]">Nothing here</p> : null}
            {c.rows.map((o) => (
              <OppCard key={o.id} o={o} today={data.today} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

const ALL = 'all'

function ListView({ data }: { data: Data }) {
  const [q, setQ] = useState('')
  const [stage, setStage] = useState<Stage | typeof ALL | 'open'>('open')
  const [kind, setKind] = useState<OpportunityKind | typeof ALL>(ALL)
  const rows = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    return data.rows
      .filter((o) => (stage === ALL ? true : stage === 'open' ? OPEN_STAGES.includes(o.stage) : o.stage === stage))
      .filter((o) => kind === ALL || o.kind === kind)
      .filter((o) => {
        if (!words.length) return true
        const hay = `${o.title} ${o.number} ${o.contact.name} ${o.contact.company ?? ''} ${o.contact.phone ?? ''} ${o.contact.email ?? ''} ${o.address}`.toLowerCase()
        return words.every((w) => hay.includes(w))
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }, [data.rows, q, stage, kind])

  const stageOpts: { key: Stage | typeof ALL | 'open'; label: string }[] = [
    { key: 'open', label: 'Open' },
    { key: ALL, label: 'All' },
    ...STAGES.map((s) => ({ key: s.key, label: s.short })),
  ]
  const pill = (on: boolean) =>
    `min-h-9 shrink-0 rounded-full border px-3 text-[13px] font-medium ${
      on ? 'border-[var(--color-teal)] bg-[var(--color-teal)] text-white' : 'border-[var(--color-stone-mid)] bg-white text-[var(--color-charcoal)]'
    }`

  return (
    <div>
      <label className="relative mb-3 block">
        <span className="sr-only">Search</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-charcoal-light)]" aria-hidden="true" />
        <input className={`${INPUT} pl-9`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone, address, number" type="search" />
      </label>
      <div className="-mx-4 mb-2 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="group" aria-label="Stage">
        {stageOpts.map((o) => (
          <button key={o.key} type="button" aria-pressed={stage === o.key} className={pill(stage === o.key)} onClick={() => setStage(o.key)}>
            {o.label}
          </button>
        ))}
      </div>
      <div className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="group" aria-label="Kind of work">
        <button type="button" aria-pressed={kind === ALL} className={pill(kind === ALL)} onClick={() => setKind(ALL)}>
          Any work
        </button>
        {KINDS.map((k) => (
          <button key={k.key} type="button" aria-pressed={kind === k.key} className={pill(kind === k.key)} onClick={() => setKind(k.key)}>
            {k.label}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <Empty>Nothing matches.</Empty>
      ) : (
        <div className="space-y-2">
          {rows.map((o) => (
            <OppCard key={o.id} o={o} today={data.today} />
          ))}
        </div>
      )}
    </div>
  )
}

type CallStatus = 'pending' | 'called' | 'texted' | 'dismissed'
type SyncAction = { id: number; status: string; result?: string | null }

function pulledLabel(iso: string | null): string {
  if (!iso) return 'Call list not pulled yet'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Call list not pulled yet'
  return `Call list pulled ${d.toLocaleString('en-US', { timeZone: 'America/Phoenix', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
}

function Inbox({ items, syncedAt, canSync, onChanged }: { items: InboxItem[]; syncedAt: string | null; canSync: boolean; onChanged: () => void }) {
  const router = useRouter()
  const { toast } = useSalesToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [syncNote, setSyncNote] = useState('')
  if (items.length === 0 && !canSync) return null
  const shown = showAll ? items : items.slice(0, 3)

  async function track(i: InboxItem) {
    setBusy(i.ref)
    try {
      const r = await botApi<{ opportunity: Opportunity }>('/api/sales', {
        method: 'POST',
        body: JSON.stringify({
          title: i.title,
          kind: i.from === 'bid' ? 'framing_sub' : 'remodel',
          source: i.from === 'bid' ? 'bid_invite' : 'call',
          contact: i.from === 'bid' ? { name: '', company: i.who } : { name: i.who === i.phone ? '' : i.who, phone: i.phone ?? '', email: i.email ?? '' },
          externalRef: i.ref,
          firstNote: i.detail || undefined,
          nextStep: i.from === 'bid' ? 'Decide: bid or pass' : 'Call back',
        }),
      })
      router.push(`/app/sales/${r.opportunity.id}`)
    } catch (e) {
      toast((e as Error).message, 'bad')
      onChanged()
    } finally {
      setBusy(null)
    }
  }

  async function mark(i: InboxItem, status: CallStatus) {
    if (!i.phone) return
    setBusy(i.ref)
    try {
      await botApi('/api/sales/inbox', { method: 'PATCH', body: JSON.stringify({ phone: i.phone, status }) })
      toast(status === 'dismissed' ? `${i.who} dismissed` : status === 'pending' ? `${i.who} back to waiting` : `${i.who} marked ${status}`)
      setOpen(null)
      onChanged()
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setBusy(null)
    }
  }

  // The call list is built on the office Mac (GoHighLevel plus the company's
  // email history), so a sync asks the Mac and waits for it.
  async function sync() {
    setBusy('sync')
    setSyncNote('Asking the office Mac to pull from GoHighLevel…')
    try {
      const { action } = await botApi<{ action: SyncAction }>('/api/sales/inbox', { method: 'POST', body: JSON.stringify({ sync: true }) })
      const deadline = Date.now() + 90_000
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2500))
        const a = await botApi<{ action: SyncAction }>(`/api/sales/inbox?action=${action.id}`).then((r) => r.action).catch(() => null)
        if (!a) continue
        if (a.status === 'working') setSyncNote('The Mac is pulling from GoHighLevel…')
        if (a.status === 'done') {
          toast(a.result || 'Synced from GoHighLevel')
          onChanged()
          return
        }
        if (a.status === 'failed' || a.status === 'refused') {
          toast(a.result || 'The sync did not work', 'bad')
          return
        }
      }
      toast('The office Mac did not answer. It may be asleep or offline; try again in a minute.', 'bad')
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setBusy(null)
      setSyncNote('')
    }
  }

  return (
    <section>
      <SectionTitle
        count={items.length}
        action={
          canSync ? (
            <button
              type="button"
              className="flex min-h-11 items-center gap-1.5 text-[13px] font-medium text-[var(--color-teal)] disabled:opacity-50"
              disabled={!!busy}
              onClick={sync}
            >
              <RefreshCw className={`size-3.5 ${busy === 'sync' ? 'animate-spin' : ''}`} aria-hidden="true" />
              {busy === 'sync' ? 'Syncing…' : 'Sync GoHighLevel'}
            </button>
          ) : null
        }
      >
        Not tracked yet
      </SectionTitle>
      {canSync ? (
        <p className="-mt-1 mb-2 text-[11px] text-[var(--color-charcoal-light)]" aria-live="polite">
          {syncNote || pulledLabel(syncedAt)}
        </p>
      ) : null}
      {items.length === 0 ? (
        <Card className="px-3.5 py-3">
          <p className="text-[13px] text-[var(--color-charcoal-light)]">Nobody waiting. Every caller and bid invite is tracked or dismissed.</p>
        </Card>
      ) : (
        <Card className="divide-y divide-[var(--color-stone)]">
          {shown.map((i) => (
            <div key={i.ref} className="px-3.5 py-3">
              <div className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-cream)] text-[var(--color-gold-accessible)]" aria-hidden="true">
                  {i.from === 'bid' ? <Gavel className="size-4" /> : <Phone className="size-4" />}
                </span>
                {i.from === 'call' && i.phone ? (
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    aria-expanded={open === i.ref}
                    aria-label={`${i.who}: mark called, texted or dismissed`}
                    onClick={() => setOpen((o) => (o === i.ref ? null : i.ref))}
                  >
                    <InboxText i={i} />
                  </button>
                ) : (
                  <div className="min-w-0 flex-1">
                    <InboxText i={i} />
                  </div>
                )}
                {i.from === 'call' && i.phone ? (
                  <a
                    href={i.dialUrl || `tel:${dialable(i.phone)}`}
                    aria-label={`Call ${i.who}`}
                    className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[var(--color-stone-mid)] bg-white text-[var(--color-teal)]"
                  >
                    <Phone className="size-4" aria-hidden="true" />
                  </a>
                ) : null}
                <Button className="shrink-0 !px-3" busy={busy === i.ref} disabled={!!busy} onClick={() => track(i)}>
                  Track
                </Button>
              </div>
              {open === i.ref ? (
                <div className="mt-2 flex flex-wrap gap-2 pl-12">
                  {(i.status ? (['pending', 'called', 'texted', 'dismissed'] as const) : (['called', 'texted', 'dismissed'] as const))
                    .filter((st) => st !== i.status)
                    .map((st) => (
                      <button
                        key={st}
                        type="button"
                        disabled={!!busy}
                        onClick={() => mark(i, st)}
                        className="min-h-11 rounded-xl border border-[var(--color-stone-mid)] bg-white px-3 text-[13px] font-medium text-[var(--color-charcoal)] disabled:opacity-50"
                      >
                        {st === 'pending' ? 'Not yet' : st === 'called' ? 'Called' : st === 'texted' ? 'Texted' : 'Dismiss'}
                      </button>
                    ))}
                </div>
              ) : null}
            </div>
          ))}
        </Card>
      )}
      {items.length > 3 ? (
        <button type="button" className="mt-1 min-h-11 w-full text-sm font-medium text-[var(--color-teal)]" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      ) : null}
    </section>
  )
}

function InboxText({ i }: { i: InboxItem }) {
  return (
    <>
      <p className="truncate text-[14px] font-medium text-[var(--color-charcoal)]">{i.title}</p>
      <p className="flex items-center gap-1.5 truncate text-[12px] text-[var(--color-charcoal-light)]">
        {i.status ? <Chip tone="ok">{i.status === 'called' ? 'Called' : 'Texted'}</Chip> : null}
        <span className="truncate">
          {i.from === 'bid' ? i.who : i.detail || 'Caller'} · {i.ageDays === 0 ? 'today' : `${i.ageDays}d`}
        </span>
      </p>
    </>
  )
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-2">
      <div className="mb-5 flex gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[84px] w-[132px] shrink-0 animate-pulse rounded-2xl bg-[var(--color-cream)]" />
        ))}
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[74px] animate-pulse rounded-2xl bg-[var(--color-cream)]" />
      ))}
    </div>
  )
}

export default function SalesScreen() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('today')
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    try {
      const d = await botApi<Data>('/api/sales')
      setData(d)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    // The first load, and again whenever the phone comes back to the app:
    // a client may have opened or accepted a proposal in the meantime.
    const first = window.setTimeout(load, 0)
    const onFocus = () => {
      if (document.visibilityState === 'visible') load()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.clearTimeout(first)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [load])

  const dueCount = data ? data.metrics.dueToday : 0

  return (
    <div className="px-4 pb-28 pt-5">
      <div className="relative">
        <ScreenTitle eyebrow="Sales" title="Pipeline" />
        {/* Defaults, terms, signing and proposal mail live here (owners edit). */}
        <Link
          href="/app/sales/settings"
          aria-label="Sales settings"
          className="absolute right-0 top-0 inline-flex size-11 items-center justify-center rounded-xl border border-[var(--color-stone)] bg-white text-[var(--color-charcoal)]"
        >
          <Settings className="size-5" aria-hidden="true" />
        </Link>
      </div>
      {!data && !error ? <Skeleton /> : null}
      {error && !data ? (
        <Card className="p-4">
          <p className="text-sm text-[var(--color-charcoal)]">{error}</p>
          <Button className="mt-3" onClick={load}>
            Try again
          </Button>
        </Card>
      ) : null}
      {data ? (
        <>
          <MetricsStrip m={data.metrics} />
          <Inbox items={data.inbox} syncedAt={data.inboxSyncedAt} canSync={data.canSyncLeads} onChanged={load} />
          <div className="mb-3 mt-6">
            <Segmented<View>
              label="View"
              value={view}
              onChange={setView}
              options={[
                { value: 'today', label: 'Today', count: dueCount },
                { value: 'board', label: 'Board' },
                { value: 'list', label: 'List' },
              ]}
            />
          </div>
          {view === 'today' ? <TodayView data={data} /> : view === 'board' ? <BoardView data={data} /> : <ListView data={data} />}
          {data.rows.length === 0 ? (
            <p className="mt-4 text-center text-sm text-[var(--color-charcoal-light)]">Tap + to track the first prospect.</p>
          ) : null}
        </>
      ) : null}

      {/* Above the tab bar, inside the app column on a desktop. */}
      <div className="pointer-events-none fixed inset-x-0 z-20 mx-auto flex max-w-xl justify-end px-4" style={{ bottom: 'calc(68px + env(safe-area-inset-bottom, 0px))' }}>
        <button
          type="button"
          onClick={() => setAdding(true)}
          aria-label="New prospect"
          className="pointer-events-auto flex size-14 items-center justify-center rounded-full bg-[var(--color-teal)] text-white shadow-lg shadow-black/20 ring-2 ring-[var(--color-gold)]/60 active:bg-[var(--color-teal-dark)]"
        >
          <Plus className="size-6" aria-hidden="true" />
        </button>
      </div>
      <QuickAddSheet open={adding} onClose={() => setAdding(false)} />
    </div>
  )
}
