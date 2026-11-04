'use client'

// The change-order register's writes: record a request (from a directive, a
// T&M ticket, the client), price it, and move it along. The CO document is
// still made and sent from Billing; this keeps the request from getting lost.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Plus } from 'lucide-react'

import { Button, Field, INPUT } from '@/components/bot/ui'

async function call(method: 'POST' | 'PATCH', body: unknown): Promise<string | null> {
  const res = await fetch('/api/change-orders', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (res.ok) return null
  return (await res.json().catch(() => null))?.error ?? 'Could not save'
}

export function RequestChangeOrder({ job }: { job: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [source, setSource] = useState('directive')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  if (!open) {
    return (
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden="true" /> Record a change
      </Button>
    )
  }
  return (
    <div className="w-full rounded-2xl border border-[var(--color-stone)] bg-white p-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="md:col-span-2">
          <Field label="What changed">
            <input className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus />
          </Field>
        </div>
        <Field label="Came from">
          <select className={INPUT} value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="directive">GC or client directive</option>
            <option value="tm">T&amp;M ticket</option>
            <option value="field">Found in the field</option>
            <option value="client">Client asked</option>
            <option value="request">Other</option>
          </select>
        </Field>
        <div className="md:col-span-3">
          <Field label="Details" hint="Where, what, who asked. It waits for a price in Tasks.">
            <input className={INPUT} value={detail} onChange={(e) => setDetail(e.target.value)} />
          </Field>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button
          variant="primary"
          busy={busy}
          onClick={async () => {
            setBusy(true)
            const e = await call('POST', { job, title, detail, source })
            setBusy(false)
            if (e) return setErr(e)
            setOpen(false)
            setTitle('')
            setDetail('')
            router.refresh()
          }}
        >
          Save
        </Button>
        <Button variant="quiet" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        {err ? <span className="text-sm text-[#9a2a1f]">{err}</span> : null}
      </div>
    </div>
  )
}

// A change order with a document moves on its own page (Price it, Send, Mark
// approved), where the email, the signature and the proof are kept; only one
// recorded by hand, with nothing to send or sign, takes these steps. "Sent" is
// not one: nothing is sent from here.
function stepsFor(status: string, hasDocument: boolean): { to: string; label: string }[] {
  if (status === 'requested') return [{ to: 'rejected', label: 'Reject' }]
  if (status === 'rejected') return [{ to: 'requested', label: 'Reopen' }]
  if ((status === 'priced' || status === 'sent') && !hasDocument) return [{ to: 'signed', label: 'Signed' }]
  return []
}

export function ChangeOrderStep({
  id,
  status,
  hasDocument,
  billHref,
  invoices,
}: {
  id: number
  status: string
  hasDocument: boolean
  /** Where a signed one is billed: the job's Money tab. */
  billHref: string
  /** The job's issued invoices, for one that already went out on its own. */
  invoices: { id: string; number: string }[]
}) {
  const router = useRouter()
  const [price, setPrice] = useState('')
  const [invoice, setInvoice] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const go = async (body: Record<string, unknown>, key: string) => {
    setBusy(key)
    const e = await call('PATCH', { id, ...body })
    setBusy(null)
    if (e) return setErr(e)
    router.refresh()
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {status === 'requested' && !hasDocument ? (
        <>
          <label className="sr-only" htmlFor={`co-price-${id}`}>
            Price
          </label>
          <input
            id={`co-price-${id}`}
            inputMode="decimal"
            placeholder="$ price"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-24 rounded-lg border border-[var(--color-stone-mid)] px-2 py-1 text-base md:text-sm"
          />
          <button
            type="button"
            disabled={!!busy || !(Number(price.replace(/[$,]/g, '')) >= 0) || !price}
            onClick={() => go({ status: 'priced', amountCents: Math.round(Number(price.replace(/[$,]/g, '')) * 100) }, 'price')}
            className="rounded-lg bg-[var(--color-teal)] px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
          >
            {busy === 'price' ? '…' : 'Price it'}
          </button>
        </>
      ) : null}
      {stepsFor(status, hasDocument).map((s) => (
        <button
          key={s.to}
          type="button"
          disabled={!!busy}
          onClick={() => go({ status: s.to }, s.to)}
          className="rounded-lg border border-[var(--color-stone-mid)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--color-cream)] disabled:opacity-50"
        >
          {busy === s.to ? '…' : s.label}
        </button>
      ))}
      {status === 'signed' ? (
        <>
          <Link href={billHref} className="rounded-lg bg-[var(--color-teal)] px-2.5 py-1 text-xs font-medium text-white">
            Bill it
          </Link>
          {invoices.length ? (
            <>
              <label className="sr-only" htmlFor={`co-invoice-${id}`}>
                Already billed on
              </label>
              <select
                id={`co-invoice-${id}`}
                value={invoice}
                onChange={(e) => setInvoice(e.target.value)}
                className="rounded-lg border border-[var(--color-stone-mid)] px-2 py-1 text-base md:text-xs"
              >
                <option value="">Already on an invoice?</option>
                {invoices.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.number}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!!busy || !invoice}
                onClick={() => go({ status: 'billed', billedDocumentId: invoice }, 'billed')}
                className="rounded-lg border border-[var(--color-stone-mid)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--color-cream)] disabled:opacity-50"
              >
                {busy === 'billed' ? '…' : 'Billed'}
              </button>
            </>
          ) : null}
        </>
      ) : null}
      {err ? <span className="text-xs text-[#9a2a1f]">{err}</span> : null}
    </div>
  )
}
