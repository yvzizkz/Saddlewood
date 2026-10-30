'use client'

// Price it: one change order, priced and sent from a phone. Each line has a
// price box (or "No charge"); blanks left by intake ("about ______ sq ft") are
// marked until filled; the total and the client's view update as you type.
// Send saves, shows the exact email, and sends it on the second tap. Owners
// only (the page checks; the APIs check again).

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { ArrowLeft, Eye, Paperclip, Send } from 'lucide-react'

import { Button, Card, Chip, Field, INPUT, ScreenTitle } from '@/components/bot/ui'
import { DocumentView } from '@/app/d/DocumentView'
import CoTimeline from '@/components/billing/CoTimeline'
import { applyPrices, BLANK, coEmail, parseDollars, sendBlockers, type PriceEdit } from '@/lib/billing/coPrice'
import type { PriceIt } from '@/lib/billing/coPriceStore'
import { usd } from '@/lib/money'

type Line = { description: string; note: string; price: string; noCharge: boolean }

const AREA = `${INPUT} min-h-[4.5rem] resize-y`
const blankRing = (v: string) => (BLANK.test(v) ? ' border-[#d4af37] bg-[rgba(212,175,55,0.08)]' : '')

async function post(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { ok: res.ok, status: res.status, data: ((await res.json().catch(() => null)) ?? {}) as Record<string, unknown> }
}

