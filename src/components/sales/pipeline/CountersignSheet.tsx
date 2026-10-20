'use client'

import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'

import { Button, Field, INPUT } from '@/components/bot/ui'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { SignaturePad, type PadValue } from '@/components/sales/SignaturePad'
import type { SignatureFont } from '@/lib/sales/settings'

// Saddlewood's signature on a proposal, from the app. Same pad as the client's
// (draw, or type in a chosen style), the same consent words, and the same
// record: a line in the proposal's proof record that cannot be changed.

export function CountersignSheet({
  open,
  onClose,
  documentId,
  number,
  me,
  consentText,
  companyTitle,
  fonts,
  onSigned,
}: {
  open: boolean
  onClose: () => void
  documentId: string
  number: string
  me: { name: string; email: string }
  consentText: string
  companyTitle: string
  fonts: SignatureFont[]
  onSigned: (executed: boolean) => void
}) {
  const [name, setName] = useState(me.name)
  const [pad, setPad] = useState<PadValue>(null)
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<null | { executed: boolean }>(null)

  async function sign() {
    if (!pad) return
    setBusy(true)
    setErr('')
    try {
      const res = await fetch(`/api/sales/proposals/${documentId}/sign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: me.email || undefined, method: pad.method, typed: pad.typed, font: pad.font, image: pad.image, agree: true }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) throw new Error(j.error || `could not sign (${res.status})`)
      setDone({ executed: !!j.executed })
      onSigned(!!j.executed)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <BottomSheet isOpen={open} onClose={onClose} title={done ? 'Signed' : `Countersign ${number}`} maxHeightDvh={94} narrow>
      {done ? (
        <div className="space-y-4 px-5 pb-6 pt-4">
          <p className="flex items-start gap-2 rounded-xl bg-[rgba(47,107,74,0.12)] px-3 py-3 text-sm text-[#2f6b4a]">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            {done.executed ? 'Fully signed. The signed copy goes out as the notification settings say.' : 'Your signature is on it. It is fully signed once the client signs.'}
          </p>
          <Button variant="primary" full onClick={onClose}>
            Done
          </Button>
        </div>
      ) : (
        <div className="space-y-4 px-5 pb-6 pt-4 ph-no-capture">
          <Field label="Your full name" hint={companyTitle ? `Printed under it: ${companyTitle}` : undefined}>
            <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </Field>
          <SignaturePad name={name} fonts={fonts} onChange={setPad} />
          <label className="flex items-start gap-2.5 text-sm text-[var(--color-charcoal)]">
            <input type="checkbox" className="mt-1 size-4 accent-[var(--color-teal)]" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>{consentText}</span>
          </label>
          {err ? <p className="text-sm text-[#9a2a1f]">{err}</p> : null}
          <Button variant="primary" full busy={busy} disabled={!pad || !agree || name.trim().length < 3} onClick={sign}>
            Sign for Saddlewood
          </Button>
        </div>
      )}
    </BottomSheet>
  )
}
