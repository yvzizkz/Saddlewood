'use client'

import { useState } from 'react'

import { botApi } from '@/components/bot/BotProvider'
import { useSalesToast } from '../useSalesToast'
import { Button, Field, INPUT } from '@/components/bot/ui'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { KINDS, SOURCES, type Opportunity } from '@/lib/sales/types'
import { parseDollars } from './labels'
import { ChipPick } from './QuickAddSheet'

// Everything about a prospect that is not the stage or the next step: who,
// where, what kind of work, how it came in, the guess at its size.

export function DetailsSheet({ open, onClose, o, onSaved }: { open: boolean; onClose: () => void; o: Opportunity; onSaved: (o: Opportunity) => void }) {
  const { toast } = useSalesToast()
  const [f, setF] = useState(() => ({
    title: o.title,
    name: o.contact.name ?? '',
    company: o.contact.company ?? '',
    phone: o.contact.phone ?? '',
    email: o.contact.email ?? '',
    address: o.address,
    kind: o.kind,
    source: o.source,
    value: o.valueCents ? String(o.valueCents / 100) : '',
    bidDue: o.bidDue ?? '',
    notes: o.notes,
  }))
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }))
  const cents = parseDollars(f.value)
  const badValue = f.value.trim() !== '' && cents === null

  async function save() {
    setBusy(true)
    try {
      const r = await botApi<{ opportunity: Opportunity }>(`/api/sales/${o.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: f.title.trim() || o.title,
          contact: { name: f.name.trim(), company: f.company.trim(), phone: f.phone.trim(), email: f.email.trim() },
          address: f.address.trim(),
          kind: f.kind,
          source: f.source,
          valueCents: cents ?? 0,
          bidDue: f.bidDue || null,
          notes: f.notes,
        }),
      })
      onSaved(r.opportunity)
      onClose()
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setBusy(false)
    }
  }

  return (
    <BottomSheet isOpen={open} onClose={onClose} title="Details" maxHeightDvh={92} narrow>
      <div className="space-y-4 px-5 pb-6 pt-4">
        <Field label="Name">
          <input className={INPUT} value={f.title} onChange={(e) => set('title')(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Contact">
            <input className={INPUT} value={f.name} onChange={(e) => set('name')(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Company">
            <input className={INPUT} value={f.company} onChange={(e) => set('company')(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Phone">
            <input className={INPUT} value={f.phone} onChange={(e) => set('phone')(e.target.value)} inputMode="tel" autoComplete="off" />
          </Field>
          <Field label="Email">
            <input className={INPUT} value={f.email} onChange={(e) => set('email')(e.target.value)} inputMode="email" autoComplete="off" />
          </Field>
        </div>
        <Field label="Address">
          <input className={INPUT} value={f.address} onChange={(e) => set('address')(e.target.value)} autoComplete="off" />
        </Field>
        <div>
          <p className="mb-1.5 text-xs font-medium text-[var(--color-charcoal)]">Kind of work</p>
          <ChipPick label="Kind of work" value={f.kind} onChange={(v) => setF((x) => ({ ...x, kind: v }))} options={KINDS} />
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-[var(--color-charcoal)]">How it came in</p>
          <ChipPick label="How it came in" value={f.source} onChange={(v) => setF((x) => ({ ...x, source: v }))} options={SOURCES} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Rough size" hint={badValue ? 'A number, like 45k' : 'Until an estimate prices it'}>
            <input className={INPUT} value={f.value} onChange={(e) => set('value')(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Bid due">
            <input className={INPUT} type="date" value={f.bidDue} onChange={(e) => set('bidDue')(e.target.value)} />
          </Field>
        </div>
        <Field label="Notes">
          <textarea className={INPUT} rows={4} value={f.notes} onChange={(e) => set('notes')(e.target.value)} />
        </Field>
        <Button variant="primary" full busy={busy} disabled={badValue} onClick={save}>
          Save
        </Button>
      </div>
    </BottomSheet>
  )
}
