'use client'

// The two writes the task list needs: hand a new task to a role (optionally a
// person, a job and a date), and close or drop a work item. Everything else
// is acted on where it lives.

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Plus } from 'lucide-react'

import { Button, Field, INPUT } from '@/components/bot/ui'

type Opt = { value: string; label: string }

export function NewTask({ roles, jobs, kinds, job }: { roles: Opt[]; jobs: Opt[]; kinds: Opt[]; job?: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ title: '', role: 'pm', kind: 'task', job: job ?? '', dueOn: '', assignee: '', detail: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))

  if (!open) {
    return (
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden="true" /> New task
      </Button>
    )
  }
  const save = async () => {
    setBusy(true)
    setErr('')
    const res = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) })
    setBusy(false)
    if (!res.ok) {
      setErr((await res.json().catch(() => null))?.error ?? 'Could not save')
      return
    }
    setOpen(false)
    setF((x) => ({ ...x, title: '', detail: '', dueOn: '', assignee: '' }))
    router.refresh()
  }
  return (
    <div className="w-full rounded-2xl border border-[var(--color-stone)] bg-white p-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="md:col-span-3">
          <Field label="What needs doing">
            <input className={INPUT} value={f.title} onChange={set('title')} maxLength={200} autoFocus />
          </Field>
        </div>
        <Field label="Goes to">
          <select className={INPUT} value={f.role} onChange={set('role')}>
            {roles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Kind">
          <select className={INPUT} value={f.kind} onChange={set('kind')}>
            {kinds.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Job">
          <select className={INPUT} value={f.job} onChange={set('job')}>
            <option value="">No job</option>
            {jobs.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Due" hint="Moves up a role 2 days after this if still open.">
          <input type="date" className={INPUT} value={f.dueOn} onChange={set('dueOn')} />
        </Field>
        <Field label="A specific person" hint="Email; leave empty for whoever holds the role.">
          <input className={INPUT} value={f.assignee} onChange={set('assignee')} inputMode="email" />
        </Field>
        <Field label="Details">
          <input className={INPUT} value={f.detail} onChange={set('detail')} />
        </Field>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button variant="primary" busy={busy} onClick={save}>
          Save
        </Button>
        <Button variant="quiet" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        {err ? <span className="text-sm text-[#9a2a1f]">{err}</span> : null}
      </div>
    </div>
  )
}

export function CloseTask({ id }: { id: number }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const act = async (status: 'done' | 'dropped') => {
    setBusy(status)
    await fetch('/api/tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) })
    setBusy(null)
    router.refresh()
  }
  return (
    <span className="inline-flex gap-1">
      <button type="button" disabled={!!busy} onClick={() => act('done')} className="rounded-lg border border-[var(--color-stone-mid)] px-2 py-1 text-xs font-medium hover:bg-[var(--color-cream)] disabled:opacity-50">
        {busy === 'done' ? '…' : 'Done'}
      </button>
      <button type="button" disabled={!!busy} onClick={() => act('dropped')} className="rounded-lg px-2 py-1 text-xs text-[var(--color-charcoal-light)] hover:bg-[var(--color-cream)] disabled:opacity-50">
        Drop
      </button>
    </span>
  )
}
