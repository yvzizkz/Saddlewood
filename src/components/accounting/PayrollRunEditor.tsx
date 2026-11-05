'use client'

// The Wednesday payroll run: who's on it, by hours or by amount, and the email
// to the accountant to copy. See lib/accounting/payrollRun.ts.

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import { Button, Card, Field, INPUT } from '@/components/bot/ui'
import { day } from '@/components/money/format'
import { fromClock, linkClocked, paidAs, parseRunEmail, runEmail, runProblem, runSubject, type Clocked, type PaidAs, type RunLine, type StartedLine } from '@/lib/accounting/payrollRun'
import { usd } from '@/lib/money'
import { parseMoney } from '@/lib/trackers/core'

type Row = { name: string; kind: RunLine['kind']; hours: string; amount: string; note: string; email: string; byRate: boolean; lastCents?: number | null }

const toRow = (l: StartedLine): Row => ({ name: l.name, kind: l.kind, hours: l.hours === null ? '' : String(l.hours), amount: l.amountCents === null ? '' : (l.amountCents / 100).toFixed(2), note: l.note, email: l.email ?? '', byRate: !!l.byRate, lastCents: l.lastCents })
const toLine = (r: Row): RunLine => {
  const cents = Math.round(parseMoney(r.amount) * 100)
  const hours = Number(r.hours)
  return {
    name: r.name.trim(),
    kind: r.kind,
    hours: r.kind === 'employee' && r.hours.trim() && Number.isFinite(hours) ? hours : null,
    amountCents: r.kind === 'sub' && r.amount.trim() && Number.isFinite(cents) ? cents : null,
    note: r.note.trim(),
    ...(r.email ? { email: r.email } : {}),
    ...(r.byRate && r.kind === 'sub' ? { byRate: true } : {}),
  }
}

const paidAsOf = (r: Row): PaidAs => (r.kind === 'employee' ? 'employee' : r.byRate ? 'rate' : 'sub')
/** A row's figures as a line, both of them whatever it's paid as, so switching back loses nothing. */
const figures = (r: Row): StartedLine => {
  const cents = Math.round(parseMoney(r.amount) * 100)
  const hours = Number(r.hours)
  return { ...toLine(r), hours: r.hours.trim() && Number.isFinite(hours) ? hours : null, amountCents: r.amount.trim() && Number.isFinite(cents) ? cents : null, byRate: r.byRate, ...(r.lastCents === undefined ? {} : { lastCents: r.lastCents }) }
}
/** The new figures, leaving what the person typed alone when they didn't change. */
const refilled = (r: Row, l: StartedLine): Partial<Row> => {
  const was = figures(r)
  return { kind: l.kind, byRate: !!l.byRate, lastCents: l.lastCents, ...(l.hours === was.hours ? {} : { hours: toRow(l).hours }), ...(l.amountCents === was.amountCents ? {} : { amount: toRow(l).amount }) }
}
const hoursOf = (c: Clocked) => `${Math.round(c.hours * 100) / 100} hours`

