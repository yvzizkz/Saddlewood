'use client'

// The Wednesday payroll run: who's on it, by hours or by amount, and the email
// to the accountant to copy. See lib/accounting/payrollRun.ts.

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import { Button, Card, Field, INPUT } from '@/components/bot/ui'
import { day } from '@/components/money/format'
import { parseRunEmail, runEmail, runProblem, runSubject, type RunLine } from '@/lib/accounting/payrollRun'
import { parseMoney } from '@/lib/trackers/core'

type Row = { name: string; kind: RunLine['kind']; hours: string; amount: string; note: string }

const toRow = (l: RunLine): Row => ({ name: l.name, kind: l.kind, hours: l.hours === null ? '' : String(l.hours), amount: l.amountCents === null ? '' : (l.amountCents / 100).toFixed(2), note: l.note })
const toLine = (r: Row): RunLine => {
  const cents = Math.round(parseMoney(r.amount) * 100)
  const hours = Number(r.hours)
  return { name: r.name.trim(), kind: r.kind, hours: r.kind === 'employee' && r.hours.trim() && Number.isFinite(hours) ? hours : null, amountCents: r.kind === 'sub' && r.amount.trim() && Number.isFinite(cents) ? cents : null, note: r.note.trim() }
}

export default function PayrollRunEditor({ payDate, initial, saved, startedFrom, signer }: { payDate: string; initial: RunLine[]; saved: boolean; startedFrom: string | null; signer: string }) {
  const router = useRouter()
  const [rows, setRows] = useState(initial.map(toRow))
  const [paste, setPaste] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(saved)
  const [copied, setCopied] = useState(false)

  const lines = useMemo(() => rows.map(toLine), [rows])
  const problem = rows.length ? runProblem(lines) : null
  const subject = runSubject(payDate)
  const body = runEmail(lines, signer)
  const edit = (i: number, change: Partial<Row>) => (setRows(rows.map((r, n) => (n === i ? { ...r, ...change } : r))), setDone(false))

  const save = async () => {
    setBusy(true)
    setErr('')
    const res = await fetch('/api/accounting/payroll-run', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payDate, lines }) })
    setBusy(false)
    if (!res.ok) return setErr((await res.json().catch(() => null))?.error ?? 'Could not save')
    setDone(true)
    router.refresh()
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

      {!rows.length ? (
        <Card className="p-4">
          <Field label="A past payroll email">
            <textarea className={`${INPUT} min-h-40 font-mono text-sm`} value={paste} onChange={(e) => setPaste(e.target.value)} />
          </Field>
          <div className="mt-2">
            <Button disabled={!paste.trim()} onClick={() => setRows(parseRunEmail(paste).map(toRow))}>
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
            <select className={INPUT} value={r.kind} onChange={(e) => edit(i, { kind: e.target.value as Row['kind'] })}>
              <option value="sub">Amount</option>
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

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setRows([...rows, { name: '', kind: 'sub', hours: '', amount: '', note: '' }])}>Add a person</Button>
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
