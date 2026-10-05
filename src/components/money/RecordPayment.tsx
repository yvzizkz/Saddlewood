'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { Button, Field, INPUT } from '@/components/bot/ui'
import { money } from './format'

// Ilene's form: what came in, against which line. The site shows what it
// would record and the balance it leaves, then records on a second tap.

type Line = { index: number; description: string; amountCents: number; paidCents: number }
type Preview = { balanceBefore: number; balanceAfter: number; overpaysBy: number; line: { description: string } | null }

const METHODS = [
  ['check', 'Check'],
  ['wire', 'Wire'],
  ['ach', 'ACH'],
  ['melio', 'Melio'],
  ['zelle', 'Zelle'],
  ['card', 'Card'],
  ['other', 'Other'],
] as const

export default function RecordPayment({ documentId, lines, hasLines }: { documentId: string; lines: Line[]; hasLines: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [line, setLine] = useState<string>(hasLines && lines.length === 1 ? '0' : '')
  const [amount, setAmount] = useState('')
  const [fee, setFee] = useState('')
  const [method, setMethod] = useState<string>('check')
  const [receivedOn, setReceivedOn] = useState(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' }))
  const [reference, setReference] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const cents = (s: string) => Math.round(Number(s.replace(/[^0-9.]/g, '')) * 100)

  async function send(confirm: boolean) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          lineIndex: line === '' ? null : Number(line),
          amountCents: cents(amount),
          feeCents: fee ? cents(fee) : 0,
          method,
          receivedOn,
          reference,
          confirm,
          allowOverpayment: confirm && preview ? preview.overpaysBy > 0 : false,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Could not record')
        return
      }
      if (confirm) {
        setOpen(false)
        setPreview(null)
        setAmount('')
        setReference('')
        router.refresh()
      } else {
        setPreview(json.preview)
      }
    } catch {
      setError('No connection')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <Button variant="primary" full onClick={() => setOpen(true)}>
        Record a payment
      </Button>
    )
  }

  return (
    <div className="space-y-3 rounded-2xl border border-[var(--color-stone-mid)] bg-white p-4">
      {hasLines ? (
        <Field label="Applies to">
          <select className={INPUT} value={line} onChange={(e) => { setLine(e.target.value); setPreview(null) }}>
            <option value="">The whole document</option>
            {lines.map((l) => (
              <option key={l.index} value={String(l.index)}>
                {l.description.slice(0, 60)} · {money(l.amountCents - l.paidCents)} left
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field label="Amount received" hint="The gross amount, before any fee">
        <input className={INPUT} inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => { setAmount(e.target.value); setPreview(null) }} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="How">
          <select className={INPUT} value={method} onChange={(e) => setMethod(e.target.value)}>
            {METHODS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </Field>
        <Field label="Received on">
          <input className={INPUT} type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fee" hint="Melio's 1%, if any">
          <input className={INPUT} inputMode="decimal" placeholder="0.00" value={fee} onChange={(e) => setFee(e.target.value)} />
        </Field>
        <Field label="Their reference" hint="Check number, payment id">
          <input className={INPUT} value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
      </div>

      {preview ? (
        <div className="rounded-xl bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-charcoal)]">
          <p>
            {preview.line ? `${preview.line.description.slice(0, 50)}: ` : ''}
            balance {money(preview.balanceBefore)} → <b>{money(preview.balanceAfter)}</b>
          </p>
          {preview.overpaysBy > 0 ? <p className="mt-1 text-[#9a2a1f]">This overpays by {money(preview.overpaysBy)}. Recording it anyway marks the line overpaid.</p> : null}
        </div>
      ) : null}
      {error ? <p className="text-sm text-[#9a2a1f]">{error}</p> : null}

      <div className="flex gap-2">
        <Button variant="quiet" onClick={() => { setOpen(false); setPreview(null); setError(null) }} disabled={busy}>
          Cancel
        </Button>
        {preview ? (
          <Button variant="primary" full busy={busy} onClick={() => send(true)}>
            Record {amount ? money(cents(amount)) : ''}
          </Button>
        ) : (
          <Button variant="secondary" full busy={busy} disabled={!amount} onClick={() => send(false)}>
            Check it
          </Button>
        )}
      </div>
    </div>
  )
}
