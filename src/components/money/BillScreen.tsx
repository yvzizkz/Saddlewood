'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'

import { Button, Card, Chip, Empty, Field, INPUT, ScreenTitle, SectionTitle, Segmented, type Tone } from '@/components/bot/ui'
import { day, money, when } from './format'

// Bill (Saddlewood-KB docs/BILLING-ISSUE-PLAN-2026-10-12.md, "The screen"):
//   Start    type Joist invoice numbers (or pick from the ones the Mac says
//            are still unsent), a first line for the email, a name for the
//            send; Prepare asks the Mac, which reads Joist and makes the
//            drafts, their exhibits and the send group.
//   Review   each document with its preview page; the email, editable; who
//            it goes to, each address marked against the two lists that must
//            agree (the client's contacts, the owner's allowlist); a test to
//            yourself; then Send, which issues the drafts and mails once.
//   After    sent, with the mail id. Money lists the issued documents.

type Recent = { id: number; number: string; client: string; totalCents: number; date: string; status: string }
type GroupRow = { id: string; name: string; createdAt: string; sentAt: string | null; emailId: string | null; numbers: string[]; totalCents: number; drafts: number }
type Start = { owner: { email: string; name: string }; online: boolean; allow: { fresh: boolean; updatedAt: string | null }; recent: Recent[]; groups: GroupRow[] }

type Exhibit = { id: string; label: string; kind: 'link' | 'file'; url: string | null; bytes: number | null; contentType: string | null }
type Doc = { id: string; number: string; kind: string; title: string; status: string; totalCents: number; previewLink: string | null; link: string | null; exhibits: Exhibit[] }
type Status = 'company' | 'ok' | 'allowed_not_contact' | 'contact_not_allowed' | 'unknown' | 'no_mirror'
type Marked = { address: string; status: Status; addCommand?: string }
type Message = { subject?: string; body?: string; to?: string[]; cc?: string[]; intro?: string; sentAt?: string; emailId?: string; updatedAt?: string }
type Group = {
  group: { id: string; name: string; clientId: string | null; createdAt: string; message: Message }
  documents: Doc[]
  recipients: { to: Marked[]; cc: Marked[] }
  contacts: string[]
  allow: { fresh: boolean; updatedAt: string | null }
}
type PrepareNote = { number: string; flags: string[] }

const NUMBER = /^[#A-Za-z0-9 ._-]+$/
const PREPARE_WAIT_MS = 150_000

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string } & T
  if (!res.ok || json.ok === false) throw new Error(json.error || `That did not work (${res.status}).`)
  return json
}

