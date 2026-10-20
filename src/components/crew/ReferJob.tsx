'use client'

import { useState } from 'react'
import { Megaphone } from 'lucide-react'

import { Button, Card, Field, INPUT, SectionTitle } from '@/components/bot/ui'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { crewApi, useCrew } from './CrewProvider'

// A lead from the field. The crew hear about work first (the neighbor over
// the fence, the client's next room), so they can send it in from here. It
// lands in the office's pipeline as a new lead with their name on it; the
// crew never see the pipeline itself (/api/crew/refer).

export function ReferJob() {
  const { t, toast } = useCrew()
  const [open, setOpen] = useState(false)
  const [what, setWhat] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function send() {
    setBusy(true)
    try {
      const r = await crewApi<{ number: string }>('/api/crew/refer', {
        method: 'POST',
        body: JSON.stringify({ what: what.trim(), name: name.trim(), phone: phone.trim(), address: address.trim(), note: note.trim() }),
      })
      toast(t.referSent(r.number), 'ok')
      setWhat('')
      setName('')
      setPhone('')
      setAddress('')
      setNote('')
      setOpen(false)
    } catch (e) {
      const msg = (e as Error).message
      toast(msg === 'offline' ? t.noConnection : msg, 'bad')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SectionTitle>{t.referTitle}</SectionTitle>
      <Card className="p-4">
        <p className="text-[15px] leading-relaxed text-[var(--color-charcoal)]">{t.referWhy}</p>
        <Button variant="primary" full className="mt-3" onClick={() => setOpen(true)}>
          <Megaphone className="size-4" aria-hidden="true" /> {t.referOpen}
        </Button>
      </Card>
      <BottomSheet isOpen={open} onClose={() => setOpen(false)} title={t.referTitle} maxHeightDvh={90} narrow>
        <div className="space-y-4 px-5 pb-6 pt-4">
          <Field label={t.referWhat} hint={t.referWhatHint}>
            <textarea className={INPUT} rows={2} value={what} onChange={(e) => setWhat(e.target.value)} autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`${t.referName} (${t.optional})`}>
              <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
            </Field>
            <Field label={`${t.referPhone} (${t.optional})`}>
              <input className={INPUT} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="off" />
            </Field>
          </div>
          <Field label={`${t.referAddress} (${t.optional})`}>
            <input className={INPUT} value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="off" />
          </Field>
          <Field label={`${t.referNote} (${t.optional})`}>
            <textarea className={INPUT} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Button variant="primary" full busy={busy} disabled={what.trim().length < 3} onClick={send}>
            {t.referSend}
          </Button>
        </div>
      </BottomSheet>
    </>
  )
}
