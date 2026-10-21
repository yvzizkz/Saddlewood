'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowRight, ChevronDown, ChevronRight, Lock, Paperclip } from 'lucide-react'

import { BottomSheet } from '@/components/ui/BottomSheet'
import { RequestDecideCard } from '@/components/crew/RequestCards'
import { useBot } from './BotProvider'
import DraftSheet from './DraftSheet'
import { Button, Card, Chip, Dot, Empty, INPUT, ScreenTitle, SectionTitle } from './ui'
import type { BotDraft, BotHome, BotLedgerItem } from '@/lib/bot/types'
import { LANE_INFO, LANES, type Lane } from '@/lib/owner/lanes'
import type { WaitingItem } from '@/lib/owner/waiting'
import { ACTION_LABELS, ago, canApprove, dayTime, deadlineLabel, deadlineUrgent, elapsed, firstName, greeting, healthLine, isMine, isMyLane, money, needsYouCount, personFor } from '@/lib/bot/view'

// Oversight: what is waiting on you, what the bot is doing right now, what it
// is waiting on from other people, and whether it is alive.

const PROBLEM_NAMES: Record<string, string> = {
  signin: 'Mail sign-in',
  heartbeat: 'Mail reading',
  frozen: 'Stuck job',
  claude: 'Main agent',
  agy: 'Backup agent',
  messages: 'Text messages',
  platforms: 'Joist / Buildertrend / Procore',
  requests: 'Requests from the app',
}

function DraftRow({ draft, mine, onOpen }: { draft: BotDraft; mine: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-start gap-3 px-4 py-3.5 text-left active:bg-[var(--color-cream)]"
    >
      <span className="mt-0.5 font-mono text-xs text-[var(--color-charcoal-light)]">#{draft.n}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium leading-snug text-[var(--color-charcoal)]">{draft.subject}</span>
        <span className="mt-0.5 block truncate text-[13px] text-[var(--color-charcoal-light)]">To {draft.to}</span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {draft.held ? (
            <Chip tone="bad">
              <Lock className="size-3" aria-hidden="true" /> Held for the office
            </Chip>
          ) : draft.blocked ? (
            <Chip>Inside the company</Chip>
          ) : draft.status === 'approved' && draft.sendAt ? (
            <Chip tone="ok">Sending {dayTime(draft.sendAt)}</Chip>
          ) : draft.status === 'scheduled' ? (
            <Chip tone="ok">On a timer</Chip>
          ) : mine ? (
            <Chip tone="warn">{draft.needs === 'answer' ? 'Answer first' : 'Needs your OK'}</Chip>
          ) : (
            <Chip>Waiting on Lando or Marco</Chip>
          )}
          {draft.status === 'open' && deadlineLabel(draft.deadline) ? (
            <Chip tone={deadlineUrgent(draft.deadline) ? 'bad' : undefined}>{deadlineLabel(draft.deadline)}</Chip>
          ) : null}
          {draft.attach.length ? (
            <Chip>
              <Paperclip className="size-3" aria-hidden="true" /> {draft.attach.length}
            </Chip>
          ) : null}
          <span className="text-[11px] text-[var(--color-charcoal-light)]">
            {draft.requestedBy ? `${firstName(draft.requestedBy)} · ` : ''}
            {ago(draft.created)}
          </span>
        </span>
      </span>
      <ChevronRight className="mt-1 size-4 shrink-0 text-[var(--color-charcoal-light)]" aria-hidden="true" />
    </button>
  )
}