export default function PriceItScreen({ data }: { data: PriceIt }) {
  const router = useRouter()
  const editable = data.doc.status === 'draft' && (data.status === 'requested' || data.status === 'priced')
  const [title, setTitle] = useState(data.title)
  const [lines, setLines] = useState<Line[]>(
    (data.doc.snapshot.lines ?? []).map((l) => ({
      description: l.description,
      note: l.note ?? '',
      price: l.amountCents ? (l.amountCents / 100).toFixed(2) : '',
      noCharge: !!l.noCharge,
    })),
  )
  const [note, setNote] = useState(data.doc.snapshot.note ?? '')
  const [to, setTo] = useState<string[]>(data.to)
  const [cc, setCc] = useState<string[]>([])
  const [subject, setSubject] = useState<string | null>(null)
  const [body, setBody] = useState<string | null>(null)
  // The email preview is for the draft as it was saved on the first tap. Any
  // edit after that (title, a line, a price, the note) closes it, so the second
  // tap can never send a draft that differs from what is on screen.
  const [preview, setPreview] = useState<{ key: string } | null>(null)
  const [showDoc, setShowDoc] = useState(false)
  const [busy, setBusy] = useState<'' | 'save' | 'check' | 'send' | 'reject'>('')
  const [err, setErr] = useState<string[]>([])
  const [sent, setSent] = useState(false)

  const prices = lines.map((l) => (l.noCharge ? 0 : parseDollars(l.price)))
  const badPrice = prices.findIndex((p) => p === null)
  const edit: PriceEdit = {
    title: title.trim(),
    note,
    lines: lines.map((l, i) => ({ description: l.description.trim(), note: l.note.trim(), amountCents: prices[i] ?? 0, noCharge: l.noCharge })),
  }
  const editKey = JSON.stringify(edit)
  const previewing = preview !== null && preview.key === editKey
  const snapshot = useMemo(() => applyPrices(data.doc.snapshot, edit), [data.doc.snapshot, editKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const total = (snapshot.lines ?? []).reduce((s, l) => s + l.amountCents, 0)
  const blockers = [...(badPrice >= 0 ? [`Line ${badPrice + 1}: the price is not a number.`] : []), ...sendBlockers(edit.title, snapshot)]
  const person = data.contacts.find((c) => c.email === to[0]) ?? null
  const email = coEmail({ number: data.number, title: edit.title, job: data.job, totalCents: total, to: person })
  const liveDoc = { ...data.doc, title: edit.title, snapshot, totalCents: total }

  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const toggle = (list: string[], email: string) => (list.includes(email) ? list.filter((e) => e !== email) : [...list, email])

  async function save(): Promise<boolean> {
    if (badPrice >= 0) {
      setErr([`Line ${badPrice + 1}: the price is not a number.`])
      return false
    }
    const r = await post(`/api/change-orders/${data.id}/price`, edit)
    if (!r.ok) setErr([String(r.data.error ?? 'Could not save.')])
    return r.ok
  }

  const message = () => ({ to, cc, subject: subject ?? email.subject, body: body ?? email.body })

  async function check() {
    setErr([])
    setBusy('check')
    try {
      if (!(await save())) return
      const r = await post(`/api/change-orders/${data.id}/send`, message())
      if (!r.ok) return setErr([String(r.data.error ?? 'Could not prepare it.'), ...((r.data.blockers as string[]) ?? [])])
      setPreview({ key: editKey })
    } finally {
      setBusy('')
    }
  }

  async function send() {
    if (!previewing || blockers.length > 0 || to.length === 0) return
    setErr([])
    setBusy('send')
    try {
      if (!(await save())) return
      const r = await post(`/api/change-orders/${data.id}/send`, { ...message(), confirm: true })
      if (!r.ok || r.data.sent !== true) return setErr([String(r.data.error ?? 'It did not go out.'), ...((r.data.blockers as string[]) ?? [])])
      setSent(true)
      router.refresh()
    } finally {
      setBusy('')
    }
  }

  async function reject() {
    const why = window.prompt('Why is it rejected? (kept on the change order)')
    if (!why?.trim()) return
    setBusy('reject')
    const res = await fetch('/api/change-orders', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: data.id, status: 'rejected', note: why.trim() }) })
    setBusy('')
    if (!res.ok) return setErr([((await res.json().catch(() => null))?.error as string) ?? 'Could not reject it.'])
    router.refresh()
  }

  const back = data.jobKey ? `/app/jobs/${encodeURIComponent(data.jobKey)}?tab=changes` : '/app/accounting/billing'
  const docView = (
    <DocumentView
      doc={liveDoc}
      exhibits={data.exhibits}
      href={(e) => `/d/p/${data.doc.previewToken}/x/${e.id}`}
      saveHref={(e) => `/d/p/${data.doc.previewToken}/x/${e.id}?dl=1`}
    />
  )

  return (
    <div className="w-full lg:grid lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] lg:gap-8">
      <div>
        <Link href={back} className="mb-3 inline-flex items-center gap-1 text-sm text-[var(--color-charcoal-light)]">
          <ArrowLeft className="size-4" aria-hidden="true" /> {data.job || 'Changes'}
        </Link>
        <ScreenTitle eyebrow={`${data.number} · ${data.status === 'requested' ? 'Awaiting price' : data.status}`} title={edit.title || 'Change order'}>
          <p className="mt-1 text-sm text-[var(--color-charcoal-light)]">
            Asked by {data.requestedBy || 'the client'} on {new Date(`${data.requestedOn}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
          </p>
        </ScreenTitle>

        {sent ? (
          <Card className="mb-4 p-4">
            <p className="font-medium text-[var(--color-charcoal)]">Sent to {to.join(', ')}.</p>
            <p className="mt-1 text-sm text-[var(--color-charcoal-light)]">It is on the job&apos;s Changes tab as sent. You&apos;ll see when they open it.</p>
            <Link className="mt-3 inline-block text-sm underline" href={back}>
              Back to the job
            </Link>
          </Card>
        ) : null}

        {!editable && !sent ? (
          <Card className="mb-4 p-4 text-sm text-[var(--color-charcoal-light)]">This change order is {data.status}; it is shown as the client has it.</Card>
        ) : null}

        {editable && !sent ? (
          <>
            <Field label="Title">
              <input className={INPUT + blankRing(title)} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
            </Field>

            <ol className="mt-4 space-y-3">
              {lines.map((l, i) => (
                <li key={i}>
                  <Card className="p-3">
                    <div className="flex items-start gap-3">
                      <span className="mt-2.5 text-xs font-mono text-[var(--color-charcoal-light)]">{i + 1}</span>
                      <div className="min-w-0 flex-1 space-y-2">
                        <input aria-label={`Line ${i + 1}`} className={INPUT + blankRing(l.description)} value={l.description} onChange={(e) => set(i, { description: e.target.value })} />
                        <textarea aria-label={`Line ${i + 1} detail`} className={AREA + blankRing(l.note)} value={l.note} onChange={(e) => set(i, { note: e.target.value })} />
                        {BLANK.test(l.description) || BLANK.test(l.note) ? <Chip tone="warn">Fill the blank</Chip> : null}
                        <div className="flex items-center gap-3">
                          <label className="flex-1">
                            <span className="sr-only">Line {i + 1} price</span>
                            <input
                              inputMode="decimal"
                              placeholder="$ price"
                              disabled={l.noCharge}
                              className={`${INPUT} text-right tabular-nums${!l.noCharge && !parseDollars(l.price) ? ' border-[#d4af37]' : ''}`}
                              value={l.noCharge ? '' : l.price}
                              onChange={(e) => set(i, { price: e.target.value })}
                            />
                          </label>
                          <label className="flex shrink-0 items-center gap-1.5 text-sm text-[var(--color-charcoal)]">
                            <input type="checkbox" checked={l.noCharge} onChange={(e) => set(i, { noCharge: e.target.checked })} /> No charge
                          </label>
                        </div>
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
            </ol>

            <div className="mt-4">
              <Field label="Note under the lines">
                <textarea className={AREA + blankRing(note)} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
            </div>

            {data.exhibits.length ? (
              <div className="mt-4">
                <p className="mb-1.5 text-sm font-medium text-[var(--color-charcoal)]">With it</p>
                <ul className="flex flex-wrap gap-2">
                  {data.exhibits.map((e) => (
                    <li key={e.id}>
                      <a className="inline-flex items-center gap-1 rounded-full border border-[var(--color-stone)] px-2.5 py-1 text-sm" href={`/d/p/${data.doc.previewToken}/x/${e.id}`} target="_blank" rel="noreferrer">
                        <Paperclip className="size-3.5" aria-hidden="true" /> {e.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-5 space-y-3">
              {blockers.length ? (
                <ul className="space-y-0.5 text-sm text-[#8f6c18]" data-testid="co-blockers">
                  {blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              ) : null}
              {data.contacts.length ? (
                <div>
                  <p className="mb-1 text-xs text-[var(--color-charcoal-light)]">To (tap again for Cc)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {data.contacts.map((c) => {
                      const state = to.includes(c.email) ? 'To' : cc.includes(c.email) ? 'Cc' : ''
                      return (
                        <button
                          key={c.email}
                          type="button"
                          onClick={() => {
                            setPreview(null)
                            if (state === 'To') {
                              setTo((t) => toggle(t, c.email))
                              setCc((x) => toggle(x, c.email))
                            } else if (state === 'Cc') setCc((x) => toggle(x, c.email))
                            else setTo((t) => toggle(t, c.email))
                          }}
                          className={`rounded-full border px-2.5 py-1 text-sm ${state ? 'border-[var(--color-teal)] bg-[rgba(0,95,95,0.08)]' : 'border-[var(--color-stone-mid)]'}`}
                        >
                          {state ? `${state}: ` : ''}
                          {c.name || c.email}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-[#9a2a1f]">No contact on file for this client. Add one on the client before sending.</p>
              )}

              {previewing ? (
                <div className="space-y-2" data-testid="co-email">
                  <Field label="Subject">
                    <input className={INPUT} value={subject ?? email.subject} onChange={(e) => setSubject(e.target.value)} />
                  </Field>
                  <Field label="Message" hint="The link to the change order goes under it.">
                    <textarea className={`${AREA} min-h-[9rem]`} value={body ?? email.body} onChange={(e) => setBody(e.target.value)} />
                  </Field>
                </div>
              ) : null}

              {err.length ? (
                <ul className="text-sm text-[#9a2a1f]" role="alert">
                  {err.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              ) : null}

              <Button variant="danger" busy={busy === 'reject'} disabled={!!busy} onClick={reject}>
                Reject
              </Button>
            </div>

            {/* Only the total and the main actions stay pinned, so on a phone the
                bar never covers the lines being priced. */}
            <div className="sticky bottom-16 z-10 mt-4 rounded-2xl border border-[var(--color-stone)] bg-white p-3 shadow-sm lg:bottom-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-[var(--color-charcoal-light)]">Total</span>
                <span className="text-xl font-semibold tabular-nums text-[var(--color-charcoal)]" data-testid="co-total">
                  {usd(total)}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {previewing ? (
                  <Button variant="primary" busy={busy === 'send'} disabled={!!busy || blockers.length > 0 || to.length === 0} onClick={send}>
                    <Send className="size-4" aria-hidden="true" /> Send now to {person?.name.split(' ')[0] || to[0]}
                  </Button>
                ) : (
                  <Button variant="primary" busy={busy === 'check'} disabled={!!busy || blockers.length > 0 || to.length === 0} onClick={check}>
                    <Send className="size-4" aria-hidden="true" /> Send to {person?.name.split(' ')[0] || to[0] || '…'}
                  </Button>
                )}
                <Button
                  busy={busy === 'save'}
                  disabled={!!busy}
                  onClick={async () => {
                    setErr([])
                    setBusy('save')
                    const ok = await save()
                    setBusy('')
                    if (ok) router.refresh()
                  }}
                >
                  Save
                </Button>
                <Button variant="quiet" className="lg:hidden" onClick={() => setShowDoc((v) => !v)}>
                  <Eye className="size-4" aria-hidden="true" /> {showDoc ? 'Hide' : 'As they see it'}
                </Button>
              </div>
            </div>
          </>
        ) : null}

        <section aria-label="What happened" className="mt-6">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">What happened</p>
          <CoTimeline lines={data.timeline} />
        </section>
      </div>

      <section aria-label="As the client sees it" className={`${showDoc || !editable || sent ? 'mt-6' : 'hidden'} lg:mt-0 lg:block`}>
        <div className="overflow-hidden rounded-2xl border border-[var(--color-stone)]">{docView}</div>
      </section>
    </div>
  )
}
