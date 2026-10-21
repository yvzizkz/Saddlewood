'use client'

import { useState } from 'react'

import { day, money } from '@/components/money/format'
import type { HistoryDoc, JobHistory } from '@/lib/crew/jobHistory'

// "This year" on a job's money card (0050): what Joist and Buildertrend say
// about the job, from /api/crew/projects/money. Read only. Joist invoices are
// listed, not added up (a master invoice restates the job to date), and so
// are sent estimates (a revision is sent again); paid is
// the payments dated this year, each counted once. Buildertrend hours are the
// job to date on the day they were exported.

const KIND: Record<HistoryDoc['kind'], string> = { estimate: 'Estimate', change_order: 'Change order', invoice: 'Invoice' }

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-[var(--color-cream)] px-2 py-2">
      <dt className="text-[11px] text-[var(--color-charcoal-light)]">{label}</dt>
      <dd className="truncate text-[14px] font-semibold tabular-nums text-[var(--color-charcoal)]">{value}</dd>
      {sub ? <dd className="truncate text-[11px] text-[var(--color-charcoal-light)]">{sub}</dd> : null}
    </div>
  )
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export default function HistoryBlock({ h }: { h: JobHistory & { readAt?: string } }) {
  const [open, setOpen] = useState(false)
  const j = h.joist
  const l = h.labor
  if (!j && !l) return null
  return (
    <div className="mt-3">
      <p className="text-[12px] font-medium text-[var(--color-charcoal)]">{h.year} so far · Joist and Buildertrend</p>
      <dl className="mt-2 grid grid-cols-2 gap-2 min-[420px]:grid-cols-4">
        {j ? (
          <>
            <Tile label="Paid" value={money(j.paidCents)} sub={j.payments ? `${plural(j.payments, 'payment')}${j.lastPaidOn ? `, last ${day(j.lastPaidOn)}` : ''}` : 'none this year'} />
            {/* A revised estimate is sent again, so sent estimates are counted, not added up. */}
            <Tile label="Estimates sent" value={String(j.estimates.count)} sub="revisions included" />
            <Tile label="Approved" value={money(j.approved.cents)} sub={plural(j.approved.count, 'estimate')} />
            <Tile label="Change orders" value={money(j.changeOrders.cents)} sub={plural(j.changeOrders.count, 'change order')} />
          </>
        ) : null}
        {l ? (
          <Tile
            label={l.jobToDate ? 'Crew hours, job to date' : 'Crew hours'}
            value={l.hours.toLocaleString('en-US', { maximumFractionDigits: 1 })}
            sub={`${l.source === 'buildertrend' ? 'Buildertrend' : 'App'}, ${day(l.asOf)}`}
          />
        ) : null}
      </dl>
      {j && j.docs.length ? (
        <div className="mt-2">
          <button type="button" className="text-[12px] font-medium text-[var(--color-charcoal)] underline" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? 'Hide' : 'Show'} the {plural(j.docs.length, 'Joist document')}
            {j.invoices ? ` (${plural(j.invoices, 'invoice')})` : ''}
          </button>
          {open ? (
            <ul className="mt-1 space-y-1">
              {j.docs.map((d) => (
                <li key={`${d.kind}-${d.number}-${d.date}`} className="flex justify-between gap-2 text-[13px] text-[var(--color-charcoal)]">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{d.number}</span> · {KIND[d.kind]}
                    {d.date ? `, ${day(d.date)}` : ''} · {d.status}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {money(d.totalCents)}
                    {d.kind === 'invoice' && d.paidCents !== null ? ` · ${money(d.paidCents)} paid` : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {l && l.people.length ? (
        <p className="mt-2 text-[12px] text-[var(--color-charcoal-light)]">
          Hours: {l.people.map((p) => `${p.name} ${p.hours.toLocaleString('en-US', { maximumFractionDigits: 1 })}`).join(', ')}
        </p>
      ) : null}
      {h.notes.map((n) => (
        <p key={n} className="mt-1 text-[12px] text-[var(--color-charcoal-light)]">
          {n}
        </p>
      ))}
      <p className="mt-1 text-[11px] text-[var(--color-charcoal-light)]">
        Read from Joist{j ? ` ${day(j.asOf)}` : ''}. Invoices are listed, not added: Joist master invoices restate the job to date. Not part of Billed or Paid above.
      </p>
    </div>
  )
}