function HealthAlert({ home }: { home: BotHome }) {
  const h = healthLine(home)
  const problems = Object.entries(home.sections.health.problems)
  if (h.tone === 'ok') return null
  const offline = !home.bridge.online
  return (
    <div
      className="mb-5 rounded-2xl border px-4 py-3.5"
      style={
        offline
          ? { borderColor: 'rgba(154,42,31,0.35)', backgroundColor: 'rgba(154,42,31,0.07)' }
          : { borderColor: 'rgba(143,108,24,0.4)', backgroundColor: 'rgba(212,175,55,0.14)' }
      }
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-[var(--color-charcoal)]">
        <AlertTriangle className="size-4" aria-hidden="true" />
        {offline
          ? home.bridge.seenAt
            ? `The bot's Mac has not checked in since ${dayTime(home.bridge.seenAt)}`
            : 'The bot has not connected to the app yet'
          : 'The bot is running, with a problem'}
      </p>
      {offline ? (
        <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-charcoal)]">
          What you see below is the last picture it sent. Requests you send in Ask wait for it; approvals are off until
          it is back. If the Mac itself is off or asleep, texts and email to the bot are waiting too.
        </p>
      ) : null}
      {problems.length ? (
        <ul className="mt-2 flex flex-col gap-1.5">
          {problems.map(([k, v]) => (
            <li key={k} className="text-[13px] leading-relaxed text-[var(--color-charcoal)]">
              <span className="font-semibold">{PROBLEM_NAMES[k] ?? k}: </span>
              {v}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function LedgerCloseSheet({ item, onClose }: { item: BotLedgerItem | null; onClose: () => void }) {
  const { act, busy } = useBot()
  const [reason, setReason] = useState('')
  if (!item) return null
  const key = `ledger:${item.id}`
  return (
    <BottomSheet isOpen narrow onClose={onClose} maxHeightDvh={80} ariaLabel="Close a waiting item">
      <div className="ph-no-capture px-5 pb-6 pt-1">
        <p role="heading" aria-level={2} className="text-lg text-[var(--color-charcoal)]" style={{ fontFamily: 'var(--font-fraunces)' }}>
          Stop tracking this?
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-charcoal)]">{item.title}</p>
        {item.detail ? <p className="mt-1 text-[13px] text-[var(--color-charcoal-light)]">{item.detail}</p> : null}
        <label className="mt-4 block text-xs font-medium text-[var(--color-charcoal)]" htmlFor="ledger-reason">
          Why (one line, kept in the record)
        </label>
        <input
          id="ledger-reason"
          className={`${INPUT} mt-1.5`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Handled by phone on Friday"
          maxLength={300}
        />
        <div className="mt-4 flex gap-2">
          <Button full onClick={onClose}>
            Keep it
          </Button>
          <Button
            variant="primary"
            full
            busy={!!busy[key]}
            disabled={reason.trim().length < 2}
            onClick={async () => {
              const res = await act({ kind: 'ledger.close', payload: { id: item.id, reason: reason.trim() } }, key)
              if (res.ok) onClose()
            }}
          >
            Close it
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}

function WaitingRow({ item }: { item: WaitingItem }) {
  return (
    <Link href={item.href} className="flex items-start gap-3 px-4 py-3.5 active:bg-[var(--color-cream)]">
      <span className="mt-1.5">
        <Dot tone={item.kind === 'signal' ? 'bad' : item.kind === 'handoff' ? 'quiet' : 'warn'} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium leading-snug text-[var(--color-charcoal)]">{item.title}</span>
        {item.detail ? (
          <span className="mt-0.5 block text-[13px] leading-snug text-[var(--color-charcoal-light)]">{item.detail}</span>
        ) : null}
      </span>
      <ChevronRight className="mt-1 size-4 shrink-0 text-[var(--color-charcoal-light)]" aria-hidden="true" />
    </Link>
  )
}

function PaymentsCard({ home }: { home: BotHome }) {
  const { act, busy } = useBot()
  const [armedPayment, setArmedPayment] = useState<number | null>(null)
  if (!home.sections.payments.length) return null
  return (
    <Card className="mt-3 divide-y divide-[var(--color-stone)]">
      {home.sections.payments.map((p) => {
        const key = `payment:${p.n}`
        const armed = armedPayment === p.n
        return (
          <div key={p.n} className="px-4 py-3.5">
            <p className="text-[15px] font-medium text-[var(--color-charcoal)]">
              {money(p.amount)} from {p.client}
            </p>
            <p className="mt-0.5 text-[13px] text-[var(--color-charcoal-light)]">
              <span className="font-mono">P{p.n}</span> · invoice{' '}
              <Link href={`/app/accounting/receivables?q=${encodeURIComponent(String(p.invoice))}`} className="underline underline-offset-2">
                {p.invoice}
              </Link>{' '}
              · {p.date}
              {p.evidence ? ` · ${p.evidence}` : ''}
            </p>
            <div className="mt-2.5 flex gap-2">
              <Button
                variant="primary"
                busy={!!busy[key]}
                disabled={!home.bridge.online}
                onClick={async () => {
                  if (!armed) {
                    setArmedPayment(p.n)
                    window.setTimeout(() => setArmedPayment((n) => (n === p.n ? null : n)), 7000)
                    return
                  }
                  setArmedPayment(null)
                  await act({ kind: 'payment.confirm', payload: { n: p.n, yes: true } }, key)
                }}
              >
                {armed ? 'Yes, record it in Joist' : 'Record in Joist'}
              </Button>
              <Button
                disabled={!!busy[key] || !home.bridge.online}
                onClick={() => act({ kind: 'payment.confirm', payload: { n: p.n, yes: false } }, key)}
              >
                Skip
              </Button>
            </div>
          </div>
        )
      })}
    </Card>
  )
}

function BidsCard({ home }: { home: BotHome }) {
  const { act, busy } = useBot()
  if (!home.sections.bids.length) return null
  return (
    <Card className="mt-3 divide-y divide-[var(--color-stone)]">
      {home.sections.bids.map((b) => {
        const key = `bid:${b.n}`
        return (
          <div key={b.n} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-medium leading-snug text-[var(--color-charcoal)]">{b.project}</p>
              <p className="mt-0.5 text-[13px] text-[var(--color-charcoal-light)]">
                Bid invite from {b.gc || 'a GC'} · {b.ageDays} {b.ageDays === 1 ? 'day' : 'days'}, no reply yet
              </p>
            </div>
            <Button busy={!!busy[key]} disabled={!home.bridge.online} onClick={() => act({ kind: 'bid.ack', payload: { n: b.n } }, key)}>
              Handled
            </Button>
          </div>
        )
      })}
    </Card>
  )
}

function ExpensesLink({ count }: { count: number }) {
  if (!count) return null
  return (
    <Link
      href="/internal/expenses"
      className="mt-3 flex items-center justify-between rounded-2xl border border-[var(--color-stone)] bg-white px-4 py-3.5 active:bg-[var(--color-cream)]"
    >
      <span className="text-[15px] text-[var(--color-charcoal)]">
        <span className="font-semibold">{count}</span> {count === 1 ? 'expense needs' : 'expenses need'} a job tag
      </span>
      <ArrowRight className="size-4 text-[var(--color-charcoal-light)]" aria-hidden="true" />
    </Link>
  )
}

/**
 * What is waiting on the other owners, one fold per person. Everyone can
 * still act on anything here; the lane only decides who is asked first.
 */
function OthersWaiting({ home }: { home: BotHome }) {
  const [open, setOpen] = useState<string | null>(null)
  if (!home.lanes) return null
  const holders = home.lanes.holders
  const byName = new Map<string, Lane[]>()
  for (const lane of LANES) {
    if (isMyLane(home, lane)) continue
    const name = holders[lane].name
    byName.set(name, [...(byName.get(name) ?? []), lane])
  }
  // A hand-off belongs to whoever gave it; everything else to its lane.
  const owners = new Set(Object.values(home.names))
  const ownerOf = (i: WaitingItem) => (i.who && owners.has(i.who) ? i.who : holders[i.lane].name)
  for (const i of home.waiting ?? []) {
    const name = ownerOf(i)
    if (!isMine(home, i) && !byName.has(name)) byName.set(name, [])
  }
  const groups = [...byName.entries()]
    .map(([name, lanes]) => {
      const items = (home.waiting ?? []).filter((i) => !isMine(home, i) && ownerOf(i) === name)
      const payments = lanes.includes('money') ? home.sections.payments.length : 0
      const bids = lanes.includes('sales') ? home.sections.bids.length : 0
      const expenses = lanes.includes('money') ? home.sections.expenses.length : 0
      return { name, lanes, items, payments, bids, expenses, count: items.length + payments + bids + (expenses ? 1 : 0) }
    })
    .filter((g) => g.count > 0)
  if (!groups.length) return null
  return (
    <div className="mt-3 flex flex-col gap-2">
      {groups.map((g) => {
        const isOpen = open === g.name
        const covering = g.lanes.filter((l) => holders[l].backup)
        return (
          <div key={g.name}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : g.name)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--color-stone)] bg-white px-4 py-3 text-left active:bg-[var(--color-cream)]"
            >
              <span className="text-[15px] text-[var(--color-charcoal)]">
                Waiting on {g.name} <span className="text-[var(--color-charcoal-light)]">· {g.count}</span>
                {covering.map((l) => (
                  <span key={l} className="block text-[12px] text-[var(--color-charcoal-light)]">
                    Covers {LANE_INFO[l].label.toLowerCase()} until {LANE_INFO[l].primary} has a seat in the app
                  </span>
                ))}
              </span>
              <ChevronDown className={`size-4 shrink-0 text-[var(--color-charcoal-light)] transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {isOpen ? (
              <div className="mt-2">
                {g.items.length ? (
                  <Card className="divide-y divide-[var(--color-stone)] overflow-hidden">
                    {g.items.map((i) => (
                      <WaitingRow key={i.key} item={i} />
                    ))}
                  </Card>
                ) : null}
                {g.payments ? <PaymentsCard home={home} /> : null}
                {g.bids ? <BidsCard home={home} /> : null}
                {g.expenses ? <ExpensesLink count={g.expenses} /> : null}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

/** Hand the field supervisor one task: it lands on their own Today, and comes back to you to check. */
function GiveTaskSheet({ to, onClose }: { to: { email: string; name: string } | null; onClose: () => void }) {
  const { refresh } = useBot()
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [due, setDue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!to) return null
  const first = firstName(to.name)
  async function give() {
    if (!to) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/crew/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'task.add', emails: [to.email], title: title.trim(), detail: detail.trim(), due }),
      })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !json.ok) {
        setError(json.error || `Could not give it (${res.status}).`)
        return
      }
      await refresh()
      onClose()
    } catch {
      setError('No connection. Try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <BottomSheet isOpen narrow onClose={onClose} maxHeightDvh={85} ariaLabel={`Give ${first} a task`}>
      <div className="ph-no-capture px-5 pb-6 pt-1">
        <p role="heading" aria-level={2} className="text-lg text-[var(--color-charcoal)]" style={{ fontFamily: 'var(--font-fraunces)' }}>
          Give {first} a task
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-charcoal-light)]">
          It goes on {first}&apos;s own list. When {first} says it is done, it comes back here for you to check.
        </p>
        <label className="mt-4 block text-xs font-medium text-[var(--color-charcoal)]" htmlFor="give-title">
          What
        </label>
        <input
          id="give-title"
          className={`${INPUT} mt-1.5`}
          value={title}
          maxLength={160}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Give the Keim Dr homeowner a date for the drywall"
        />
        <label className="mt-3 block text-xs font-medium text-[var(--color-charcoal)]" htmlFor="give-detail">
          What done looks like (optional)
        </label>
        <textarea
          id="give-detail"
          className={`${INPUT} mt-1.5 min-h-[64px] resize-y`}
          value={detail}
          maxLength={1500}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="The date, and that the client said yes to it"
        />
        <label className="mt-3 block text-xs font-medium text-[var(--color-charcoal)]" htmlFor="give-due">
          Due (optional)
        </label>
        <input id="give-due" type="date" className={`${INPUT} mt-1.5`} value={due} onChange={(e) => setDue(e.target.value)} />
        {error ? (
          <p role="alert" className="mt-3 text-[13px] text-[var(--color-error-text)]">
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex gap-2">
          <Button full onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" full busy={busy} disabled={title.trim().length < 3} onClick={give}>
            Give it to {first}
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}

export default function HomeScreen() {
  const { home, error, refresh, toast } = useBot()
  const [openDraft, setOpenDraft] = useState<number | null>(null)
  const [closing, setClosing] = useState<BotLedgerItem | null>(null)
  const [giving, setGiving] = useState<{ email: string; name: string } | null>(null)
  const [allLedger, setAllLedger] = useState(false)

  const feed = useMemo(() => {
    if (!home) return []
    const taps = home.actions
      .filter((a) => a.status !== 'queued' && a.status !== 'working')
      .map((a) => ({
        at: a.doneAt ?? a.createdAt,
        text: `${firstName(a.who)} ${ACTION_LABELS[a.kind] ?? a.kind}${a.result ? `: ${a.result}` : ''}`,
        tone: a.status === 'done' ? ('ok' as const) : ('bad' as const),
      }))
    const lines = home.sections.activity.map((x) => ({
      at: x.at,
      text: x.text,
      tone: x.kind === 'alert' ? ('bad' as const) : x.kind === 'send' || x.kind === 'money' ? ('ok' as const) : ('quiet' as const),
    }))
    return [...taps, ...lines].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 12)
  }, [home])

  if (!home) {
    return (
      <div className="px-4 pt-6">
        <ScreenTitle title="Saddlewood" />
        {error ? (
          <Empty>Could not load: {error}</Empty>
        ) : (
          <div className="flex flex-col gap-3" aria-hidden="true">
            <div className="h-24 animate-pulse rounded-2xl bg-[var(--color-cream)]" />
            <div className="h-40 animate-pulse rounded-2xl bg-[var(--color-cream)]" />
          </div>
        )}
      </div>
    )
  }

  const { me, sections } = home
  const today = new Date(home.now).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  if (!me.role) {
    return (
      <div className="px-4 pt-6">
        <ScreenTitle eyebrow={today} title="Almost there" />
        <Card className="p-4">
          <p className="text-sm leading-relaxed text-[var(--color-charcoal)]">
            You are signed in as <span className="font-semibold">{me.email}</span>, and the bot does not have a seat for
            that address yet. Ask Lando to add you; this screen updates on its own once he has.
          </p>
        </Card>
      </div>
    )
  }

  const owner = me.role === 'owner'
  const mineDrafts = sections.drafts.filter((d) => canApprove(d, me.name))
  const otherDrafts = sections.drafts.filter((d) => !canApprove(d, me.name))
  const draft = sections.drafts.find((d) => d.n === openDraft) ?? null
  const needs = needsYouCount(home)
  const myItems = (home.waiting ?? []).filter((i) => isMine(home, i))
  const myDecisions = myItems.filter((i) => i.kind === 'decision')
  const mySignals = myItems.filter((i) => i.kind === 'signal')
  const myHandoffs = myItems.filter((i) => i.kind === 'handoff')
  const supervisors = owner ? (home.crew?.supervisors ?? []) : []
  const ledger = allLedger ? sections.ledger : sections.ledger.slice(0, 4)
  const health = sections.health

  return (
    <div className="px-4 pt-6 pb-8">
      <ScreenTitle eyebrow={today} title={`${greeting(new Date(home.now))}, ${firstName(me.name)}`} />

      <HealthAlert home={home} />

      {home.crew && home.crew.people > 0 ? (
        <Link
          href="/app/crew"
          className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-[var(--color-stone)] bg-white px-4 py-3 active:bg-[var(--color-cream)]"
        >
          <span className="flex min-w-0 items-center gap-2 text-[15px] text-[var(--color-charcoal)]">
            <Dot tone={home.crew.onClock ? 'ok' : 'quiet'} />
            <span className="truncate">
              Crew: {home.crew.onClock ? `${home.crew.onClock} on the clock` : 'nobody on the clock'}
            </span>
          </span>
          {home.crew.needs ? <Chip tone="warn">{home.crew.needs} need you</Chip> : <span className="text-[13px] text-[var(--color-teal)] underline">Open</span>}
        </Link>
      ) : null}

      <SectionTitle count={needs}>Waiting on you</SectionTitle>
      {needs === 0 && !mySignals.length ? (
        <Empty>Nothing is waiting on you. When something needs your yes, or something goes wrong, it lands here.</Empty>
      ) : null}

      {myDecisions.length ? (
        <Card className="mb-3 divide-y divide-[var(--color-stone)] overflow-hidden">
          {myDecisions.map((i) =>
            i.request ? (
              <RequestDecideCard
                key={i.key}
                id={i.request.id}
                title={i.title}
                detail={i.detail}
                estCents={i.request.estCents}
                talk={i.request.talk}
                onDone={(note) => {
                  if (note) toast(note, 'ok')
                  void refresh()
                }}
              />
            ) : (
              <WaitingRow key={i.key} item={i} />
            ),
          )}
        </Card>
      ) : null}

      {mineDrafts.length ? (
        <Card className="divide-y divide-[var(--color-stone)] overflow-hidden">
          {mineDrafts.map((d) => (
            <DraftRow key={d.n} draft={d} mine onOpen={() => setOpenDraft(d.n)} />
          ))}
        </Card>
      ) : null}

      {isMyLane(home, 'money') ? <PaymentsCard home={home} /> : null}
      {isMyLane(home, 'sales') ? <BidsCard home={home} /> : null}
      {isMyLane(home, 'money') ? <ExpensesLink count={sections.expenses.length} /> : null}

      {mySignals.length ? (
        <Card className="mt-3 divide-y divide-[var(--color-stone)] overflow-hidden">
          {mySignals.map((i) => (
            <WaitingRow key={i.key} item={i} />
          ))}
        </Card>
      ) : null}

      <OthersWaiting home={home} />

      {myHandoffs.length || supervisors.length ? (
        <>
          <SectionTitle count={myHandoffs.length}>Hand-offs out</SectionTitle>
          {myHandoffs.length ? (
            <Card className="mb-2 divide-y divide-[var(--color-stone)] overflow-hidden">
              {myHandoffs.map((i) => (
                <WaitingRow key={i.key} item={i} />
              ))}
            </Card>
          ) : (
            <Empty>Nothing you gave out is open. It stays here until you check it.</Empty>
          )}
          <div className="mt-2 flex flex-col gap-2">
            {supervisors.map((s) => (
              <Button key={s.email} full onClick={() => setGiving(s)}>
                Give {firstName(s.name)} a task
              </Button>
            ))}
          </div>
        </>
      ) : null}

      {otherDrafts.length ? (
        <>
          <SectionTitle count={otherDrafts.length}>Other open drafts</SectionTitle>
          <Card className="divide-y divide-[var(--color-stone)] overflow-hidden">
            {otherDrafts.map((d) => (
              <DraftRow key={d.n} draft={d} mine={false} onOpen={() => setOpenDraft(d.n)} />
            ))}
          </Card>
        </>
      ) : null}

      <SectionTitle count={home.inFlight.length}>The bot is working on</SectionTitle>
      {home.inFlight.length ? (
        <Card className="divide-y divide-[var(--color-stone)]">
          {home.inFlight.map((m) => (
            <div key={m.id} className="px-4 py-3">
              <p className="line-clamp-2 text-[15px] leading-snug text-[var(--color-charcoal)]">{m.preview}</p>
              <p className="mt-1 flex items-center gap-1.5 text-[12px] text-[var(--color-charcoal-light)]">
                <Dot tone={m.status === 'working' ? 'ok' : 'warn'} />
                {m.mine ? 'You' : firstName(m.who)} ·{' '}
                {m.status === 'working' ? `working for ${elapsed(m.createdAt)}` : `waiting ${elapsed(m.createdAt)}`}
              </p>
            </div>
          ))}
        </Card>
      ) : (
        <Empty>
          Nothing in progress.{' '}
          <Link href="/app/ask" className="font-medium text-[var(--color-teal)] underline">
            Ask it for something
          </Link>
          .
        </Empty>
      )}

      {owner ? (
        <>
          <SectionTitle count={sections.ledger.length}>Waiting on other people</SectionTitle>
          {sections.ledger.length ? (
            <>
              <Card className="divide-y divide-[var(--color-stone)]">
                {ledger.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => setClosing(it)}
                    className="block w-full px-4 py-3 text-left active:bg-[var(--color-cream)]"
                  >
                    <span className="line-clamp-2 text-[15px] leading-snug text-[var(--color-charcoal)]">{it.title}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Chip tone={it.tier >= 2 ? 'bad' : it.tier === 1 ? 'warn' : 'quiet'}>
                        {it.tier >= 2 ? 'Overdue · ' : ''}
                        {it.ageDays} {it.ageDays === 1 ? 'day' : 'days'}
                      </Chip>
                      {it.askedOf ? (
                        <span className="text-[12px] text-[var(--color-charcoal-light)]">{personFor(it.askedOf, home.names)}</span>
                      ) : null}
                    </span>
                  </button>
                ))}
              </Card>
              {sections.ledger.length > 4 ? (
                <Button variant="quiet" full className="mt-1" onClick={() => setAllLedger((v) => !v)}>
                  {allLedger ? 'Show fewer' : `Show all ${sections.ledger.length}`}
                </Button>
              ) : null}
            </>
          ) : (
            <Empty>Nothing is waiting on anyone.</Empty>
          )}

          <SectionTitle>Recent</SectionTitle>
          {feed.length ? (
            <Card className="divide-y divide-[var(--color-stone)]">
              {feed.map((f, i) => (
                <div key={i} className="flex items-start gap-2.5 px-4 py-2.5">
                  <span className="mt-1.5">
                    <Dot tone={f.tone} />
                  </span>
                  <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-[var(--color-charcoal)]">
                    <span className="line-clamp-3">{f.text}</span>
                    <span className="text-[11px] text-[var(--color-charcoal-light)]">{dayTime(f.at)}</span>
                  </p>
                </div>
              ))}
            </Card>
          ) : (
            <Empty>No activity reported yet.</Empty>
          )}

          <div id="health" className="mt-7 scroll-mt-20">
            <SectionTitle>Bot health</SectionTitle>
            <Card className="divide-y divide-[var(--color-stone)] text-[13px]">
              <Row label="App link to the Mac" value={home.bridge.seenAt ? `checked in ${ago(home.bridge.seenAt)}` : 'never'} ok={home.bridge.online} />
              <Row label="Reading mail" value={health.mailReadAt ? `last read ${ago(health.mailReadAt)}` : 'unknown'} ok={!health.problems.signin && !health.problems.heartbeat} />
              <Row label="Reading texts" value={health.textsReadAt ? `last read ${ago(health.textsReadAt)}` : 'unknown'} ok={!health.problems.messages} />
              <Row label="Main agent (Claude)" value={health.problems.claude ? 'signed out, backup answering' : 'ready'} ok={!health.problems.claude} />
              <Row label="Automatic sending" value={health.autosend.on ? 'on' : 'off: every send needs a yes'} ok />
            </Card>
          </div>
        </>
      ) : null}

      <DraftSheet key={`draft-${draft?.n ?? 'none'}`} draft={draft} onClose={() => setOpenDraft(null)} />
      <LedgerCloseSheet key={`ledger-${closing?.id ?? 'none'}`} item={closing} onClose={() => setClosing(null)} />
      <GiveTaskSheet key={`give-${giving?.email ?? 'none'}`} to={giving} onClose={() => setGiving(null)} />
    </div>
  )
}

function Row({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="flex items-center gap-2 text-[var(--color-charcoal)]">
        <Dot tone={ok ? 'ok' : 'bad'} />
        {label}
      </span>
      <span className="text-right text-[var(--color-charcoal-light)]">{value}</span>
    </div>
  )
}
