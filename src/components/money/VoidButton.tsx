'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { Button, Field, INPUT } from '@/components/bot/ui'

// Void a payment recorded in error, or an issued document, with a reason.
// Nothing is deleted: the record stays, marked void, with who and why
// (the routes under /api/billing). A second tap confirms.

export default function VoidButton({ url, what, label = 'Void', testId }: { url: string; what: string; label?: string; testId?: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function send() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason.trim() }) })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        setError(json?.error || 'Could not void it')
        return
      }
      setOpen(false)
      setReason('')
      router.refresh()
    } catch {
      setError('No connection')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button type="button" data-testid={testId} onClick={() => setOpen(true)} className="min-h-11 px-1 text-xs font-medium text-[#9a2a1f] underline underline-offset-2">
        {label}
      </button>
    )
  }

  return (
    <div className="mt-2 w-full space-y-2 rounded-xl border border-[var(--color-stone-mid)] bg-white p-3" data-testid={testId ? `${testId}-form` : undefined}>
      <Field label={`Why void ${what}?`} hint="It stays on the record, marked void">
        <input className={INPUT} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="Recorded twice, bounced check…" />
      </Field>
      {error ? <p className="text-sm text-[#9a2a1f]">{error}</p> : null}
      <div className="flex gap-2">
        <Button variant="quiet" disabled={busy} onClick={() => { setOpen(false); setError(null) }}>
          Back
        </Button>
        <Button variant="danger" full busy={busy} disabled={reason.trim().length < 2} onClick={send}>
          Void {what}
        </Button>
      </div>
    </div>
  )
}
