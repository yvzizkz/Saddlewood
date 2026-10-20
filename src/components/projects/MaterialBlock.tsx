'use client'

import { Chip } from '@/components/bot/ui'
import { day, money } from '@/components/money/format'
import type { MaterialBlock as Material } from '@/lib/crew/purchases'

// The Material block of a job's money card (0022): the last twelve months of
// Home Depot on this field job, from /api/crew/projects/money. Read only.
// Cents come from the server; this only formats them.

const TRADE_LABEL: Record<string, string> = {
  framing: 'Framing',
  drywall: 'Drywall',
  electrical: 'Electrical',
  plumbing: 'Plumbing',
  paint: 'Paint',
  tools: 'Tools',
  rentals: 'Rentals',
  general: 'General',
}

export default function MaterialBlock({ m }: { m: Material }) {
  if (!m.trips) {
    return <p className="mt-3 text-[12px] text-[var(--color-charcoal-light)]">Material: no Home Depot trips on this job in the last 12 months.</p>
  }
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-medium text-[var(--color-charcoal)]">Material · Home Depot, last 12 months</p>
        {m.smallTrips ? (
          <Chip tone="warn">
            {m.smallTrips} small trip{m.smallTrips === 1 ? '' : 's'}
          </Chip>
        ) : null}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-2 min-[420px]:grid-cols-4">
        {(
          [
            ['Spent', money(m.spentCents)],
            ['Trips', String(m.trips)],
            ['Under $75', String(m.smallTrips)],
            ['Returns', money(m.returnsCents)],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-lg bg-[var(--color-cream)] px-2 py-2">
            <dt className="text-[11px] text-[var(--color-charcoal-light)]">{label}</dt>
            <dd className="truncate text-[14px] font-semibold tabular-nums text-[var(--color-charcoal)]">{value}</dd>
          </div>
        ))}
      </dl>
      {m.byTrade.length ? (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-[var(--color-charcoal)]">
          {m.byTrade.map((t) => (
            <li key={t.trade}>
              <span className="text-[var(--color-charcoal-light)]">{TRADE_LABEL[t.trade] ?? t.trade}</span> {money(t.cents)}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-1 text-[11px] text-[var(--color-charcoal-light)]">
        {m.lastOn ? `Last trip ${day(m.lastOn)}. ` : ''}Spent is net of returns.
      </p>
    </div>
  )
}
