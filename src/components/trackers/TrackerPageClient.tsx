'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { AutosaveIndicator } from '@/components/estimate/AutosaveIndicator'
import type { SaveStatus } from '@/hooks/useAutosave'
import { cents, lineCalc, notesAuto, slug, summary } from '@/lib/trackers/core'
import type { TrackerInvoiceSnapshot, TrackerLine, TrackerRecord, TrackerState } from '@/lib/trackers/types'
import { AmountSheet, type AmountField, type AmountRequest } from './AmountSheet'
import { ConfirmSheet, type ConfirmRequest } from './ConfirmSheet'
import { api, ApiError, DUE_RED, fmt } from './format'
import { HistorySection } from './HistorySection'
import { InvoicePanel, type GenerateResult } from './InvoicePanel'
import { LineEditorSheet, type LineEditValues } from './LineEditorSheet'
import { LinesSection } from './LinesSection'
import { NotesSection } from './NotesSection'
import { PaidSheet } from './PaidSheet'
import { PaymentsSection } from './PaymentsSection'
import { ProjectSection } from './ProjectSection'
import { TrackerKpis } from './TrackerKpis'

type Props = { tracker: TrackerRecord; invoices: TrackerInvoiceSnapshot[] }

const SAVE_DEBOUNCE_MS = 900

/**
 * The tracker page. The server hands over the row; from there every edit
 * lands in local state, recomputes the totals, and is saved 0.9 s after the
 * last change with the row's updated_at as a guard against a second tab.
 */
