'use client'

// One role seat: who holds it and who covers it. An owner picks a person (or
// types a name or an email) and saves; everything assigned to the role follows.

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Button, INPUT } from '@/components/bot/ui'

export default function SeatEditor({
  role,
  holder,
  backup,
  names,
}: {
  role: string
  holder: string
  backup: string
  names: string[]
}) {
  const router = useRouter()
  const [h, setH] = useState(holder)
  const [b, setB] = useState(backup)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const dirty = h !== holder || b !== backup
  const list = `seat-names-${role}`

  const save = async () => {
    setBusy(true)
    setMsg('')
    const res = await fetch('/api/roles/seats', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role, holder: h, backup: b }) })
    setBusy(false)
    if (!res.ok) {
      setMsg((await res.json().catch(() => null))?.error ?? 'Could not save')
      return
    }
    setMsg('Saved')
    router.refresh()
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <datalist id={list}>
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <label className="min-w-[8rem] flex-1 text-xs text-[var(--color-charcoal-light)]">
        Held by
        <input list={list} value={h} onChange={(e) => setH(e.target.value)} placeholder="Empty" className={`${INPUT} mt-1 md:text-sm`} />
      </label>
      <label className="min-w-[8rem] flex-1 text-xs text-[var(--color-charcoal-light)]">
        Covered by
        <input list={list} value={b} onChange={(e) => setB(e.target.value)} placeholder="The owners" className={`${INPUT} mt-1 md:text-sm`} />
      </label>
      <Button variant={dirty ? 'primary' : 'secondary'} disabled={!dirty} busy={busy} onClick={save}>
        Save
      </Button>
      {msg ? <span className="text-xs text-[var(--color-charcoal-light)]">{msg}</span> : null}
    </div>
  )
}
