'use client'

import { useState } from 'react'

import { BottomSheet } from '@/components/ui/BottomSheet'
import { parseMoney } from '@/lib/trackers/core'
import type { TrackerLine } from '@/lib/trackers/types'

export type LineEditValues = { name: string; contract: number; changeOrder: number; completedPrior: number; tbd: boolean; note: string }

type Props = {
  /** null = closed; { line: null } = add a new line. */
  request: { line: TrackerLine | null } | null
  onClose: () => void
  onSave: (lineId: string | null, values: LineEditValues) => void
  onRemove: (lineId: string) => void
}

const fieldClass =
  'w-full rounded-lg border px-3 py-2.5 bg-white text-[var(--color-charcoal)] text-base outline-none focus:border-[var(--color-teal)]'

export function LineEditorSheet({ request, onClose, onSave, onRemove }: Props) {
  return (
    <BottomSheet isOpen={!!request} onClose={onClose} maxHeightDvh={92} ariaLabel={request?.line ? `Edit ${request.line.name}` : 'Add a line item'}>
      {/* Mounted only while open, so the form seeds itself from the line each time. */}
      {request ? <LineForm key={request.line?.id ?? 'new'} line={request.line} onClose={onClose} onSave={onSave} onRemove={onRemove} /> : null}
    </BottomSheet>
  )
}

function LineForm({ line, onClose, onSave, onRemove }: { line: TrackerLine | null } & Omit<Props, 'request'>) {
  const [name, setName] = useState(line?.name ?? '')
  const [contract, setContract] = useState(line ? line.contract.toFixed(2) : '')
  const [co, setCo] = useState(line ? line.changeOrder.toFixed(2) : '')
  const [prior, setPrior] = useState(line ? line.completedPrior.toFixed(2) : '')
  const [tbd, setTbd] = useState(line?.tbd ?? false)
  const [note, setNote] = useState(line?.note ?? '')

  const bad = [contract, co, prior].some((v) => Number.isNaN(parseMoney(v)))

  function submit() {
    if (bad || !name.trim()) return
    onSave(line?.id ?? null, {
      name: name.trim(),
      contract: parseMoney(contract),
      changeOrder: parseMoney(co),
      completedPrior: Math.max(0, parseMoney(prior)),
      tbd,
      note,
    })
    onClose()
  }

  return (
    <form
      className="px-5 py-4 flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <h2 className="text-lg text-[var(--color-charcoal)]" style={{ fontFamily: 'var(--font-fraunces)' }}>
        {line ? 'Edit line item' : 'Add a line item'}
      </h2>
      <label className="flex flex-col gap-1 text-xs uppercase tracking-wide" style={{ color: 'var(--color-charcoal-light)' }}>
        Name
        <input className={fieldClass} style={{ borderColor: 'var(--color-stone)' }} value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoFocus={!line} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide" style={{ color: 'var(--color-charcoal-light)' }}>
          Contract $ (quoted)
          <input className={fieldClass} style={{ borderColor: 'var(--color-stone)' }} inputMode="decimal" value={contract} onChange={(e) => setContract(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide" style={{ color: 'var(--color-charcoal-light)' }}>
          Change orders $ (+/−)
          <input className={fieldClass} style={{ borderColor: 'var(--color-stone)' }} inputMode="decimal" value={co} onChange={(e) => setCo(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide" style={{ color: 'var(--color-charcoal-light)' }}>
          Completed before this invoice $
          <input className={fieldClass} style={{ borderColor: 'var(--color-stone)' }} inputMode="decimal" value={prior} onChange={(e) => setPrior(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide" style={{ color: 'var(--color-charcoal-light)' }}>
          Pricing
          <select className={fieldClass} style={{ borderColor: 'var(--color-stone)' }} value={tbd ? '1' : '0'} onChange={(e) => setTbd(e.target.value === '1')}>
            <option value="0">Priced</option>
            <option value="1">TBD — pricing pending</option>
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs uppercase tracking-wide" style={{ color: 'var(--color-charcoal-light)' }}>
        Note after the name on the workbook (optional)
        <input className={fieldClass} style={{ borderColor: 'var(--color-stone)' }} value={note} onChange={(e) => setNote(e.target.value)} maxLength={240} placeholder="e.g.   [labor $45,675 + material CO $21,251.72 — billed in full, paid]" />
      </label>
      {bad ? (
        <p className="text-xs" style={{ color: '#a23b2a' }} role="alert">
          Amounts need to be plain dollars, like 5,000 or 5000.00.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3 pt-1">
        {line ? (
          <button
            type="button"
            onClick={() => {
              onRemove(line.id)
              onClose()
            }}
            className="py-3 px-4 rounded-xl border-2 font-semibold min-h-[44px]"
            style={{ borderColor: 'var(--color-stone)', color: '#a23b2a' }}
          >
            Remove line
          </button>
        ) : null}
        <div className="flex-1" />
        <button type="button" onClick={onClose} className="py-3 px-5 rounded-xl border-2 border-[var(--color-stone)] text-[var(--color-charcoal)] font-semibold min-h-[44px]">
          Cancel
        </button>
        <button type="submit" disabled={bad || !name.trim()} className="py-3 px-6 rounded-xl bg-[var(--color-teal)] text-[var(--color-cream)] font-semibold min-h-[44px] disabled:opacity-50">
          Save
        </button>
      </div>
    </form>
  )
}
