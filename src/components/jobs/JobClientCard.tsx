'use client'

// Who the job is for: the client, and the contact the job deals with. An owner
// sets them here; a PM reads them. See /api/jobs/[id]/client.

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Button, Card, Field, INPUT } from '@/components/bot/ui'
import type { JobClient } from '@/lib/clients/jobClient'

const LABEL = 'text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]'
const MUTED = 'text-sm text-[var(--color-charcoal-light)]'
const KINDS = [
  { value: 'homeowner', label: 'Homeowner' },
  { value: 'gc', label: 'General contractor' },
  { value: 'other', label: 'Other' },
]
const ROLES = [
  { value: 'other', label: 'Other' },
  { value: 'principal', label: 'Principal' },
  { value: 'pm', label: 'Project manager' },
  { value: 'ap', label: 'Accounts payable' },
]

export default function JobClientCard({ job, data, canEdit }: { job: string; data: JobClient; canEdit: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [adding, setAdding] = useState(false)
  const [contactId, setContactId] = useState(data.contactId ?? '')
  const [clientId, setClientId] = useState('')
  const [newClient, setNewClient] = useState({ name: data.typedName, kind: 'homeowner' })
  const [person, setPerson] = useState({ name: '', email: '', phone: '', role: 'other' })

  const save = async (body: unknown) => {
    setBusy(true)
    setErr('')
    const res = await fetch(`/api/jobs/${encodeURIComponent(job)}/client`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setBusy(false)
    if (!res.ok) {
      setErr((await res.json().catch(() => null))?.error ?? 'Could not save')
      return
    }
    setAdding(false)
    setPerson({ name: '', email: '', phone: '', role: 'other' })
    router.refresh()
  }

  const current = data.contacts.find((c) => c.id === data.contactId)
  const reach = [data.email, data.phone].filter(Boolean).join(' · ')
  return (
    <section id="job-client" aria-label="Client and contact">
      <Card className="p-4">
        <p className={`mb-2 ${LABEL}`}>Client and contact</p>
        {data.clientId ? (
          <>
            <p className="text-sm font-medium text-[var(--color-charcoal)]">{data.client}</p>
            {current ? (
              <p className="text-sm text-[var(--color-charcoal)]">
                {current.name || current.email}
                {reach ? <span className="text-[var(--color-charcoal-light)]"> · {reach}</span> : null}
              </p>
            ) : (
              <p className={MUTED}>No contact on this job yet.</p>
            )}
          </>
        ) : (
          <p className={MUTED}>{data.typedName ? `No client record yet. The job says ${data.typedName}.` : 'No client record yet.'}</p>
        )}

        {canEdit && data.clientId ? (
          <div className="mt-3 grid gap-3">
            {data.contacts.length ? (
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-56 flex-1">
                  <Field label="Contact on this job">
                    <select className={INPUT} value={contactId} onChange={(e) => setContactId(e.target.value)}>
                      {data.contactId ? null : <option value="">Choose a contact</option>}
                      {data.contacts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {[c.name, c.email].filter(Boolean).join(' · ')}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Button busy={busy} disabled={!contactId || contactId === data.contactId} onClick={() => save({ contactId })}>
                  Use this contact
                </Button>
              </div>
            ) : null}
            {adding ? (
              <div className="grid gap-3 md:grid-cols-4">
                <Field label="Name">
                  <input className={INPUT} value={person.name} onChange={(e) => setPerson({ ...person, name: e.target.value })} maxLength={200} autoFocus />
                </Field>
                <Field label="Email">
                  <input className={INPUT} type="email" value={person.email} onChange={(e) => setPerson({ ...person, email: e.target.value })} maxLength={200} />
                </Field>
                <Field label="Phone">
                  <input className={INPUT} type="tel" value={person.phone} onChange={(e) => setPerson({ ...person, phone: e.target.value })} maxLength={40} />
                </Field>
                <Field label="Role">
                  <select className={INPUT} value={person.role} onChange={(e) => setPerson({ ...person, role: e.target.value })}>
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="flex gap-2 md:col-span-4">
                  <Button variant="primary" busy={busy} disabled={!person.name.trim() && !person.email.trim()} onClick={() => save({ newContact: person })}>
                    Save contact
                  </Button>
                  <Button onClick={() => setAdding(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div>
                <Button onClick={() => setAdding(true)}>Add a contact</Button>
              </div>
            )}
          </div>
        ) : null}

        {canEdit && !data.clientId ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="grid gap-2">
              <Field label="Client on file">
                <select className={INPUT} value={clientId} onChange={(e) => setClientId(e.target.value)}>
                  <option value="">Choose a client</option>
                  {data.clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div>
                <Button busy={busy} disabled={!clientId} onClick={() => save({ clientId })}>
                  Link this client
                </Button>
              </div>
            </div>
            <div className="grid gap-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="New client name">
                  <input className={INPUT} value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} maxLength={200} />
                </Field>
                <Field label="Kind">
                  <select className={INPUT} value={newClient.kind} onChange={(e) => setNewClient({ ...newClient, kind: e.target.value })}>
                    {KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div>
                <Button busy={busy} disabled={!newClient.name.trim()} onClick={() => save({ newClient })}>
                  Create client
                </Button>
              </div>
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
