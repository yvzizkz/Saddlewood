'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { botApi } from '@/components/bot/BotProvider'
import { useSalesToast } from '../useSalesToast'
import { Button, Field, INPUT } from '@/components/bot/ui'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { KINDS, SOURCES, type Opportunity, type OpportunityKind, type Source } from '@/lib/sales/types'
import { todayPhoenix } from '../format'
import { parseDollars, plusDays } from './labels'

// A new prospect in under a minute, standing in a driveway: only the name is
// required. Everything else can wait for the opportunity's own screen.

export function ChipPick<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (v: T) => void
  options: readonly { key: T; label: string }[]
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o.key === value
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.key)}
            className={`min-h-9 rounded-full border px-3 text-[13px] font-medium transition-colors ${
              on
                ? 'border-[var(--color-teal)] bg-[var(--color-teal)] text-white'
                : 'border-[var(--color-stone-mid)] bg-white text-[var(--color-charcoal)] active:bg-[var(--color-cream)]'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function QuickAddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const { toast } = useSalesToast()
  const today = todayPhoenix()
  const [title, setTitle] = useState('')
  const [want, setWant] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [kind, setKind] = useState<OpportunityKind>('remodel')
  const [source, setSource] = useState<Source>('call')
  const [value, setValue] = useState('')
  const [nextStep, setNextStep] = useState('Call back')
  const [nextOn, setNextOn] = useState(plusDays(today, 1))
  const [busy, setBusy] = useState(false)

  const cents = parseDollars(value)
  const badValue = value.trim() !== '' && cents === null

  async function save() {
    setBusy(true)
    try {
      const r = await botApi<{ opportunity: Opportunity }>('/api/sales', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim() || name.trim(),
          kind,
          source,
          contact: { name: name.trim(), phone: phone.trim(), email: email.trim() },
          address: address.trim(),
          valueCents: cents ?? undefined,
          nextStep: nextStep.trim(),
          nextStepOn: nextOn || null,
          firstNote: want.trim() || undefined,
        }),
      })
      toast(`Tracking ${r.opportunity.number}`, 'ok')
      onClose()
      router.push(`/app/sales/${r.opportunity.id}`)
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setBusy(false)
    }
  }

  return (
    <BottomSheet isOpen={open} onClose={onClose} title="New prospect" maxHeightDvh={92} narrow>
      <div className="space-y-4 px-5 pb-6 pt-4">
        <Field label="Name or job" hint="Who, or what to call it: “Ortega kitchen”, “JK – Cardinal Lot 12”">
          <input className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus enterKeyHint="next" />
        </Field>
        <Field label="What they want">
          <textarea className={INPUT} rows={2} value={want} onChange={(e) => setWant(e.target.value)} placeholder="Kitchen remodel, open the wall to the dining room" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Contact">
            <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Phone">
            <input className={INPUT} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="off" />
          </Field>
        </div>
        <Field label="Email">
          <input className={INPUT} value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" autoComplete="off" />
        </Field>
        <Field label="Address">
          <input className={INPUT} value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="off" />
        </Field>
        <div>
          <p className="mb-1.5 text-xs font-medium text-[var(--color-charcoal)]">Kind of work</p>
          <ChipPick label="Kind of work" value={kind} onChange={setKind} options={KINDS} />
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-[var(--color-charcoal)]">How it came in</p>
          <ChipPick label="How it came in" value={source} onChange={setSource} options={SOURCES} />
        </div>
        <Field label="Rough size" hint={badValue ? 'A number, like 45000 or 45k' : 'A guess is fine; the estimate replaces it'}>
          <input className={INPUT} value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder="$45k" />
        </Field>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Next step">
            <input className={INPUT} value={nextStep} onChange={(e) => setNextStep(e.target.value)} />
          </Field>
          <Field label="When">
            <input className={INPUT} type="date" value={nextOn} min={today} onChange={(e) => setNextOn(e.target.value)} />
          </Field>
        </div>
        <Button variant="primary" full busy={busy} disabled={!(title.trim() || name.trim()) || badValue} onClick={save}>
          Start tracking
        </Button>
      </div>
    </BottomSheet>
  )
}
