'use client'

import { useState } from 'react'
import { Package } from 'lucide-react'

import { botApi } from '@/components/bot/BotProvider'
import { Button, Card, Chip, Field, INPUT } from '@/components/bot/ui'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { REQUEST_STATUS, dollars, requestDetail } from '@/lib/crew/requestRules'
import { ANSWERS_FIRST, SETTING_KEYS, SETTING_LABELS, type AppSettings, type SettingKey } from '@/lib/crew/settingsRules'
import { addDays, dayShort } from '@/lib/crew/time'
import { parseAmount, type CrewJob, type CrewRequest } from '@/lib/crew/types'

// Material requests (migration 0023) as the owners and the project manager
// act on them: the card with Approve / Deny / Talk to me (Home's "Waiting on
// you" and the Crew tab), the "Order placed" sheet that makes the runner's
// pickup, a request by hand, and the owners' settings under More. Every tap
// goes to /api/crew/admin; the screen that holds the card re-reads itself.

async function post(body: Record<string, unknown>): Promise<string> {
  const res = await botApi<{ ok: true; note?: string }>('/api/crew/admin', { method: 'POST', body: JSON.stringify(body) })
  return res.note ?? ''
}

/** "412" or "1,204.50" typed in dollars -> cents, or null when it is not an amount. */
export function centsFrom(text: string): number | null {
  const n = parseAmount(text)
  return n === null ? null : Math.round(n * 100)
}

function Problem({ text }: { text: string }) {
  if (!text) return null
  return (
    <p role="alert" className="mt-2 rounded-xl px-3 py-2 text-[13px]" style={{ backgroundColor: 'rgba(154,42,31,0.10)', color: '#7f1d1d' }}>
      {text}
    </p>
  )
}

/**
 * One request waiting on whoever is looking. The estimate field shows when
 * nobody has put a number on it yet: a yes needs one, a "talk to me" does not.
 */
