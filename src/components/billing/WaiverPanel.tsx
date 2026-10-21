'use client'

// The lien waiver that goes with this invoice (0040, direction "out"): whether
// one is owed, and its step. Recording it here clears it from Billing's
// register and from Finance's tasks. The waiver file itself stays where it is
// kept (an exhibit on this document, or OneDrive); paste its link if useful.

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Chip } from '@/components/bot/ui'

type Held = { id: number; kind: string; status: string; fileUrl: string } | null

const STEPS: { status: 'prepared' | 'sent' | 'received'; label: string }[] = [
  { status: 'prepared', label: 'Prepared' },
  { status: 'sent', label: 'Sent with the invoice' },
  { status: 'received', label: 'Signed copy back' },
]

export default function WaiverPanel({ documentId, amountCents, owed, held, finalBill }: { documentId: string; amountCents: number; owed: boolean; held: Held; finalBill?: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')
  if (!owed && !held) return null

  const step = async (status: 'prepared' | 'sent' | 'received') => {
    setBusy(status)
    setErr('')
    const res = held
      ? await fetch('/api/waivers', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: held.id, status }) })
      : await fetch('/api/waivers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ direction: 'out', kind: finalBill ? 'conditional_final' : 'conditional_progress', documentId, amountCents, status }),
        })
    setBusy(null)
    if (!res.ok) return setErr((await res.json().catch(() => null))?.error ?? 'Could not save')
    router.refresh()
  }

  const current = held?.status ?? 'missing'
  return (
    <div className="mt-4 rounded-2xl border border-[var(--color-stone)] bg-white p-4" aria-label="Lien waiver">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-[var(--color-charcoal)]">Lien waiver</p>
        <Chip tone={current === 'received' ? 'ok' : current === 'missing' ? 'bad' : 'warn'}>{current === 'missing' ? 'Missing' : current[0].toUpperCase() + current.slice(1)}</Chip>
      </div>
      <p className="mt-1 text-xs text-[var(--color-charcoal-light)]">
        {held ? held.kind.replace(/_/g, ' ') : finalBill ? 'Conditional final' : 'Conditional progress'} for the exact amount of this invoice.
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {STEPS.map((s) => (
          <button
            key={s.status}
            type="button"
            disabled={!!busy || current === s.status}
            onClick={() => step(s.status)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${current === s.status ? 'border-[var(--color-teal)] bg-[var(--color-teal)] text-white' : 'border-[var(--color-stone-mid)] hover:bg-[var(--color-cream)]'}`}
          >
            {busy === s.status ? '…' : s.label}
          </button>
        ))}
      </div>
      {err ? <p className="mt-2 text-xs text-[#9a2a1f]">{err}</p> : null}
    </div>
  )
}