export function TrackerPageClient({ tracker, invoices: initialInvoices }: Props) {
  const trackerId = tracker.id
  const [state, setState] = useState<TrackerState>(tracker.state)
  const [invoices, setInvoices] = useState(initialInvoices)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [conflict, setConflict] = useState<TrackerRecord | null>(null)
  const [busy, setBusy] = useState<'generate' | 'roll' | null>(null)
  const [result, setResult] = useState<GenerateResult | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [amountReq, setAmountReq] = useState<AmountRequest | null>(null)
  const [editReq, setEditReq] = useState<{ line: TrackerLine | null } | null>(null)
  const [paidOpen, setPaidOpen] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)

  const stateRef = useRef(state)
  const updatedAtRef = useRef(tracker.updatedAt)
  const dirtyRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const calcs = useMemo(() => state.lines.map(lineCalc), [state.lines])
  const s = useMemo(() => summary(state, calcs), [state, calcs])
  const auto = useMemo(() => notesAuto(state, calcs, s), [state, calcs, s])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3200)
  }, [])

  const adopt = useCallback((rec: TrackerRecord) => {
    stateRef.current = rec.state
    updatedAtRef.current = rec.updatedAt
    dirtyRef.current = false
    setState(rec.state)
    setConflict(null)
  }, [])

  const flush = useCallback(async (): Promise<boolean> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (!dirtyRef.current) return true
    dirtyRef.current = false
    setSaveStatus('saving')
    try {
      const json = await api<{ tracker: TrackerRecord }>(`/api/trackers/${trackerId}`, {
        method: 'PUT',
        body: JSON.stringify({ state: stateRef.current, baseUpdatedAt: updatedAtRef.current }),
      })
      updatedAtRef.current = json.tracker.updatedAt
      setLastSavedAt(new Date())
      setSaveStatus('saved')
      return true
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.data.tracker) {
        setConflict(e.data.tracker as TrackerRecord)
      } else {
        dirtyRef.current = true
      }
      setSaveStatus('error')
      return false
    }
  }, [trackerId])

  const update = useCallback(
    (fn: (prev: TrackerState) => TrackerState) => {
      const next = fn(stateRef.current)
      stateRef.current = next
      setState(next)
      dirtyRef.current = true
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS)
    },
    [flush],
  )

  useEffect(() => {
    const timers = { save: timerRef, toast: toastTimer }
    return () => {
      if (timers.save.current) clearTimeout(timers.save.current)
      if (timers.toast.current) clearTimeout(timers.toast.current)
    }
  }, [])

  // Warn before leaving with unsaved edits still in the debounce window.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (dirtyRef.current) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  /* ---------- line edits ---------- */
  const setAmount = useCallback(
    (lineId: string, field: AmountField, value: number) => {
      update((prev) => ({ ...prev, lines: prev.lines.map((l) => (l.id === lineId ? { ...l, [field]: Math.max(0, cents(value)) } : l)) }))
    },
    [update],
  )
  const billRemaining = useCallback(
    (lineId: string) => {
      update((prev) => ({
        ...prev,
        lines: prev.lines.map((l) => {
          if (l.id !== lineId) return l
          const c = lineCalc(l)
          return { ...l, thisInvoice: Math.max(0, cents(c.remaining - c.draw + c.cp)) }
        }),
      }))
      const l = stateRef.current.lines.find((x) => x.id === lineId)
      if (l) showToast(`${l.name} billed to 100%`)
    },
    [update, showToast],
  )
  const saveLine = useCallback(
    (lineId: string | null, v: LineEditValues) => {
      let cleared = false
      update((prev) => {
        if (lineId) {
          return {
            ...prev,
            lines: prev.lines.map((l) => {
              if (l.id !== lineId) return l
              const next = { ...l, ...v }
              if ((next.tbd || next.contract + next.changeOrder <= 0) && (next.thisInvoice || next.draw)) {
                cleared = true
                next.thisInvoice = 0
                next.draw = 0
              }
              return next
            }),
          }
        }
        const ids = new Set(prev.lines.map((l) => l.id))
        let id = slug(v.name)
        const base = id
        let k = 2
        while (ids.has(id)) id = `${base}-${k++}`
        return { ...prev, lines: [...prev.lines, { id, thisInvoice: 0, draw: 0, ...v }] }
      })
      if (cleared) showToast(`Amounts on ${v.name} were cleared — the line is not priced`)
    },
    [update, showToast],
  )
  const removeLine = useCallback(
    (lineId: string) => {
      const line = stateRef.current.lines.find((l) => l.id === lineId)
      if (!line) return
      setConfirm({
        title: `Remove ${line.name}?`,
        body: 'The line and its amounts leave the schedule of values. You can add it back later.',
        confirmLabel: 'Remove',
        danger: true,
        onConfirm: () => update((prev) => ({ ...prev, lines: prev.lines.filter((l) => l.id !== lineId) })),
      })
    },
    [update],
  )

  /* ---------- payments, notes, project ---------- */
  const changePayment = useCallback((i: number, patch: Partial<TrackerState['payments'][number]>) => update((prev) => ({ ...prev, payments: prev.payments.map((p, j) => (j === i ? { ...p, ...patch } : p)) })), [update])
  const addPayment = useCallback(() => {
    const d = new Date()
    const date = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`
    update((prev) => ({ ...prev, payments: [...prev.payments, { label: 'Owner Payment (ref. ________)', date, amount: 0 }] }))
  }, [update])
  const removePayment = useCallback(
    (i: number) => {
      const p = stateRef.current.payments[i]
      if (!p) return
      setConfirm({
        title: 'Remove this payment?',
        body: `${p.label} — ${p.date} — ${fmt(Number(p.amount) || 0)} will be removed from Total Paid to Date.`,
        confirmLabel: 'Remove',
        danger: true,
        onConfirm: () => update((prev) => ({ ...prev, payments: prev.payments.filter((_, j) => j !== i) })),
      })
    },
    [update],
  )

  /* ---------- generate & roll-forward ---------- */
  const generate = useCallback(
    async (force = false) => {
      if (!stateRef.current.invoice.number) {
        showToast('Give the invoice a number first.')
        return
      }
      setBusy('generate')
      setResult(null)
      try {
        const saved = await flush()
        if (!saved) throw new Error('The numbers could not be saved. Check the connection and try again.')
        const json = await api<{ tracker: TrackerRecord; sentTo: string[]; download: string; filename: string; invoice: { number: string; totalDue: number } }>(
          `/api/trackers/${trackerId}/generate`,
          { method: 'POST', body: JSON.stringify({ force, baseUpdatedAt: updatedAtRef.current }) },
        )
        adopt(json.tracker)
        setResult({ sentTo: json.sentTo, download: json.download, filename: json.filename, invoice: json.invoice, at: new Date() })
        const inv = await api<{ invoices: TrackerInvoiceSnapshot[] }>(`/api/trackers/${trackerId}`)
        setInvoices(inv.invoices)
        showToast(json.sentTo.length ? `Sent to ${json.sentTo[0]}` : 'Workbook generated')
      } catch (e) {
        if (e instanceof ApiError && (e.code === 'over' || e.code === 'zero_due')) {
          setConfirm({
            title: e.code === 'over' ? 'Some lines bill more than their remaining value' : 'Nothing is due on this invoice',
            body: `${e.message} Generate anyway?`,
            confirmLabel: 'Generate',
            onConfirm: () => void generate(true),
          })
        } else if (e instanceof ApiError && e.status === 409 && e.data.tracker) {
          setConflict(e.data.tracker as TrackerRecord)
        } else {
          showToast((e as Error).message)
        }
      } finally {
        setBusy(null)
      }
    },
    [adopt, flush, showToast, trackerId],
  )

  const rollForward = useCallback(
    async (input: { amount: number; date: string; label: string }) => {
      setBusy('roll')
      try {
        const saved = await flush()
        if (!saved) throw new Error('The numbers could not be saved. Check the connection and try again.')
        const json = await api<{ tracker: TrackerRecord; invoices: TrackerInvoiceSnapshot[] }>(`/api/trackers/${trackerId}/roll-forward`, {
          method: 'POST',
          body: JSON.stringify({ ...input, baseUpdatedAt: updatedAtRef.current }),
        })
        adopt(json.tracker)
        setInvoices(json.invoices)
        setResult(null)
        setPaidOpen(false)
        showToast(`Payment recorded — invoice #${json.tracker.state.invoice.number} is open`)
        window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
      } catch (e) {
        if (e instanceof ApiError && e.status === 409 && e.data.tracker) setConflict(e.data.tracker as TrackerRecord)
        else showToast((e as Error).message)
      } finally {
        setBusy(null)
      }
    },
    [adopt, flush, showToast, trackerId],
  )

  const restore = useCallback(
    (invoiceNumber: string) => {
      setConfirm({
        title: `Restore invoice #${invoiceNumber}?`,
        body: 'The page goes back to exactly what it held when that tracker was generated. The current draft is replaced.',
        confirmLabel: 'Restore',
        onConfirm: async () => {
          try {
            const json = await api<{ state: TrackerState }>(`/api/trackers/${trackerId}/invoices/${encodeURIComponent(invoiceNumber)}`)
            update(() => json.state)
            setResult(null)
            showToast(`Restored #${invoiceNumber}`)
          } catch (e) {
            showToast((e as Error).message)
          }
        },
      })
    },
    [trackerId, update, showToast],
  )

  const onInvoiceField = (key: 'number' | 'date', value: string) => update((prev) => ({ ...prev, invoice: { ...prev.invoice, [key]: value } }))
  const issued = state.invoice.status === 'issued'

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      <div className="sticky top-0 z-10 border-b print:hidden" style={{ backgroundColor: 'var(--color-background)', borderColor: 'var(--color-stone)' }}>
        <div className="flex items-center justify-between gap-3 px-4 py-3 min-h-[44px] max-w-6xl mx-auto md:px-8">
          <Link href="/internal/trackers" className="flex items-center gap-2 text-[var(--color-charcoal)] font-medium min-w-0">
            <span aria-hidden="true">{'←'}</span>
            <span style={{ fontFamily: 'var(--font-fraunces)' }} className="text-base uppercase tracking-wide truncate">
              {state.project.name}
            </span>
          </Link>
          <AutosaveIndicator status={saveStatus} lastSavedAt={lastSavedAt} onRetry={() => void flush()} />
        </div>
      </div>

      <div className="px-4 pt-5 md:px-8 md:pt-8 max-w-6xl mx-auto pb-[calc(140px+env(safe-area-inset-bottom,0px))] lg:pb-16">
        {conflict ? (
          <div className="mb-4 rounded-lg border px-4 py-3 text-sm flex flex-wrap items-center gap-3" style={{ borderColor: DUE_RED, color: 'var(--color-charcoal)', backgroundColor: 'rgba(162,59,42,0.08)' }} role="alert">
            <span className="flex-1 min-w-[200px]">
              This tracker was saved elsewhere{conflict.updatedBy ? ` by ${conflict.updatedBy.split('@')[0]}` : ''} after you opened it. Load that version to keep working; your unsaved edits here are dropped.
            </span>
            <button type="button" onClick={() => adopt(conflict)} className="px-3 py-2 rounded-lg text-[var(--color-cream)] font-semibold" style={{ backgroundColor: 'var(--color-teal)' }}>
              Load latest
            </button>
          </div>
        ) : null}

        <header className="flex flex-wrap items-end justify-between gap-4 mb-5">
          <div className="min-w-0">
            <p className="text-[11px] tracking-[0.14em] uppercase mb-1" style={{ color: 'var(--color-gold-accessible)' }}>
              Progress payment tracker
            </p>
            <h1 style={{ fontFamily: 'var(--font-fraunces)' }} className="text-3xl md:text-4xl text-[var(--color-charcoal)]">
              {state.project.name}
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--color-charcoal-light)' }}>
              <b className="font-medium text-[var(--color-charcoal)]">{state.project.owners}</b>
              {state.project.address ? ` · ${state.project.address}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--color-charcoal-light)' }}>
              Invoice #
              <input
                className="w-[120px] rounded-lg border px-3 py-2 bg-white text-sm tabular-nums text-[var(--color-charcoal)] outline-none focus:border-[var(--color-teal)]"
                style={{ borderColor: 'var(--color-stone)' }}
                value={state.invoice.number}
                onChange={(e) => onInvoiceField('number', e.target.value)}
                maxLength={32}
              />
            </label>
            <label className="flex flex-col gap-1 text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--color-charcoal-light)' }}>
              Invoice date
              <input
                className="w-[130px] rounded-lg border px-3 py-2 bg-white text-sm tabular-nums text-[var(--color-charcoal)] outline-none focus:border-[var(--color-teal)]"
                style={{ borderColor: 'var(--color-stone)' }}
                value={state.invoice.date}
                placeholder="MM/DD/YYYY"
                onChange={(e) => onInvoiceField('date', e.target.value)}
                maxLength={24}
              />
            </label>
            <span className="px-2.5 py-1 rounded-full text-[10px] uppercase tracking-[0.08em] self-center mt-4" style={issued ? { backgroundColor: 'rgba(47,107,74,0.14)', color: '#2f6b4a' } : { backgroundColor: 'rgba(212,175,55,0.18)', color: '#8f6c18' }}>
              {issued ? 'Issued' : 'Draft'}
            </span>
          </div>
        </header>

        <TrackerKpis s={s} calcs={calcs} paymentsCount={state.payments.length} />

        <div className="mt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6 lg:items-start">
          <div className="flex flex-col gap-5">
            <LinesSection lines={state.lines} calcs={calcs} s={s} onAmount={setAmount} onOpenAmount={(line, field) => setAmountReq({ line, field })} onEdit={(line) => setEditReq({ line })} onBillRemaining={billRemaining} />
            <div className="lg:hidden">
              <InvoicePanel state={state} calcs={calcs} s={s} lines={state.lines} busy={busy} result={result} trackerId={trackerId} onGenerate={() => void generate(false)} onPaid={() => setPaidOpen(true)} />
            </div>
            <PaymentsSection payments={state.payments} onChange={changePayment} onAdd={addPayment} onRemove={removePayment} />
            <NotesSection
              mode={state.notes.mode}
              text={state.notes.text}
              auto={auto}
              onMode={(mode) => update((prev) => ({ ...prev, notes: { mode, text: mode === 'custom' && !prev.notes.text.trim() ? auto : prev.notes.text } }))}
              onText={(text) => update((prev) => ({ ...prev, notes: { ...prev.notes, text } }))}
            />
            <HistorySection trackerId={trackerId} invoices={invoices} onRestore={restore} busy={busy !== null} />
            <ProjectSection
              trackerId={trackerId}
              project={state.project}
              pending={state.pendingChangeOrders}
              onProject={(patch) => update((prev) => ({ ...prev, project: { ...prev.project, ...patch } }))}
              onPending={(list) => update((prev) => ({ ...prev, pendingChangeOrders: list }))}
            />
          </div>
          <aside className="hidden lg:block sticky top-20">
            <InvoicePanel state={state} calcs={calcs} s={s} lines={state.lines} busy={busy} result={result} trackerId={trackerId} onGenerate={() => void generate(false)} onPaid={() => setPaidOpen(true)} />
          </aside>
        </div>
      </div>

      {/* Phone / tablet: total and the one button that matters, above the tab bar */}
      <div className="lg:hidden fixed inset-x-0 z-30 border-t px-4 py-2.5 flex items-center justify-between gap-3 print:hidden bottom-[calc(56px+env(safe-area-inset-bottom,0px))] md:bottom-0 md:pb-[env(safe-area-inset-bottom,0px)]" style={{ backgroundColor: 'var(--color-background)', borderColor: 'var(--color-stone)' }}>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--color-charcoal-light)' }}>
            Total due
          </div>
          <div className="text-2xl tabular-nums leading-none" style={{ fontFamily: 'var(--font-fraunces)', color: Math.abs(s.totalDue) < 0.005 ? 'var(--color-charcoal-light)' : DUE_RED }}>
            {fmt(s.totalDue)}
          </div>
        </div>
        <button type="button" onClick={() => void generate(false)} disabled={busy !== null} className="px-4 py-3 rounded-xl bg-[var(--color-teal)] text-[var(--color-cream)] font-semibold min-h-[44px] disabled:opacity-60 whitespace-nowrap">
          {busy === 'generate' ? 'Sending…' : 'Save & generate'}
        </button>
      </div>

      {toast ? (
        <div role="status" aria-live="polite" className="fixed left-1/2 -translate-x-1/2 z-40 px-4 py-2.5 rounded-full text-sm shadow-lg max-w-[calc(100vw-32px)] bottom-[calc(132px+env(safe-area-inset-bottom,0px))] lg:bottom-6" style={{ backgroundColor: 'var(--color-teal)', color: 'var(--color-cream)' }}>
          {toast}
        </div>
      ) : null}

      <AmountSheet request={amountReq} onClose={() => setAmountReq(null)} onApply={setAmount} />
      <LineEditorSheet request={editReq} onClose={() => setEditReq(null)} onSave={saveLine} onRemove={removeLine} />
      <PaidSheet open={paidOpen} invoiceNumber={state.invoice.number} totalDue={s.totalDue} billed={s.sumG} busy={busy === 'roll'} onClose={() => setPaidOpen(false)} onSubmit={(input) => void rollForward(input)} />
      <ConfirmSheet request={confirm} onClose={() => setConfirm(null)} />
    </div>
  )
}