export function RequestDecideCard({
  id,
  title,
  detail,
  estCents,
  talk,
  hint,
  onDone,
}: {
  id: number
  title: string
  detail: string
  estCents: number | null
  talk: boolean
  /** A line under the detail: "Over the PM limit", "Asked by the PM". */
  hint?: string
  onDone: (note: string) => void
}) {
  const [mode, setMode] = useState<null | 'deny' | 'talk'>(null)
  const [note, setNote] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [problem, setProblem] = useState('')
  const typed = centsFrom(amount)
  const needsAmount = estCents === null && typed === null

  async function send(decision: 'approve' | 'deny' | 'talk') {
    setBusy(decision)
    setProblem('')
    try {
      const note_ = await post({ kind: 'request.decide', id, decision, note: note.trim(), ...(estCents === null && typed !== null ? { estCents: typed } : {}) })
      onDone(note_)
    } catch (e) {
      setProblem((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="px-4 py-3.5">
      <p className="flex items-start gap-2 text-[15px] font-medium leading-snug text-[var(--color-charcoal)]">
        <Package className="mt-0.5 size-4 shrink-0 text-[var(--color-charcoal-light)]" aria-hidden="true" />
        <span className="min-w-0 flex-1">{title}</span>
      </p>
      <p className="mt-0.5 pl-6 text-[13px] leading-snug text-[var(--color-charcoal-light)]">{detail}</p>
      {talk || hint ? (
        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-6 text-[12px] text-[var(--color-charcoal-light)]">
          {talk ? <Chip tone="warn">Talk to me was answered</Chip> : null}
          {hint ? <span style={{ color: 'var(--color-gold-accessible)' }}>{hint}</span> : null}
        </p>
      ) : null}
      {estCents === null ? (
        <label className="mt-2.5 block pl-6">
          <span className="mb-1 block text-xs font-medium text-[var(--color-charcoal)]">Estimate, $ (a yes needs a number)</span>
          <input className={INPUT} inputMode="decimal" value={amount} placeholder="412" aria-label="Estimate in dollars" onChange={(e) => setAmount(e.target.value)} />
        </label>
      ) : null}
      {mode ? (
        <label className="mt-2.5 block pl-6">
          <span className="mb-1 block text-xs font-medium text-[var(--color-charcoal)]">{mode === 'deny' ? 'Why not, so they know what to do instead' : 'What to talk about (optional)'}</span>
          <input className={INPUT} value={note} maxLength={600} onChange={(e) => setNote(e.target.value)} />
        </label>
      ) : null}
      <Problem text={problem} />
      <div className="mt-2.5 flex flex-wrap gap-2 pl-6">
        {mode === null ? (
          <>
            <Button variant="primary" busy={busy === 'approve'} disabled={!!busy || needsAmount} onClick={() => send('approve')}>
              Approve{estCents !== null ? ` ${dollars(estCents)}` : typed !== null ? ` ${dollars(typed)}` : ''}
            </Button>
            <Button variant="danger" disabled={!!busy} onClick={() => setMode('deny')}>
              Deny
            </Button>
            <Button disabled={!!busy} onClick={() => setMode('talk')}>
              Talk to me
            </Button>
          </>
        ) : (
          <>
            <Button variant={mode === 'deny' ? 'danger' : 'primary'} busy={!!busy} disabled={mode === 'deny' && note.trim().length < 2} onClick={() => send(mode)}>
              {mode === 'deny' ? 'Deny it' : 'Send "talk to me"'}
            </Button>
            <Button variant="quiet" disabled={!!busy} onClick={() => setMode(null)}>
              Back
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

/** One request on a list: what, where, and where it stands. */
export function RequestLine({ r, who, action }: { r: CrewRequest; who: string; action?: React.ReactNode }) {
  const st = REQUEST_STATUS[r.status]
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="line-clamp-2 text-[15px] leading-snug text-[var(--color-charcoal)]">{requestDetail(r)}</p>
        <p className="mt-0.5 line-clamp-2 text-[12px] text-[var(--color-charcoal-light)]">
          {[
            who,
            r.jobName,
            r.status === 'asked' && r.talk ? `${r.decidedBy.split(/\s+/)[0] || 'someone'} asked to talk` : '',
            r.status === 'denied' || r.status === 'cancelled' ? [r.decidedBy.split(/\s+/)[0], r.decisionNote].filter(Boolean).join(': ') : '',
            r.status === 'ordered' || r.status === 'picked' || r.status === 'delivered' ? [r.supplier, r.orderRef ? `#${r.orderRef}` : ''].filter(Boolean).join(' ') : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <Chip tone={st.tone}>{st.label}</Chip>
        {action}
      </div>
    </div>
  )
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <BottomSheet isOpen onClose={onClose} ariaLabel={title} maxHeightDvh={92} narrow>
      <div className="ph-no-capture space-y-4 px-5 pb-6 pt-1">
        <p role="heading" aria-level={2} className="text-xl text-[var(--color-charcoal)]" style={{ fontFamily: 'var(--font-fraunces)' }}>
          {title}
        </p>
        {children}
      </div>
    </BottomSheet>
  )
}

/** The order is placed and staged for will-call: this makes the runner's pickup. */
export function RequestOrderSheet({ request, today, onClose, onDone }: { request: CrewRequest; today: string; onClose: () => void; onDone: (note: string) => void }) {
  const [supplier, setSupplier] = useState(request.supplier)
  const [store, setStore] = useState(request.store)
  const [orderRef, setOrderRef] = useState(request.orderRef)
  const [day, setDay] = useState(addDays(today, 1))
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')

  async function go() {
    if (supplier.trim().length < 2) return setProblem('Say where it is: the store or supplier.')
    setBusy(true)
    setProblem('')
    try {
      onDone(await post({ kind: 'request.order', id: request.id, supplier: supplier.trim(), store: store.trim(), orderRef: orderRef.trim(), day }))
      onClose()
    } catch (e) {
      setProblem((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title="Order placed" onClose={onClose}>
      <p className="text-[13px] leading-relaxed text-[var(--color-charcoal-light)]">
        You placed the order and it is staged for will-call. This puts it on the runner&apos;s list; they pick it up and bring it to {request.jobName || 'the job'}.
      </p>
      <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--color-charcoal)]">{requestDetail(request)}</p>
      <Field label="Supplier">
        <input className={INPUT} value={supplier} maxLength={80} placeholder="Home Depot, 35th Ave" onChange={(e) => setSupplier(e.target.value)} />
      </Field>
      <Field label="Store address (optional)" hint="Gives the runner a Directions button.">
        <input className={INPUT} value={store} maxLength={200} autoComplete="off" onChange={(e) => setStore(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Order or will-call #">
          <input className={INPUT} value={orderRef} maxLength={80} onChange={(e) => setOrderRef(e.target.value)} />
        </Field>
        <Field label="Pick up on">
          <input type="date" className={INPUT} value={day} min={today} onChange={(e) => setDay(e.target.value)} />
        </Field>
      </div>
      <Problem text={problem} />
      <Button variant="primary" full busy={busy} onClick={go} className="min-h-12">
        Ordered: put it on the runner&apos;s list for {dayShort(day)}
      </Button>
    </Sheet>
  )
}

/** A PM or an owner asks for material by hand. */
export function RequestAddSheet({ jobs, onClose, onDone }: { jobs: CrewJob[]; onClose: () => void; onDone: (note: string) => void }) {
  const active = jobs.filter((j) => j.active)
  const [jobId, setJobId] = useState(active.length === 1 ? active[0].id : '')
  const [items, setItems] = useState('')
  const [qty, setQty] = useState('')
  const [trade, setTrade] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')

  async function go() {
    if (!jobId) return setProblem('Pick the job.')
    if (items.trim().length < 2) return setProblem('Say what is needed.')
    if (amount.trim() && centsFrom(amount) === null) return setProblem('Type the estimate as a number, like 412 or 412.50.')
    setBusy(true)
    setProblem('')
    try {
      onDone(await post({ kind: 'request.add', jobId, items: items.trim(), qty: qty.trim(), trade: trade.trim(), ...(amount.trim() ? { estCents: centsFrom(amount) } : {}) }))
      onClose()
    } catch (e) {
      setProblem((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title="Ask for material" onClose={onClose}>
      <Field label="For which job">
        <select className={INPUT} value={jobId} onChange={(e) => setJobId(e.target.value)}>
          {!jobId ? <option value="">Choose a job</option> : null}
          {active.map((j) => (
            <option key={j.id} value={j.id}>
              {j.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="What is needed">
        <textarea className={`${INPUT} min-h-[72px] resize-y`} value={items} maxLength={1500} placeholder="20 sheets 5/8 OSB, 2 boxes 3 in. screws" onChange={(e) => setItems(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="How much (optional)">
          <input className={INPUT} value={qty} maxLength={120} placeholder="20 sheets" onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field label="Estimate, $ (optional)">
          <input className={INPUT} inputMode="decimal" value={amount} placeholder="412" onChange={(e) => setAmount(e.target.value)} />
        </Field>
      </div>
      <Field label="Trade (optional)">
        <input className={INPUT} value={trade} maxLength={60} placeholder="Framing" onChange={(e) => setTrade(e.target.value)} />
      </Field>
      <Problem text={problem} />
      <Button variant="primary" full busy={busy} onClick={go} className="min-h-12">
        Ask
      </Button>
    </Sheet>
  )
}

const CENTS_KEYS: SettingKey[] = ['requests.pmLimitCents', 'requests.ownerLimitCents']

/** The owners' settings, one row each, saved one at a time. */
export function FieldSettingsCard({ settings, onSaved }: { settings: AppSettings; onSaved: (note: string) => void }) {
  const shown = (key: SettingKey): string => {
    const v = settings[key]
    return CENTS_KEYS.includes(key) ? String((v as number) / 100) : String(v)
  }
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(SETTING_KEYS.map((k) => [k, shown(k)])))
  const [busy, setBusy] = useState<string | null>(null)
  const [problem, setProblem] = useState('')

  async function save(key: SettingKey) {
    const raw = draft[key] ?? ''
    let value: number | string
    if (key === 'requests.answersFirst') value = raw
    else if (CENTS_KEYS.includes(key)) {
      const cents = centsFrom(raw)
      if (cents === null) return setProblem('Type a dollar amount, like 500.')
      value = cents
    } else {
      const n = Number(raw)
      if (!Number.isInteger(n)) return setProblem('Type a whole number of meters.')
      value = n
    }
    setBusy(key)
    setProblem('')
    try {
      onSaved(await post({ kind: 'settings.set', key, value }))
    } catch (e) {
      setProblem((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="divide-y divide-[var(--color-stone)]">
      {SETTING_KEYS.map((key) => {
        const changed = (draft[key] ?? '') !== shown(key)
        return (
          <div key={key} className="px-4 py-3.5">
            <label className="block">
              <span className="block text-[15px] text-[var(--color-charcoal)]">{SETTING_LABELS[key].label}</span>
              <span className="mt-0.5 block text-[12px] leading-snug text-[var(--color-charcoal-light)]">{SETTING_LABELS[key].hint}</span>
              <span className="mt-2 flex gap-2">
                {key === 'requests.answersFirst' ? (
                  <select className={INPUT} value={draft[key]} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}>
                    {ANSWERS_FIRST.map((v) => (
                      <option key={v} value={v}>
                        {v === 'either' ? 'Either owner (both are told)' : v === 'marco' ? 'Marco' : 'Lando'}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={INPUT}
                    inputMode="decimal"
                    value={draft[key]}
                    aria-label={SETTING_LABELS[key].label}
                    onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                  />
                )}
                <Button variant="primary" busy={busy === key} disabled={!changed || !!busy} onClick={() => save(key)}>
                  Save
                </Button>
              </span>
            </label>
          </div>
        )
      })}
      <Problem text={problem} />
    </Card>
  )
}
