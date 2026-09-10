'use client'

import { Download, Mail } from 'lucide-react'

import { money2, type LineCalc, type TrackerSummary } from '@/lib/trackers/core'
import type { TrackerLine, TrackerState } from '@/lib/trackers/types'
import { DUE_RED, fmt, H2 } from './format'

export type GenerateResult = { sentTo: string[]; download: string; filename: string; invoice: { number: string; totalDue: number }; at: Date }

type Props = {
  state: TrackerState
  calcs: LineCalc[]
  s: TrackerSummary
  lines: TrackerLine[]
  busy: 'generate' | 'roll' | null
  result: GenerateResult | null
  trackerId: string
  /** The sticky bar carries the generate button on narrower screens; the side rail carries it here. */
  showGenerate: boolean
  onGenerate: () => void
  onPaid: () => void
}

export function InvoicePanel({ state, calcs, s, lines, busy, result, trackerId, showGenerate, onGenerate, onPaid }: Props) {
  const items: { name: string; kind: string; amt: number }[] = []
  lines.forEach((l, i) => {
    if (calcs[i].cp > 0) items.push({ name: l.name, kind: 'progress', amt: calcs[i].cp })
    if (calcs[i].draw > 0) items.push({ name: l.name, kind: 'draw', amt: calcs[i].draw })
  })
  const carry = s.totalDue - s.sumG
  if (Math.abs(carry) > 0.005) items.push({ name: carry > 0 ? 'Prior balance carried' : 'Credit applied', kind: '', amt: carry })
  const issued = state.invoice.status === 'issued'
  const number = state.invoice.number

  return (
    <section aria-labelledby="inv-heading" className="rounded-lg border bg-white p-4" style={{ borderColor: 'var(--color-stone)' }}>
      <p className="text-[10px] tracking-[0.14em] uppercase" style={{ color: 'var(--color-gold-accessible)' }}>
        This invoice
      </p>
      <h2 id="inv-heading" className={H2 + ' mt-0.5'} style={{ fontFamily: 'var(--font-fraunces)' }}>
        Invoice #{number || '—'}
      </h2>

      <div className="mt-3 flex flex-col gap-1.5">
        {items.length === 0 ? (
          <p className="text-sm rounded-lg border border-dashed px-3 py-3 text-center" style={{ borderColor: 'var(--color-stone-mid)', color: 'var(--color-charcoal-light)' }}>
            Nothing on this invoice yet. Bill a line above.
          </p>
        ) : (
          items.map((it, i) => (
            <div key={i} className="flex justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-[var(--color-charcoal)]">
                {it.name}
                {it.kind ? (
                  <span className="ml-1.5 text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--color-charcoal-light)' }}>
                    {it.kind}
                  </span>
                ) : null}
              </span>
              <span className="tabular-nums shrink-0">{money2(it.amt)}</span>
            </div>
          ))
        )}
      </div>

      <div className="mt-3 pt-3 border-t flex items-baseline justify-between gap-3" style={{ borderColor: 'var(--color-stone)' }}>
        <span className="text-[10px] tracking-[0.14em] uppercase" style={{ color: 'var(--color-charcoal-light)' }}>
          Total due
        </span>
        <span className="text-3xl tabular-nums" style={{ fontFamily: 'var(--font-fraunces)', color: Math.abs(s.totalDue) < 0.005 ? 'var(--color-charcoal-light)' : DUE_RED }}>
          {fmt(s.totalDue)}
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {showGenerate ? (
          <button type="button" onClick={onGenerate} disabled={busy !== null} className="w-full py-3 rounded-xl bg-[var(--color-teal)] text-[var(--color-cream)] font-semibold min-h-[48px] disabled:opacity-60 inline-flex items-center justify-center gap-2">
            <Mail className="size-4" aria-hidden="true" />
            {busy === 'generate' ? 'Building & sending…' : 'Save & generate workbook'}
          </button>
        ) : null}
        <button type="button" onClick={onPaid} disabled={busy !== null} className="w-full py-3 rounded-xl border-2 font-semibold min-h-[48px] disabled:opacity-60" style={{ borderColor: 'var(--color-stone)', color: 'var(--color-charcoal)' }}>
          Client paid {number ? `#${number}` : 'this invoice'}…
        </button>
        <a href={`/api/trackers/${trackerId}/workbook`} className="w-full py-2.5 rounded-xl text-sm font-medium min-h-[44px] inline-flex items-center justify-center gap-2" style={{ color: 'var(--color-teal)' }}>
          <Download className="size-4" aria-hidden="true" />
          Download the workbook as it stands
        </a>
      </div>

      {result ? (
        <div className="mt-3 rounded-lg px-3 py-3 text-sm" style={{ backgroundColor: 'rgba(47,107,74,0.12)', color: '#2f6b4a' }} role="status">
          <b className="font-semibold">Invoice #{result.invoice.number} generated.</b>{' '}
          {result.sentTo.length ? `Emailed to ${result.sentTo.join(', ')} with ${result.filename} attached.` : 'Not emailed.'}{' '}
          <a href={result.download} className="underline">
            Download it here
          </a>
          .
        </div>
      ) : null}

      <p className="mt-3 text-xs leading-relaxed" style={{ color: 'var(--color-charcoal-light)' }}>
        {issued
          ? `Issued${state.invoice.issuedAt ? ` ${new Date(state.invoice.issuedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''} and unchanged since. Any edit makes it a draft again; generating re-sends the workbook.`
          : 'Generating saves the numbers, marks the invoice issued, keeps a copy under history, and emails you the workbook — the same layout the owners have been receiving — to forward from your own mailbox.'}
      </p>
    </section>
  )
}
