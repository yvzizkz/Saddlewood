'use client'

// An owner brings in the schedule of a job that started before the app: fill it
// from the job's tracker, or paste it from a spreadsheet, and see the totals
// before saving. See lib/billing/scheduleEntry.ts.

import { useMemo, useState } from 'react'

import { Button, Field, INPUT } from '@/components/bot/ui'
import { formatValue } from '@/lib/analytics/format'
import { parseSchedule, scheduleProblem, type ScheduleEntryLine } from '@/lib/billing/scheduleEntry'

const asText = (lines: ScheduleEntryLine[]) => lines.map((l) => [l.description, (l.amountCents / 100).toFixed(2), (l.billedCents / 100).toFixed(2)].join('\t')).join('\n')

export default function ScheduleEntry({ jobKey, tracker, onDone, onCancel }: { jobKey: string; tracker: { name: string; invoice: string; lines: ScheduleEntryLine[] } | null; onDone: () => void; onCancel: () => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const parsed = useMemo(() => parseSchedule(text), [text])
  const problem = parsed.errors[0] ?? (text.trim() ? scheduleProblem(parsed.lines) : null)
  const total = parsed.lines.reduce((a, l) => a + l.amountCents, 0)
  const billed = parsed.lines.reduce((a, l) => a + l.billedCents, 0)

  const save = async () => {
    setBusy(true)
    setErr('')
    const res = await fetch(`/api/jobs/${encodeURIComponent(jobKey)}/progress`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'schedule', lines: parsed.lines }) })
    const json = await res.json().catch(() => null)
    setBusy(false)
    if (!res.ok || !json?.ok) return setErr(json?.error ?? 'Could not save.')
    onDone()
  }

  return (
    <section aria-label="Bring in a schedule" className="rounded-2xl border border-[var(--color-stone)] bg-white p-4">
      <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">Bring in a schedule</p>
      {tracker ? (
        <div className="mb-3">
          <Button onClick={() => setText(asText(tracker.lines))}>
            Fill from {tracker.name} tracker #{tracker.invoice}
          </Button>
        </div>
      ) : null}
      <Field label="Lines" hint="One line per row: description, amount, billed to date. Paste from a spreadsheet, or split with |.">
        <textarea className={`${INPUT} min-h-48 font-mono text-sm`} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      {parsed.lines.length ? (
        <p className="mt-2 text-sm text-[var(--color-charcoal)]">
          {parsed.lines.length} lines: {formatValue('money', total)} scheduled, {formatValue('money', billed)} billed
        </p>
      ) : null}
      {problem || err ? (
        <p role="alert" className="mt-2 text-sm text-[#9a2a1f]">
          {err || problem}
        </p>
      ) : null}
      <div className="mt-3 flex gap-2">
        <Button variant="primary" busy={busy} disabled={!parsed.lines.length || !!problem} onClick={save}>
          Save the schedule
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </section>
  )
}