export default function PayrollRunEditor({ payDate, initial, clocked, saved, startedFrom, signer }: { payDate: string; initial: StartedLine[]; clocked: Clocked[]; saved: boolean; startedFrom: string | null; signer: string }) {
  const router = useRouter()
  const [rows, setRows] = useState(initial.map(toRow))
  const [paste, setPaste] = useState('')
  const [pasted, setPasted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(saved)
  const [copied, setCopied] = useState(false)

  const lines = useMemo(() => rows.map(toLine), [rows])
  const problem = rows.length ? runProblem(lines) : null
  const subject = runSubject(payDate)
  const body = runEmail(lines, signer)
  const { matched, unlinked } = useMemo(() => linkClocked(lines, clocked), [lines, clocked])
  // A name match keeps its link when the run is saved.
  const toSave = lines.map((l, i) => (matched[i] ? { ...l, email: matched[i].email } : l))
  const edit = (i: number, change: Partial<Row>) => (setRows(rows.map((r, n) => (n === i ? { ...r, ...change } : r))), setDone(false))

  const link = (i: number, c: Clocked) => edit(i, { email: c.email, ...refilled(rows[i], fromClock(figures(rows[i]), c, pasted)) })

  const save = async () => {
    setBusy(true)
    setErr('')
    const res = await fetch('/api/accounting/payroll-run', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payDate, lines: toSave }) })
    setBusy(false)
    if (!res.ok) return setErr((await res.json().catch(() => null))?.error ?? 'Could not save')
    setDone(true)
    router.refresh()
  }

  const startFromEmail = () => {
    setRows(parseRunEmail(paste).map(toRow))
    setPasted(true)
    setDone(false)
  }
  const addClocked = (c: Clocked) => {
    setRows([...rows, { name: c.name, kind: 'sub', hours: '', amount: c.costCents === null ? '' : (c.costCents / 100).toFixed(2), note: '', email: c.email, byRate: c.costCents !== null }])
    setDone(false)
  }

  const copy = async () => {
    await navigator.clipboard.writeText(`${subject}\n\n${body}`)
    setCopied(true)
  }

  return (
    <section aria-label="Payroll run" className="space-y-3">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-charcoal)]">Payroll for {day(payDate)}</h1>
        <p className="text-sm text-[var(--color-charcoal-light)]">{saved ? 'Saved.' : startedFrom ? `Started from ${day(startedFrom)}. Check every line before you save.` : 'The first run. Paste a past payroll email to start, or add people.'}</p>
      </div>

      {!startedFrom && !saved && !pasted ? (
        <Card className="p-4">
          <Field label="A past payroll email">
            <textarea className={`${INPUT} min-h-40 font-mono text-sm`} value={paste} onChange={(e) => setPaste(e.target.value)} />
          </Field>
          <div className="mt-2">
            <Button disabled={!paste.trim()} onClick={startFromEmail}>
              Start from this email
            </Button>
          </div>
        </Card>
      ) : null}

      {rows.map((r, i) => (
        <Card key={i} className="grid gap-2 p-3 md:grid-cols-[1fr_8rem_8rem_1fr_auto] md:items-end">
          <Field label="Name">
            <input className={INPUT} value={r.name} onChange={(e) => edit(i, { name: e.target.value })} maxLength={120} />
          </Field>
          <Field label="Paid as">
            <select className={INPUT} value={paidAsOf(r)} onChange={(e) => edit(i, refilled(r, paidAs(figures(r), e.target.value as PaidAs, matched[i], pasted)))}>
              <option value="sub">Amount</option>
              <option value="rate">Hours × rate</option>
              <option value="employee">Hours</option>
            </select>
          </Field>
          {r.kind === 'employee' ? (
            <Field label="Hours">
              <input className={INPUT} inputMode="decimal" value={r.hours} onChange={(e) => edit(i, { hours: e.target.value })} />
            </Field>
          ) : (
            <Field label="Amount">
              <input className={INPUT} inputMode="decimal" value={r.amount} onChange={(e) => edit(i, { amount: e.target.value })} />
              {r.lastCents !== undefined ? <span className="mt-1 block text-xs font-medium text-[var(--color-charcoal)]">{r.lastCents === null ? 'Blank last run' : `Was ${usd(r.lastCents)} last run`}</span> : null}
            </Field>
          )}
          <Field label="Note">
            <input className={INPUT} value={r.note} onChange={(e) => edit(i, { note: e.target.value })} maxLength={200} />
          </Field>
          <Button variant="quiet" aria-label={`Take ${r.name || 'this line'} off`} onClick={() => (setRows(rows.filter((_, n) => n !== i)), setDone(false))}>
            Remove
          </Button>
        </Card>
      ))}

      {unlinked.length ? (
        <Card className="p-4">
          <section aria-label="On the clock, not on this run">
            <p className="text-sm font-medium text-[var(--color-charcoal)]">On the clock, not on this run</p>
            <p className="mb-2 text-xs text-[var(--color-charcoal-light)]">Say who each one is on the run, or add them. The app won&apos;t guess: a second line would pay them twice.</p>
            <ul className="grid gap-2">
              {unlinked.map((c) => (
                <li key={c.email} className="flex flex-wrap items-center gap-2 text-sm text-[var(--color-charcoal)]">
                  <span className="min-w-0 flex-1">
                    {c.name}, {hoursOf(c)}
                    {c.costCents === null ? '' : `, ${usd(c.costCents)} at their rate`}
                  </span>
                  <select aria-label={`${c.name} is`} className={`${INPUT} w-auto`} value="" onChange={(e) => link(Number(e.target.value), c)}>
                    <option value="">Is on the run as…</option>
                    {rows.map((r, i) => (!r.email && !matched[i] && r.name.trim() ? <option key={i} value={i}>{r.name}</option> : null))}
                  </select>
                  <Button variant="quiet" aria-label={`Add ${c.name} to the run`} onClick={() => addClocked(c)}>
                    Add
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setRows([...rows, { name: '', kind: 'sub', hours: '', amount: '', note: '', email: '', byRate: false }])}>Add a person</Button>
        <Button variant="primary" busy={busy} disabled={!rows.length || !!problem} onClick={save}>
          Save the run
        </Button>
      </div>
      {problem || err ? (
        <p role="alert" className="text-sm text-[#9a2a1f]">
          {err || problem}
        </p>
      ) : null}

      {done && rows.length ? (
        <Card className="p-4">
          <p className="text-sm font-medium text-[var(--color-charcoal)]">{subject}</p>
          <pre aria-label="Email to the accountant" className="mt-2 whitespace-pre-wrap text-sm text-[var(--color-charcoal)]">
            {body}
          </pre>
          <div className="mt-3">
            <Button onClick={copy}>{copied ? 'Copied' : 'Copy the email'}</Button>
          </div>
        </Card>
      ) : null}
    </section>
  )
}
