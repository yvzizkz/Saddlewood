import Link from 'next/link'

import { money2, pctStr } from '@/lib/trackers/core'
import { listTrackers } from '@/lib/trackers/queries'
import type { TrackerListRow } from '@/lib/trackers/types'

// Progress payment trackers, one per residential job. Auth is enforced by the
// (portal)/internal layout.

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Trackers · Saddlewood Portal' }

export default async function TrackersPage() {
  let rows: TrackerListRow[] = []
  let loadError: string | null = null
  try {
    rows = await listTrackers()
  } catch (e) {
    loadError = (e as Error).message
  }

  return (
    <div className="px-4 pt-6 md:px-8 md:pt-10 max-w-3xl mx-auto">
      <p className="text-[11px] tracking-[0.14em] uppercase mb-2" style={{ color: 'var(--color-gold-accessible)' }}>
        Billing
      </p>
      <h1 style={{ fontFamily: 'var(--font-fraunces)' }} className="text-3xl md:text-4xl mb-3 text-[var(--color-charcoal)]">
        Progress payment trackers
      </h1>
      <p className="max-w-2xl text-[15px] leading-relaxed mb-8" style={{ color: 'var(--color-charcoal-light)' }}>
        The schedule of values for each residential job: what was quoted, what is complete, what has been paid, and what
        this invoice asks for. Bill a line, save, and the workbook the owners are used to arrives in your inbox to forward.
      </p>

      {loadError ? (
        <p className="text-sm rounded border px-4 py-3" style={{ borderColor: 'var(--color-stone)', color: 'var(--color-charcoal)' }}>
          The trackers could not load. {loadError}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--color-charcoal-light)' }}>
          No trackers yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((t) => (
            <li key={t.id}>
              <Link
                href={`/internal/trackers/${t.id}`}
                className="block rounded-lg border bg-white p-4 hover:bg-[var(--color-cream)] transition-colors"
                style={{ borderColor: 'var(--color-stone)' }}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span style={{ fontFamily: 'var(--font-fraunces)' }} className="text-xl text-[var(--color-charcoal)]">
                    {t.projectName}
                  </span>
                  <span className="text-sm tabular-nums" style={{ color: 'var(--color-charcoal-light)' }}>
                    Invoice #{t.invoiceNumber || '—'}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm tabular-nums" style={{ color: 'var(--color-charcoal-light)' }}>
                  <span>
                    <b className="font-semibold text-[var(--color-charcoal)]">{money2(t.totalDue)}</b> due this invoice
                  </span>
                  <span>{pctStr(t.percentComplete)} complete</span>
                  <span>
                    updated {new Date(t.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    {t.updatedBy ? ` · ${t.updatedBy.split('@')[0]}` : ''}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
