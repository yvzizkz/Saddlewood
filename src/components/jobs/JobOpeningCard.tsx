'use client'

// What a job carried in from before the app. Everyone who sees the job's money
// reads the line; an owner sets the contract and the figure here. See
// /api/jobs/[id]/opening and lib/billing/jobOpening.ts.

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Button, Card, Field, INPUT } from '@/components/bot/ui'
import { day, money } from '@/components/money/format'
import type { JobOpening } from '@/lib/billing/jobOpening'
import { parseMoney } from '@/lib/trackers/core'

const dollars = (cents: number | null | undefined) => (cents ? (cents / 100).toFixed(2) : '')
const toCents = (text: string) => Math.round(parseMoney(text) * 100)

export default function JobOpeningCard({ job, opening, contractCents, canEdit }: { job: string; opening: JobOpening | null; contractCents: number | null; canEdit: boolean }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [form, setForm] = useState({ contract: dollars(contractCents), settled: dollars(opening?.settledCents), asOf: opening?.asOf ?? '', source: opening?.source ?? '' })

  const line = opening?.settledCents ? (
    <p className="text-sm text-[var(--color-charcoal)]">
      Includes {money(opening.settledCents)} billed and paid before the app, through {day(opening.asOf)} ({opening.source}).
    </p>
  ) : null
  if (!canEdit && !line) return null

  const save = async () => {
    const settledCents = toCents(form.settled)
    const contractCents = form.contract.trim() ? toCents(form.contract) : null
    if (Number.isNaN(settledCents) || (contractCents !== null && Number.isNaN(contractCents)) || settledCents < 0 || (contractCents ?? 0) < 0) {
      setErr('Check the amounts.')
      return
    }
    setBusy(true)
    setErr('')
    const res = await fetch(`/api/jobs/${encodeURIComponent(job)}/opening`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contractCents, settledCents, asOf: form.asOf, source: form.source }) })
    setBusy(false)
    if (!res.ok) {
      setErr((await res.json().catch(() => null))?.error ?? 'Could not save')
      return
    }
    setEditing(false)
    router.refresh()
  }

  return (
    <section aria-label="Before the app">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {line ?? <p className="text-sm text-[var(--color-charcoal-light)]">Bring in this job&apos;s contract and what was billed and paid before the app.</p>}
          {canEdit && !editing ? <Button onClick={() => setEditing(true)}>{opening ? 'Change' : 'Enter it'}</Button> : null}
        </div>
        {editing ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Field label="Contract, with change orders">
              <input className={INPUT} inputMode="decimal" value={form.contract} onChange={(e) => setForm({ ...form, contract: e.target.value })} />
            </Field>
            <Field label="Billed and paid in full before the app" hint="Leave out anything still owed: that comes in as its own bill.">
              <input className={INPUT} inputMode="decimal" value={form.settled} onChange={(e) => setForm({ ...form, settled: e.target.value })} />
            </Field>
            <Field label="Through">
              <input className={INPUT} type="date" value={form.asOf} onChange={(e) => setForm({ ...form, asOf: e.target.value })} />
            </Field>
            <Field label="Where the figure came from">
              <input className={INPUT} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} maxLength={200} placeholder="Powell tracker #3526-12" />
            </Field>
            <div className="flex gap-2 md:col-span-2">
              <Button variant="primary" busy={busy} disabled={!form.asOf || !form.source.trim()} onClick={save}>
                Save
              </Button>
              <Button variant="quiet" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
        {err ? (
          <p role="alert" className="mt-2 text-sm text-[#9a2a1f]">
            {err}
          </p>
        ) : null}
      </Card>
    </section>
  )
}