function groupNameFor(numbers: string[], now = new Date()): string {
  const first = numbers[0] ?? ''
  const prefix = first.replace(/^#/, '').split(/[-\s]/)[0].toUpperCase() || 'BILL'
  const mmdd = `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  return `${prefix}-${mmdd}`
}

const STATUS: Record<Status, { tone: Tone; text: string }> = {
  company: { tone: 'quiet', text: 'ours' },
  ok: { tone: 'ok', text: 'ready' },
  allowed_not_contact: { tone: 'warn', text: 'allowed, not a contact of this client yet' },
  contact_not_allowed: { tone: 'bad', text: 'NOT on the owner allowlist' },
  unknown: { tone: 'bad', text: 'NOT on the owner allowlist, not a contact' },
  no_mirror: { tone: 'warn', text: 'the Mac has not reported the allowlist' },
}

export default function BillScreen({ initialGroupId }: { initialGroupId: string | null }) {
  const [start, setStart] = useState<Start | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [view, setView] = useState<'start' | 'review'>(initialGroupId ? 'review' : 'start')
  const [group, setGroup] = useState<Group | null>(null)
  const [notes, setNotes] = useState<PrepareNote[]>([])

  const loadStart = useCallback(async () => {
    try {
      const s = await call<Start>('/api/billing/bill')
      setStart(s)
      setLoadError(null)
    } catch (e) {
      setLoadError((e as Error).message)
    }
  }, [])

  const openGroup = useCallback(async (id: string) => {
    const g = await call<Group>(`/api/billing/send-groups/${id}`)
    setGroup(g)
    setView('review')
  }, [])

  // The first load is a fetch, so no state is set until the answer is back.
  useEffect(() => {
    let live = true
    const run = async () => {
      await loadStart()
      if (initialGroupId && live) await openGroup(initialGroupId).catch((e) => { if (live) setLoadError((e as Error).message) })
    }
    void run()
    return () => { live = false }
  }, [loadStart, openGroup, initialGroupId])

  if (loadError && !start) {
    return (
      <>
        <ScreenTitle eyebrow="Money" title="Bill" />
        <Empty>{loadError}</Empty>
        <div className="mt-4">
          <Link href="/app/accounting/billing" className="text-sm underline text-[var(--color-charcoal)]">Back to Billing</Link>
        </div>
      </>
    )
  }

  if (view === 'review' && group) {
    return (
      <Review
        data={group}
        notes={notes}
        reload={() => openGroup(group.group.id)}
        back={() => {
          setView('start')
          setGroup(null)
          setNotes([])
          void loadStart()
        }}
      />
    )
  }

  return (
    <StartScreen
      start={start}
      onPrepared={(g, n) => {
        setNotes(n)
        setGroup(g)
        setView('review')
      }}
      onOpen={(id) => openGroup(id).catch((e) => setLoadError((e as Error).message))}
    />
  )
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

function StartScreen({ start, onPrepared, onOpen }: { start: Start | null; onPrepared: (g: Group, notes: PrepareNote[]) => void; onOpen: (id: string) => void }) {
  const [numbers, setNumbers] = useState<string[]>([])
  const [typed, setTyped] = useState('')
  const [intro, setIntro] = useState('')
  const [name, setName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const timer = useRef<number | null>(null)

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])
  useEffect(() => { if (!nameTouched) setName(numbers.length ? groupNameFor(numbers) : '') }, [numbers, nameTouched])

  function add(raw: string) {
    const parts = raw.split(/[,\s]+/).map((p) => p.trim()).filter(Boolean)
    const next = [...numbers]
    for (const p of parts) {
      if (!NUMBER.test(p) || !/\d/.test(p)) { setProblem(`"${p}" does not look like a Joist number (8009-13).`); continue }
      if (!next.includes(p) && next.length < 8) next.push(p)
    }
    setNumbers(next)
    setTyped('')
  }

  async function prepare() {
    if (!numbers.length) return setProblem('Type at least one Joist invoice number.')
    if (!name.trim()) return setProblem('Give the send a name.')
    setBusy(true)
    setProblem(null)
    setStatus('Asking the Mac…')
    try {
      const { action } = await call<{ action: { id: number } }>('/api/billing/bill', {
        method: 'POST',
        body: JSON.stringify({ numbers, group: name.trim(), intro: intro.trim(), titles: {}, notes: {} }),
      })
      const started = Date.now()
      const poll = async (): Promise<void> => {
        const { action: a } = await call<{ action: { status: string; result: string } }>(`/api/billing/bill?action=${action.id}`)
        if (a.status === 'queued' || a.status === 'working') {
          setStatus(a.status === 'working' ? 'The Mac is reading Joist and building the pages…' : 'Waiting for the Mac…')
          if (Date.now() - started > PREPARE_WAIT_MS) throw new Error('The Mac has not answered in 2½ minutes. Look under Money for the drafts, or try again.')
          await new Promise<void>((r) => { timer.current = window.setTimeout(() => r(), 2000) })
          return poll()
        }
        let parsed: { ok?: boolean; groupId?: string; error?: string; documents?: PrepareNote[]; blocked?: string[] } = {}
        try { parsed = JSON.parse(a.result) } catch { /* the Mac answered in words */ }
        if (a.status !== 'done' || !parsed.ok || !parsed.groupId) throw new Error(parsed.error || a.result || 'The Mac could not prepare it.')
        const g = await call<Group>(`/api/billing/send-groups/${parsed.groupId}`)
        onPrepared(g, (parsed.documents ?? []).filter((d) => d.flags?.length))
      }
      await poll()
    } catch (e) {
      setProblem((e as Error).message)
    } finally {
      setBusy(false)
      setStatus(null)
    }
  }

  const open = (start?.groups ?? []).filter((g) => !g.sentAt)
  const sent = (start?.groups ?? []).filter((g) => g.sentAt)

  return (
    <>
      <ScreenTitle eyebrow="Money" title="Bill">
        <p className="text-sm text-[var(--color-charcoal-light)]">Joist invoices in, the client pages and one email out.</p>
      </ScreenTitle>

      {start && !start.online ? <Empty>The Mac is not checking in right now. Prepare needs it, because only the Mac can read Joist.</Empty> : null}
      {start && !start.allow.fresh ? (
        <p className="mb-3 rounded-xl bg-[rgba(212,175,55,0.15)] px-3 py-2 text-sm text-[#8f6c18]">The Mac has not reported the owner allowlist yet. Nothing can go to an outside address until it does.</p>
      ) : null}

      <Card className="p-4 space-y-3">
        <Field label="Joist invoice numbers" hint="One or more, like 8009-13. Enter or a comma adds it.">
          <div className="flex flex-wrap gap-2 mb-2">
            {numbers.map((n) => (
              <span key={n} className="inline-flex items-center gap-1 rounded-full bg-[var(--color-cream)] border border-[var(--color-stone)] px-3 py-1 text-sm">
                {n}
                <button type="button" aria-label={`remove ${n}`} className="ml-1 text-[var(--color-charcoal-light)]" onClick={() => setNumbers(numbers.filter((x) => x !== n))}>×</button>
              </span>
            ))}
          </div>
          <input
            className={INPUT}
            inputMode="text"
            autoCapitalize="characters"
            placeholder="8009-16"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(typed) } }}
            onBlur={() => { if (typed.trim()) add(typed) }}
          />
        </Field>

        {start?.recent?.length ? (
          <div>
            <p className="text-xs font-medium text-[var(--color-charcoal)] mb-1.5">Recent in Joist, not sent yet</p>
            <div className="space-y-1.5">
              {start.recent.slice(0, 8).map((r) => {
                const on = numbers.includes(r.number)
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => (on ? setNumbers(numbers.filter((x) => x !== r.number)) : add(r.number))}
                    className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm ${on ? 'border-[var(--color-teal)] bg-[rgba(47,107,74,0.06)]' : 'border-[var(--color-stone)] bg-white'}`}
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{r.number}</span>
                      <span className="block truncate text-xs text-[var(--color-charcoal-light)]">{r.client} · {day(r.date)}</span>
                    </span>
                    <span className="tabular-nums">{money(r.totalCents)}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}

        <Field label="First line of the email" hint="Optional. After “Hello,”. The documents, their buttons and the attachments line follow on their own.">
          <textarea className={`${INPUT} min-h-20`} value={intro} onChange={(e) => setIntro(e.target.value)} placeholder="Attached are the two change orders Chris marked up, replacing 8009-12:" />
        </Field>
        <Field label="Name for this send" hint="What everyone will call it; one spelling per name.">
          <input className={INPUT} value={name} onChange={(e) => { setName(e.target.value.toUpperCase()); setNameTouched(true) }} placeholder="JURY-1019" />
        </Field>

        {problem ? <p className="whitespace-pre-wrap rounded-xl bg-[rgba(154,42,31,0.08)] px-3 py-2 text-sm text-[#9a2a1f]">{problem}</p> : null}
        <Button variant="primary" full busy={busy} disabled={!start?.online || !numbers.length} onClick={prepare} className="min-h-12">
          {status ?? 'Prepare'}
        </Button>
        <p className="text-[11px] text-[var(--color-charcoal-light)]">Nothing is sent by Prepare. It makes the drafts with their preview pages, puts the Joist PDF and the waiver on each, and writes the email for you to look at.</p>
      </Card>

      <SectionTitle count={open.length}>Prepared, not sent</SectionTitle>
      {open.length === 0 ? <Empty>Nothing is waiting.</Empty> : (
        <div className="space-y-2">
          {open.map((g) => (
            <button key={g.id} type="button" onClick={() => onOpen(g.id)} className="block w-full text-left">
              <Card className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{g.name}</p>
                    <p className="truncate text-xs text-[var(--color-charcoal-light)]">{g.numbers.join(', ')} · prepared {when(g.createdAt)}</p>
                  </div>
                  <span className="text-sm tabular-nums">{money(g.totalCents)}</span>
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}

      {sent.length ? (
        <>
          <SectionTitle>Sent from here</SectionTitle>
          <div className="space-y-2">
            {sent.map((g) => (
              <button key={g.id} type="button" onClick={() => onOpen(g.id)} className="block w-full text-left">
                <Card className="p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{g.name}</p>
                      <p className="truncate text-xs text-[var(--color-charcoal-light)]">{g.numbers.join(', ')} · sent {when(g.sentAt!)}</p>
                    </div>
                    <span className="text-sm tabular-nums">{money(g.totalCents)}</span>
                  </div>
                </Card>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </>
  )
}

// ---------------------------------------------------------------------------
// Review, and After
// ---------------------------------------------------------------------------

function Review({ data, notes, reload, back }: { data: Group; notes: PrepareNote[]; reload: () => Promise<void>; back: () => void }) {
  const m = data.group.message
  const [subject, setSubject] = useState(m.subject ?? '')
  const [body, setBody] = useState(m.body ?? '')
  const [to, setTo] = useState<string[]>(m.to ?? [])
  const [cc, setCc] = useState<string[]>(m.cc ?? [])
  const [adding, setAdding] = useState('')
  const [addTo, setAddTo] = useState<'to' | 'cc'>('cc')
  const [busy, setBusy] = useState<'save' | 'test' | 'send' | null>(null)
  const [note, setNote] = useState<{ tone: Tone; text: string } | null>(null)
  const [confirm, setConfirm] = useState(false)

  useEffect(() => {
    setSubject(m.subject ?? ''); setBody(m.body ?? ''); setTo(m.to ?? []); setCc(m.cc ?? [])
  }, [m.subject, m.body, m.to, m.cc])

  const sentAt = m.sentAt ?? null
  const total = data.documents.reduce((s, d) => s + d.totalCents, 0)
  const dirty = subject !== (m.subject ?? '') || body !== (m.body ?? '') || to.join() !== (m.to ?? []).join() || cc.join() !== (m.cc ?? []).join()
  const marked = useMemo(() => {
    const known = new Map<string, Marked>()
    for (const r of [...data.recipients.to, ...data.recipients.cc]) known.set(r.address, r)
    const mark = (a: string): Marked => known.get(a) ?? { address: a, status: a.endsWith('@saddlewoodcontracting.com') ? 'company' : (data.allow.fresh ? 'unknown' : 'no_mirror') }
    return { to: to.map(mark), cc: cc.map(mark) }
  }, [to, cc, data.recipients, data.allow.fresh])
  const blockers = [...marked.to, ...marked.cc].filter((r) => r.status !== 'ok' && r.status !== 'company')
  const files = data.documents.flatMap((d) => d.exhibits.filter((x) => x.kind === 'file'))
  const canSend = !sentAt && to.length > 0 && blockers.length === 0 && subject.trim().length > 0 && body.trim().length > 0

  async function save(): Promise<boolean> {
    if (!dirty) return true
    setBusy('save')
    try {
      await call(`/api/billing/send-groups/${data.group.id}`, { method: 'PATCH', body: JSON.stringify({ message: { subject, body, to, cc } }) })
      await reload()
      setNote({ tone: 'ok', text: 'Saved.' })
      return true
    } catch (e) {
      setNote({ tone: 'bad', text: (e as Error).message })
      return false
    } finally {
      setBusy(null)
    }
  }

  async function test() {
    if (!(await save())) return
    setBusy('test')
    try {
      const r = await call<{ to: string[] }>('/api/billing/bill/test', { method: 'POST', body: JSON.stringify({ groupId: data.group.id }) })
      setNote({ tone: 'ok', text: `Test sent to ${r.to.join(' and ')}. Nothing went to the client.` })
    } catch (e) {
      setNote({ tone: 'bad', text: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  async function send() {
    if (!(await save())) return
    setBusy('send')
    try {
      await call(`/api/billing/send-groups/${data.group.id}/send`, {
        method: 'POST',
        body: JSON.stringify({ to, cc, subject, body, attachExhibits: true, linkLabels: Object.fromEntries(data.documents.map((d) => [d.number, `View ${d.kind.replace('_', ' ')} ${d.number}`])), confirm: true }),
      })
      setConfirm(false)
      await reload()
      setNote({ tone: 'ok', text: 'Sent.' })
    } catch (e) {
      setConfirm(false)
      setNote({ tone: 'bad', text: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  function addAddress() {
    const a = adding.trim().toLowerCase()
    if (!/^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(a)) return setNote({ tone: 'bad', text: `"${adding}" is not an address.` })
    if (to.includes(a) || cc.includes(a)) return setAdding('')
    if (addTo === 'to') setTo([...to, a]); else setCc([...cc, a])
    setAdding('')
  }

  const tag = (r: Marked, remove: () => void) => {
    const s = STATUS[r.status]
    return (
      <div key={r.address} className="rounded-xl border border-[var(--color-stone)] bg-white px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-sm">{r.address}</span>
          <span className="flex items-center gap-2">
            <Chip tone={s.tone}>{s.text}</Chip>
            {!sentAt ? <button type="button" aria-label={`remove ${r.address}`} className="text-[var(--color-charcoal-light)] px-1" onClick={remove}>×</button> : null}
          </span>
        </div>
        {r.addCommand ? (
          <p className="mt-1.5 text-[11px] text-[var(--color-charcoal-light)]">
            Only an owner adds it, from the Mac:
            <code className="mt-1 block overflow-x-auto rounded bg-[var(--color-cream)] px-2 py-1 text-[11px]">{r.addCommand}</code>
          </p>
        ) : r.status === 'allowed_not_contact' ? (
          <p className="mt-1.5 text-[11px] text-[var(--color-charcoal-light)]">Add them as a contact of this client first; the site refuses an address it has no contact for.</p>
        ) : null}
      </div>
    )
  }

  return (
    <>
      <ScreenTitle eyebrow={sentAt ? 'Sent' : 'Review before sending'} title={data.group.name}>
        <p className="text-sm text-[var(--color-charcoal-light)]">
          {data.documents.length} document{data.documents.length === 1 ? '' : 's'} · {money(total)}
          {sentAt ? ` · sent ${when(sentAt)}` : ''}
        </p>
      </ScreenTitle>

      {sentAt ? (
        <Card className="p-4 mb-4">
          <p className="text-sm">This went out on {when(sentAt)}{m.emailId ? <span className="text-[var(--color-charcoal-light)]"> · mail id {m.emailId}</span> : null}.</p>
          <p className="mt-1 text-sm text-[var(--color-charcoal-light)]">The documents are issued; their viewings show under Money.</p>
          <div className="mt-3 flex gap-2">
            <Link href="/app/accounting/receivables" className="inline-flex min-h-11 items-center rounded-xl border border-[var(--color-stone-mid)] bg-white px-4 text-sm font-medium">Receivables</Link>
            <Button variant="quiet" onClick={back}>Bill another</Button>
          </div>
        </Card>
      ) : null}

      {notes.length ? (
        <div className="mb-4 space-y-1.5">
          {notes.map((n) => n.flags.map((f, i) => (
            <p key={`${n.number}-${i}`} className="rounded-xl bg-[rgba(212,175,55,0.15)] px-3 py-2 text-sm text-[#8f6c18]"><b>{n.number}:</b> {f}</p>
          )))}
        </div>
      ) : null}

      <SectionTitle>The documents</SectionTitle>
      <div className="space-y-2">
        {data.documents.map((d) => {
          const joist = d.exhibits.find((x) => x.kind === 'link' && x.url && /joistapp\.com/.test(x.url))
          return (
            <Card key={d.id} className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{d.number} <span className="font-normal text-[var(--color-charcoal-light)]">· {d.status === 'draft' ? 'draft' : d.status}</span></p>
                  <p className="text-xs text-[var(--color-charcoal-light)]">{d.title}</p>
                </div>
                <span className="text-sm tabular-nums">{money(d.totalCents)}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {d.previewLink ? <a href={d.previewLink} target="_blank" rel="noopener" className="inline-flex min-h-9 items-center rounded-lg border border-[var(--color-stone-mid)] bg-white px-3 text-xs font-medium">Open preview</a> : null}
                {d.link ? <a href={`${d.link}?copy=1`} target="_blank" rel="noopener" className="inline-flex min-h-9 items-center rounded-lg border border-[var(--color-stone-mid)] bg-white px-3 text-xs font-medium">Open the client page</a> : null}
                {joist?.url ? <a href={joist.url} target="_blank" rel="noopener" className="inline-flex min-h-9 items-center rounded-lg border border-[var(--color-stone-mid)] bg-white px-3 text-xs font-medium">Open in Joist</a> : null}
              </div>
              {d.exhibits.filter((x) => x.kind === 'file').length ? (
                <p className="mt-2 text-[11px] text-[var(--color-charcoal-light)]">
                  Attached from the page: {d.exhibits.filter((x) => x.kind === 'file').map((x) => `${x.label}${x.bytes ? ` (${Math.round(x.bytes / 1024)} KB)` : ''}`).join(', ')}
                </p>
              ) : null}
            </Card>
          )
        })}
      </div>

      <SectionTitle>The email</SectionTitle>
      <Card className="p-4 space-y-3">
        <Field label="Subject">
          <input className={INPUT} value={subject} disabled={!!sentAt} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field label="Message" hint="Leave {links} where the buttons to the pages should go.">
          <textarea className={`${INPUT} min-h-56 font-mono text-sm`} value={body} disabled={!!sentAt} onChange={(e) => setBody(e.target.value)} />
        </Field>

        <div>
          <p className="text-xs font-medium text-[var(--color-charcoal)] mb-1.5">To</p>
          <div className="space-y-1.5">{marked.to.map((r) => tag(r, () => setTo(to.filter((a) => a !== r.address))))}</div>
          {marked.to.length === 0 ? <p className="text-xs text-[#9a2a1f]">Nobody is in To.</p> : null}
        </div>
        <div>
          <p className="text-xs font-medium text-[var(--color-charcoal)] mb-1.5">Cc</p>
          <div className="space-y-1.5">{marked.cc.map((r) => tag(r, () => setCc(cc.filter((a) => a !== r.address))))}</div>
          {marked.cc.length === 0 ? <p className="text-xs text-[var(--color-charcoal-light)]">Nobody in Cc.</p> : null}
        </div>
        {!sentAt ? (
          <div className="space-y-2">
            <Segmented value={addTo} onChange={setAddTo} label="Add to" options={[{ value: 'to', label: 'Add to To' }, { value: 'cc', label: 'Add to Cc' }]} />
            <div className="flex gap-2">
              <input className={INPUT} inputMode="email" autoCapitalize="none" placeholder="name@company.com" value={adding} onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAddress() } }} />
              <Button onClick={addAddress} disabled={!adding.trim()}>Add</Button>
            </div>
            <p className="text-[11px] text-[var(--color-charcoal-light)]">An outside address has to be a contact of this client and on the owner allowlist. info@ gets the office copy on its own.</p>
          </div>
        ) : null}

        {note ? <p className="text-sm" style={{ color: note.tone === 'bad' ? '#9a2a1f' : '#2f6b4a' }}>{note.text}</p> : null}

        {!sentAt ? (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button onClick={() => void save()} busy={busy === 'save'} disabled={!dirty || !!busy}>Save</Button>
            <Button onClick={test} busy={busy === 'test'} disabled={!!busy || !subject.trim() || !body.trim()}>Send me a test</Button>
            <Button variant="primary" onClick={() => setConfirm(true)} disabled={!canSend || !!busy} className="ml-auto">Send</Button>
          </div>
        ) : null}
        {!sentAt && blockers.length ? <p className="text-[11px] text-[var(--color-charcoal-light)]">Send opens once every address is ready.</p> : null}
      </Card>

      {!sentAt ? (
        <div className="mt-4">
          <Button variant="quiet" onClick={back}>Back</Button>
        </div>
      ) : null}

      {confirm ? (
        <div role="dialog" aria-modal="true" aria-label="Send this?" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3" onClick={() => !busy && setConfirm(false)}>
          <div className="w-full max-w-xl rounded-2xl bg-white p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-medium">Send {data.group.name}?</p>
            <p className="text-sm">To: {to.join(', ')}</p>
            {cc.length ? <p className="text-sm">Cc: {cc.join(', ')}</p> : null}
            <p className="text-sm">{data.documents.map((d) => `${d.number} ${money(d.totalCents)}`).join(' · ')} · {money(total)} in all</p>
            <p className="text-sm text-[var(--color-charcoal-light)]">
              {files.length ? `${files.length} file${files.length === 1 ? '' : 's'} attached from the pages. ` : 'No files attached. '}
              The drafts are issued as the message goes; info@ gets the office copy.
            </p>
            <div className="flex gap-2">
              <Button variant="quiet" onClick={() => setConfirm(false)} disabled={busy === 'send'}>Not yet</Button>
              <Button variant="primary" full onClick={send} busy={busy === 'send'} className="min-h-12">Send now</Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
