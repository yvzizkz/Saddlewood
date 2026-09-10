'use client'

import { Download } from 'lucide-react'

import type { TrackerInvoiceSnapshot } from '@/lib/trackers/types'
import { fmt, whenIso } from './format'

type Props = { trackerId: string; invoices: TrackerInvoiceSnapshot[]; onRestore: (invoiceNumber: string) => void; busy: boolean }

/** Every generated invoice, with its workbook, and a way back to it. */
export function HistorySection({ trackerId, invoices, onRestore, busy }: Props) {
  return (
    <section aria-labelledby="hist-heading" className="rounded-lg border bg-white" style={{ borderColor: 'var(--color-stone)' }}>
      <div className="px-4 pt-4 pb-2">
        <h2 id="hist-heading" className="text-xl text-[var(--color-charcoal)]" style={{ fontFamily: 'var(--font-fraunces)' }}>
          Invoice history
        </h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--color-charcoal-light)' }}>
          Each generated tracker is kept here. Restore one to step back to exactly what it held.
        </p>
      </div>
      <div className="px-4 pb-3 flex flex-col">
        {invoices.length === 0 ? (
          <p className="text-sm py-3" style={{ color: 'var(--color-charcoal-light)' }}>
            No invoices generated from the portal yet. Trackers sent before this page existed live in the Powell Progress folder.
          </p>
        ) : (
          invoices.map((inv) => (
            <div key={inv.id} className="py-2.5 border-t flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" style={{ borderColor: 'var(--color-stone)' }}>
              <span className="tabular-nums font-medium text-[var(--color-charcoal)] w-[84px]">#{inv.invoiceNumber}</span>
              <span className="flex-1 min-w-[180px]" style={{ color: 'var(--color-charcoal-light)' }}>
                {inv.invoiceDate} · due {fmt(inv.totalDue)}
                {inv.sentTo ? ` · sent to ${inv.sentTo}` : ''} · {whenIso(inv.createdAt, true)}
                {inv.generatedBy ? ` by ${inv.generatedBy.split('@')[0]}` : ''}
              </span>
              <span className="flex items-center gap-3">
                <a href={`/api/trackers/${trackerId}/workbook?invoice=${encodeURIComponent(inv.invoiceNumber)}`} className="inline-flex items-center gap-1 underline min-h-[32px]" style={{ color: 'var(--color-teal)' }}>
                  <Download className="size-3.5" aria-hidden="true" /> Workbook
                </a>
                <button type="button" disabled={busy} onClick={() => onRestore(inv.invoiceNumber)} className="underline min-h-[32px] disabled:opacity-50" style={{ color: 'var(--color-charcoal)' }}>
                  Restore
                </button>
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
