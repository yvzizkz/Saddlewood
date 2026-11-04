'use client'

// The two writes the task list needs: hand a new task to a role (optionally a
// person, a job and a date), and close or drop a work item. Everything else
// is acted on where it lives.

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Plus } from 'lucide-react'

import { Button, Field, INPUT } from '@/components/bot/ui'
import type { CrewLang } from '@/lib/crew/types'

type Opt = { value: string; label: string }

export function NewTask({ roles, jobs, kinds, job, lang = 'en' }: { roles: Opt[]; jobs: Opt[]; kinds: Opt[]; job?: string; lang?: CrewLang }) {
  const es = lang === 'es'
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ title: '', role: 'pm', kind: 'task', job: job ?? '', dueOn: '', assignee: '', detail: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))

  if (!open) {
    return (
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden="true" /> {es ? 'Nueva tarea' : 'New task'}
      </Button>
    )
  }
  const save = async () => {
    setBusy(true)
    setErr('')
    const res = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) })
    setBusy(false)
    if (!res.ok) {
      setErr((await res.json().catch(() => null))?.error ?? (es ? 'No se pudo guardar' : 'Could not save'))
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
          <Field label={es ? 'Qué hay que hacer' : 'What needs doing'}>
            <input className={INPUT} value={f.title} onChange={set('title')} maxLength={200} autoFocus />
          </Field>
        </div>
        <Field label={es ? 'Para quién' : 'Goes to'}>
          <select className={INPUT} value={f.role} onChange={set('role')}>
            {roles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={es ? 'Tipo' : 'Kind'}>
          <select className={INPUT} value={f.kind} onChange={set('kind')}>
            {kinds.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={es ? 'Obra' : 'Job'}>
          <select className={INPUT} value={f.job} onChange={set('job')}>
            <option value="">{es ? 'Sin obra' : 'No job'}</option>
            {jobs.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={es ? 'Vence' : 'Due'} hint={es ? 'Sube un nivel 2 días después si sigue abierta.' : 'Moves up a role 2 days after this if still open.'}>
          <input type="date" className={INPUT} value={f.dueOn} onChange={set('dueOn')} />
        </Field>
        <Field label={es ? 'Persona específica' : 'A specific person'} hint={es ? 'Correo; déjalo vacío para quien ocupe el puesto.' : 'Email; leave empty for whoever holds the role.'}>
          <input className={INPUT} value={f.assignee} onChange={set('assignee')} inputMode="email" />
        </Field>
        <Field label={es ? 'Detalles' : 'Details'}>
          <input className={INPUT} value={f.detail} onChange={set('detail')} />
        </Field>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button variant="primary" busy={busy} onClick={save}>
          {es ? 'Guardar' : 'Save'}
        </Button>
        <Button variant="quiet" onClick={() => setOpen(false)}>
          {es ? 'Cancelar' : 'Cancel'}
        </Button>
        {err ? <span className="text-sm text-[#9a2a1f]">{err}</span> : null}
      </div>
    </div>
  )
}

export function CloseTask({ id, lang = 'en', noteRequired = false, canDrop = true }: { id: number; lang?: CrewLang; noteRequired?: boolean; canDrop?: boolean }) {
  const es = lang === 'es'
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [asking, setAsking] = useState<'done' | 'dropped' | null>(null)
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const act = async (status: 'done' | 'dropped') => {
    if (noteRequired && asking !== status) {
      setAsking(status)
      return
    }
    setBusy(status)
    setErr('')
    const res = await fetch('/api/tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status, ...(noteRequired ? { resolution: note } : {}) }) })
    setBusy(null)
    if (!res.ok) {
      setErr(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? (es ? 'No se pudo guardar' : 'Could not save'))
      return
    }
    setAsking(null)
    router.refresh()
  }
  if (asking) {
    return (
      <span className="flex w-full flex-wrap items-center gap-2">
        <input
          className={`${INPUT} min-w-0 flex-1`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={2000}
          autoFocus
          aria-label={es ? 'Qué se hizo' : 'What was done'}
          placeholder={es ? 'Qué se hizo' : 'What was done'}
        />
        <Button variant="primary" busy={!!busy} onClick={() => act(asking)}>
          {asking === 'done' ? (es ? 'Cerrar' : 'Close it') : es ? 'Descartar' : 'Drop it'}
        </Button>
        <Button variant="quiet" onClick={() => setAsking(null)}>
          {es ? 'Cancelar' : 'Cancel'}
        </Button>
        {err ? <span className="text-xs text-[#9a2a1f]">{err}</span> : null}
      </span>
    )
  }
  return (
    <span className="inline-flex gap-1">
      <button type="button" disabled={!!busy} onClick={() => act('done')} className="rounded-lg border border-[var(--color-stone-mid)] px-2 py-1 text-xs font-medium hover:bg-[var(--color-stone)] disabled:opacity-50">
        {busy === 'done' ? '…' : es ? 'Listo' : 'Done'}
      </button>
      {canDrop ? (
        <button type="button" disabled={!!busy} onClick={() => act('dropped')} className="rounded-lg px-2 py-1 text-xs text-[var(--color-charcoal-light)] hover:bg-[var(--color-stone)] disabled:opacity-50">
          {es ? 'Descartar' : 'Drop'}
        </button>
      ) : null}
    </span>
  )
}

/** Log a client complaint on this job. Who gets it and when it is due are the server's (complaints/store.ts). */
export function NewComplaint({ job, lang = 'en' }: { job: string; lang?: CrewLang }) {
  const es = lang === 'es'
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  if (!open) {
    return (
      <Button variant="quiet" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden="true" /> {es ? 'Registrar queja' : 'Log a complaint'}
      </Button>
    )
  }
  const save = async () => {
    setBusy(true)
    setErr('')
    const res = await fetch('/api/complaints', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job, title, detail }) })
    setBusy(false)
    if (!res.ok) {
      setErr(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? (es ? 'No se pudo guardar' : 'Could not save'))
      return
    }
    setOpen(false)
    setTitle('')
    setDetail('')
    router.refresh()
  }
  return (
    <div className="grid w-full gap-3">
      <Field label={es ? 'Qué dijo el cliente' : 'What the client said'}>
        <input className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus />
      </Field>
      <Field label={es ? 'Quién y cómo llegó' : 'Who raised it, and how'}>
        <input className={INPUT} value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={2000} />
      </Field>
      <div className="flex items-center gap-2">
        <Button variant="primary" busy={busy} onClick={save}>
          {es ? 'Registrar' : 'Log it'}
        </Button>
        <Button variant="quiet" onClick={() => setOpen(false)}>
          {es ? 'Cancelar' : 'Cancel'}
        </Button>
        {err ? <span className="text-sm text-[#9a2a1f]">{err}</span> : null}
      </div>
    </div>
  )
}

export function ApproveBill({ billId, lang = 'en' }: { billId: string; lang?: CrewLang }) {
  const es = lang === 'es'
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const approve = async () => {
    setBusy(true)
    setErr('')
    const res = await fetch('/api/accounting/payables', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_bill', billId, clearHold: 'approval' }),
    })
    setBusy(false)
    if (!res.ok) {
      setErr(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? (es ? 'No se pudo aprobar' : 'Could not approve'))
      return
    }
    router.refresh()
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      {err ? <span className="text-xs text-[#9a2a1f]">{err}</span> : null}
      <button
        type="button"
        disabled={busy}
        onClick={approve}
        className="rounded-lg bg-[var(--color-teal)] px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {busy ? '…' : es ? 'Aprobar' : 'Approve'}
      </button>
    </span>
  )
}
