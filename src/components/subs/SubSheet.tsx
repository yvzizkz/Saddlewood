'use client'

import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'

import { botApi } from '@/components/bot/BotProvider'
import { Button, Field, INPUT, Segmented } from '@/components/bot/ui'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { COMMON_TRADES, SUB_STATUSES, SUB_STATUS_LABEL, type Sub, type SubStatus } from '@/lib/subs/types'

// One sub in the directory: who they are, their trades, the people there, and
// the onboarding facts SOP-008 checks before anyone starts (license checked
// on the ROC portal, insurance date, W-9, master agreement, bank details
// confirmed by phone). Who checked and when is kept by the server.

type Contact = { id?: string; name: string; email: string; phone: string; role: string; isPrimary: boolean }

const EMPTY: Omit<Sub, 'id' | 'createdBy' | 'createdAt' | 'updatedAt' | 'contacts' | 'rocVerifiedAt' | 'rocVerifiedBy' | 'achConfirmedAt' | 'achConfirmedBy'> = {
  name: '',
  trades: [],
  status: 'prospect',
  phone: '',
  email: '',
  address: '',
  rocLicense: '',
  coiExpiresOn: null,
  w9OnFile: false,
  msaSignedOn: null,
  note: '',
}

function Check({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-[var(--color-stone)] bg-white px-3 py-2">
      <span>
        <span className="block text-sm text-[var(--color-charcoal)]">{label}</span>
        {hint ? <span className="block text-[11px] text-[var(--color-charcoal-light)]">{hint}</span> : null}
      </span>
      <input type="checkbox" className="size-5 shrink-0 accent-[var(--color-teal)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

export function SubSheet({ open, sub, onClose, onSaved, toast, presetTrade }: { open: boolean; sub: Sub | null; onClose: () => void; onSaved: (s: Sub) => void; toast: (m: string, t?: 'ok' | 'bad') => void; presetTrade?: string }) {
  const [f, setF] = useState(EMPTY)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [roc, setRoc] = useState(false)
  const [ach, setAch] = useState(false)
  const [tradeText, setTradeText] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    const s = sub
    setF(s ? { name: s.name, trades: s.trades, status: s.status, phone: s.phone, email: s.email, address: s.address, rocLicense: s.rocLicense, coiExpiresOn: s.coiExpiresOn, w9OnFile: s.w9OnFile, msaSignedOn: s.msaSignedOn, note: s.note } : { ...EMPTY, trades: presetTrade ? [presetTrade] : [] })
    setContacts(s ? s.contacts.map((c) => ({ id: c.id, name: c.name, email: c.email, phone: c.phone, role: c.role, isPrimary: c.isPrimary })) : [{ name: '', email: '', phone: '', role: '', isPrimary: true }])
    setRoc(!!s?.rocVerifiedAt)
    setAch(!!s?.achConfirmedAt)
    setTradeText('')
  }, [open, sub, presetTrade])

  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }))
  const toggleTrade = (t: string) => set({ trades: f.trades.includes(t) ? f.trades.filter((x) => x !== t) : [...f.trades, t] })

  async function save() {
    setBusy(true)
    try {
      const body = { ...f, trades: [...f.trades, ...(tradeText.trim() ? [tradeText.trim()] : [])], rocVerified: roc, achConfirmed: ach, contacts }
      const r = await botApi<{ sub: Sub }>(sub ? `/api/subs/${sub.id}` : '/api/subs', { method: sub ? 'PUT' : 'POST', body: JSON.stringify(body) })
      toast(sub ? 'Saved' : `${r.sub.name} added`, 'ok')
      onSaved(r.sub)
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setBusy(false)
    }
  }

  const trades = [...new Set([...COMMON_TRADES, ...f.trades])]
  return (
    <BottomSheet isOpen={open} onClose={onClose} title={sub ? sub.name : 'Add a sub'} maxHeightDvh={92}>
      <div className="space-y-4 px-5 pb-6 pt-4">
        <Field label="Company">
          <input className={INPUT} value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Desert Insulation LLC" />
        </Field>
        <div>
          <p className="mb-1.5 text-xs font-medium text-[var(--color-charcoal)]">Status</p>
          <Segmented<SubStatus> label="Status" value={f.status} onChange={(v) => set({ status: v })} options={SUB_STATUSES.map((s) => ({ value: s, label: SUB_STATUS_LABEL[s] }))} />
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-[var(--color-charcoal)]">Trades</p>
          <div className="flex flex-wrap gap-1.5">
            {trades.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={f.trades.includes(t)}
                onClick={() => toggleTrade(t)}
                className={`min-h-9 rounded-full border px-3 text-[13px] ${f.trades.includes(t) ? 'border-[var(--color-teal)] bg-[var(--color-teal)] text-white' : 'border-[var(--color-stone-mid)] bg-white text-[var(--color-charcoal)]'}`}
              >
                {t}
              </button>
            ))}
          </div>
          <input className={`${INPUT} mt-2`} placeholder="Another trade" value={tradeText} onChange={(e) => setTradeText(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Office phone">
            <input className={INPUT} inputMode="tel" value={f.phone} onChange={(e) => set({ phone: e.target.value })} />
          </Field>
          <Field label="Office email">
            <input className={INPUT} inputMode="email" value={f.email} onChange={(e) => set({ email: e.target.value })} />
          </Field>
        </div>
        <Field label="Address">
          <input className={INPUT} value={f.address} onChange={(e) => set({ address: e.target.value })} />
        </Field>

        <div>
          <p className="mb-1.5 text-xs font-medium text-[var(--color-charcoal)]">People</p>
          <div className="space-y-2">
            {contacts.map((c, i) => (
              <div key={c.id ?? `n${i}`} className="rounded-xl border border-[var(--color-stone)] p-3">
                <div className="grid grid-cols-2 gap-2">
                  <input className={INPUT} placeholder="Name" aria-label="Name" value={c.name} onChange={(e) => setContacts((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} />
                  <input className={INPUT} placeholder="Role (estimator)" aria-label="Role" value={c.role} onChange={(e) => setContacts((x) => x.map((y, j) => (j === i ? { ...y, role: e.target.value } : y)))} />
                  <input className={INPUT} placeholder="Email" aria-label="Email" inputMode="email" value={c.email} onChange={(e) => setContacts((x) => x.map((y, j) => (j === i ? { ...y, email: e.target.value } : y)))} />
                  <input className={INPUT} placeholder="Phone" aria-label="Phone" inputMode="tel" value={c.phone} onChange={(e) => setContacts((x) => x.map((y, j) => (j === i ? { ...y, phone: e.target.value } : y)))} />
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-[var(--color-charcoal)]">
                    <input type="radio" name="primary" className="size-4 accent-[var(--color-teal)]" checked={c.isPrimary} onChange={() => setContacts((x) => x.map((y, j) => ({ ...y, isPrimary: j === i })))} />
                    Bid invites go to them
                  </label>
                  <button type="button" aria-label="Remove this person" onClick={() => setContacts((x) => x.filter((_, j) => j !== i))} className="p-2 text-[var(--color-charcoal-light)]">
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <Button variant="quiet" className="mt-1 !px-0" onClick={() => setContacts((x) => [...x, { name: '', email: '', phone: '', role: '', isPrimary: x.length === 0 }])}>
            <Plus className="size-4" aria-hidden="true" /> Another person
          </Button>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-[var(--color-charcoal)]">Before they start (SOP-008)</p>
          <Field label="ROC license">
            <input className={INPUT} value={f.rocLicense} onChange={(e) => set({ rocLicense: e.target.value })} placeholder="ROC 123456" />
          </Field>
          <Check label="License checked on the ROC portal" hint={sub?.rocVerifiedAt ? `Checked by ${sub.rocVerifiedBy}` : 'Active, and the right classification'} checked={roc} onChange={setRoc} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Insurance good through">
              <input type="date" className={INPUT} value={f.coiExpiresOn ?? ''} onChange={(e) => set({ coiExpiresOn: e.target.value || null })} />
            </Field>
            <Field label="Master agreement signed">
              <input type="date" className={INPUT} value={f.msaSignedOn ?? ''} onChange={(e) => set({ msaSignedOn: e.target.value || null })} />
            </Field>
          </div>
          <Check label="W-9 on file" checked={f.w9OnFile} onChange={(v) => set({ w9OnFile: v })} />
          <Check label="Bank details confirmed by phone" hint={sub?.achConfirmedAt ? `Confirmed by ${sub.achConfirmedBy}` : 'Never from an email alone'} checked={ach} onChange={setAch} />
        </div>

        <Field label="Notes">
          <textarea className={INPUT} rows={3} value={f.note} onChange={(e) => set({ note: e.target.value })} />
        </Field>
        <Button variant="primary" full busy={busy} disabled={f.name.trim().length < 2} onClick={save}>
          {sub ? 'Save' : 'Add to the directory'}
        </Button>
      </div>
    </BottomSheet>
  )
}
