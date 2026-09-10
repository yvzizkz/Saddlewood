'use client'

import type { TrackerState } from '@/lib/trackers/types'

type Props = {
  trackerId: string
  project: TrackerState['project']
  pending: string[]
  onProject: (patch: Partial<TrackerState['project']>) => void
  onPending: (list: string[]) => void
}

const fieldClass = 'w-full rounded-lg border px-3 py-2 bg-white text-sm text-[var(--color-charcoal)] outline-none focus:border-[var(--color-teal)]'

/** Names on the workbook, pending change orders for the notes, and the data export. */
export function ProjectSection({ trackerId, project, pending, onProject, onPending }: Props) {
  return (
    <details className="rounded-lg border bg-white" style={{ borderColor: 'var(--color-stone)' }}>
      <summary className="px-4 py-4 cursor-pointer list-none">
        <h2 className="text-xl text-[var(--color-charcoal)]" style={{ fontFamily: 'var(--font-fraunces)' }}>
          Project details, pending change orders &amp; data
        </h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--color-charcoal-light)' }}>
          Names on the workbook, change orders awaiting approval (listed in the notes), and the raw data.
        </p>
      </summary>
      <div className="px-4 pb-4 grid gap-3 md:grid-cols-2">
        {(
          [
            ['name', 'Project'],
            ['contractor', 'Contractor'],
            ['owners', 'Owners'],
            ['address', 'Address'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex flex-col gap-1 text-xs uppercase tracking-wide" style={{ color: 'var(--color-charcoal-light)' }}>
            {label}
            <input className={fieldClass} style={{ borderColor: 'var(--color-stone)' }} value={project[key] ?? ''} onChange={(e) => onProject({ [key]: e.target.value })} maxLength={200} />
          </label>
        ))}
        <label className="md:col-span-2 flex flex-col gap-1 text-xs uppercase tracking-wide" style={{ color: 'var(--color-charcoal-light)' }}>
          Pending change orders (not yet approved, one per line)
          <textarea
            className={fieldClass + ' min-h-[90px]'}
            style={{ borderColor: 'var(--color-stone)' }}
            value={pending.join('\n')}
            onChange={(e) =>
              onPending(
                e.target.value
                  .split('\n')
                  .map((x) => x.trim())
                  .filter(Boolean),
              )
            }
          />
        </label>
        <p className="md:col-span-2 text-xs" style={{ color: 'var(--color-charcoal-light)' }}>
          <a href={`/api/trackers/${trackerId}`} className="underline" style={{ color: 'var(--color-teal)' }}>
            Export the data (JSON)
          </a>{' '}
          — the same shape build_tracker.py reads in the Powell Progress folder.
        </p>
      </div>
    </details>
  )
}
