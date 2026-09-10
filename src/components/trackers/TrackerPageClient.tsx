'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { AutosaveIndicator } from '@/components/estimate/AutosaveIndicator'
import type { SaveStatus } from '@/hooks/useAutosave'
import { cents, lineCalc, notesAuto, slug, summary } from '@/lib/trackers/core'
import type { TrackerInvoiceSnapshot, TrackerLine, TrackerRecord, TrackerState } from '@/lib/trackers/types'
import { AmountSheet, type AmountField, type AmountRequest } from './AmountSheet'
import { ConfirmSheet, type ConfirmRequest } from './ConfirmSheet'
import { api, ApiError, DUE_RED, fmt, type ToastTone } from './format'
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

/** The parts of the state that matter for "is this the same document" (meta and the issued stamp are bookkeeping). */
function contentKey(s: TrackerState): string {
  const { meta: _m, invoice, ...rest } = s
  void _m
  const { issuedAt: _i, status: _s, ...inv } = invoice
  void _i
  void _s
  return JSON.stringify({ ...rest, invoice: inv })
}

/**
 * The tracker page. The server hands over the row; from there every edit
 * lands in local state, recomputes the totals, and is saved 0.9 s after the
 * last change. Saves are serialized and carry the row's updated_at, so a
 * second tab (or the agent token) cannot silently overwrite this one.
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
  const [toast, setToast] = useState<{ msg: string; tone: ToastTone } | null>(null)
  const [amountReq, setAmountReq] = useState<AmountRequest | null>(null)
  const [editReq, setEditReq] = useState<{ line: TrackerLine | null } | null>(null)
  const [paidOpen, setPaidOpen] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)

  const stateRef = useRef(state)
  const updatedAtRef = useRef(tracker.updatedAt)
  const dirtyRef = useRef(false)
  const editedDuringFlightRef = useRef(false)
  const inFlightRef = useRef<Promise<boolean> | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const conflictRef = useRef<TrackerRecord | null>(null)
  conflictRef.current = conflict

  const calcs = useMemo(() => state.lines.map(lineCalc), [state.lines])
  const s = useMemo(() => summary(state, calcs), [state, calcs])
  const auto = useMemo(() => notesAuto(state, calcs, s), [state, calcs, s])

  const showToast = useCallback((msg: string, tone: ToastTone = 'info') => {
    setToast({ msg, tone })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), tone === 'error' ? 8000 : 3200)
  }, [])

  const adopt = useCallback((rec: TrackerRecord) => {
    stateRef.current = rec.state
    updatedAtRef.current = rec.updatedAt
    dirtyRef.current = false
    editedDuringFlightRef.current = false
    setState(rec.state)
    setConflict(null)
    setSaveStatus('saved')
    setLastSavedAt(new Date())
  }, [])

  const schedule = useCallback((run: () => void) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      run()
    }, SAVE_DEBOUNCE_MS)
  }, [])

  /** Save now. One request at a time; an edit made while one is out is saved right after. */
  const flush = useCallback(async (): Promise<boolean> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (inFlightRef.current) await inFlightRef.current
    if (!dirtyRef.current) {
      setSaveStatus((st) => (st === 'error' ? 'idle' : st))
      return true
    }
    if (conflictRef.current) return false
    const run = (async () => {
      dirtyRef.current = false
      editedDuringFlightRef.current = false
      setSaveStatus('saving')
      const snapshot = stateRef.current
      try {
        const json = await api<{ tracker: TrackerRecord }>(`/api/trackers/${trackerId}`, {
          method: 'PUT',
          body: JSON.stringify({ state: snapshot, baseUpdatedAt: updatedAtRef.current }),
        })
        updatedAtRef.current = json.tracker.updatedAt
        setLastSavedAt(new Date())
        setSaveStatus('saved')
        return true
      } catch (e) {
        if (e instanceof ApiError && e.status === 409 && e.data.tracker) {
          const remote = e.data.tracker as TrackerRecord
          if (contentKey(remote.state) === contentKey(snapshot)) {
            // Our own earlier save landed first; nothing was lost.
            updatedAtRef.current = remote.updatedAt
            setLastSavedAt(new Date())
            setSaveStatus('saved')
            return true
          }
          dirtyRef.current = true
          setConflict(remote)
          setSaveStatus('error')
          return false
        }
        dirtyRef.current = true
        setSaveStatus('error')
        if (e instanceof ApiError && e.status === 400) showToast(`Not saved: ${e.message}`, 'error')
        return false
      }
    })()
    inFlightRef.current = run
    try {
      return await run
    } finally {
      inFlightRef.current = null
      if (editedDuringFlightRef.current && dirtyRef.current && !conflictRef.current) schedule(() => void flush())
    }
  }, [schedule, showToast, trackerId])

  const update = useCallback(
    (fn: (prev: TrackerState) => TrackerState) => {
      let next = fn(stateRef.current)
      if (next === stateRef.current) return
      // Any change after an invoice was generated makes it a draft again.
      if (next.invoice.status === 'issued') {
        const { issuedAt: _dropped, ...inv } = next.invoice
        void _dropped
        next = { ...next, invoice: { ...inv, status: 'draft' } }
      }
      stateRef.current = next
      setState(next)
      dirtyRef.current = true
      if (inFlightRef.current) editedDuringFlightRef.current = true
      schedule(() => void flush())
    },
    [flush, schedule],
  )

  // Edits still inside the debounce window are sent when the page is hidden,
  // closed, or navigated away from (keepalive survives the unload).
  useEffect(() => {
    const send = () => {
      if (!dirtyRef.current || conflictRef.current) return
      try {
        void fetch(`/api/trackers/${trackerId}`, {
          method: 'PUT',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: stateRef.current, baseUpdatedAt: updatedAtRef.current }),
        })
        dirtyRef.current = false
      } catch {
        // nothing more to do on the way out
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') send()
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault()
    }
    window.addEventListener('pagehide', send)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('beforeunload', onBeforeUnload)
    const timers = { save: timerRef, toast: toastTimer }
    return () => {
      window.removeEventListener('pagehide', send)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('beforeunload', onBeforeUnload)
      if (timers.save.current) clearTimeout(timers.save.current)
      if (timers.toast.current) clearTimeout(timers.toast.current)
      send()
    }
  }, [trackerId])

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
      if (stateRef.current.lines.length <= 1) {
        showToast('The schedule needs at least one line.', 'error')
        return
      }
      setConfirm({
        title: `Remove ${line.name}?`,
        body: 'The line and its amounts leave the schedule of values. You can add it back later.',
        confirmLabel: 'Remove',
        danger: true,
        onConfirm: () => update((prev) => (prev.lines.length > 1 ? { ...prev, lines: prev.lines.filter((l) => l.id !== lineId) } : prev)),
      })
    },
    [update, showToast],
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
      if (!stateRef.current.invoice.number.trim()) {
        showToast('Give the invoice a number first.', 'error')
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
            body:
              e.code === 'over'
                ? `${e.message}. A line is capped at its contract value on the workbook, so the amount above what is left will not reach Total due — add a change order to the line instead, or generate anyway.`
                : `${e.message} Generate anyway?`,
            confirmLabel: 'Generate anyway',
            onConfirm: () => void generate(true),
          })
        } else if (e instanceof ApiError && e.status === 409 && e.data.tracker) {
          setConflict(e.data.tracker as TrackerRecord)
        } else {
          showToast((e as Error).message, 'error')
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
        else showToast((e as Error).message, 'error')
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
            showToast((e as Error).message, 'error')
          }
        },
      })
    },
    [trackerId, update, showToast],
  )

  const keepMine = useCallback(() => {
    if (!conflict) return
    updatedAtRef.current = conflict.updatedAt
    dirtyRef.current = true
    setConflict(null)
    void flush()
  }, [conflict, flush])

  const onInvoiceField = (key: 'number' | 'date', value: string) => update((prev) => ({ ...prev, invoice: { ...prev.invoice, [key]: value.slice(0, key === 'number' ? 32 : 24) } }))
  const issued = state.invoice.status === 'issued'
  const changedSinceIssue = !issued
  const busyNow = busy !== null

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      <div className="sticky top-0 z-10 border-b print:hidden" style={{ backgroundColor: 'var(--color-background)', borderColor: 'var(--color-stone)' }}>
        <div className="flex items-center justify-between gap-3 px-4 py-3 min-h-[44px] max-w-7xl mx-auto md:px-8">
          <Link href="/internal/trackers" className="flex items-center gap-2 text-[var(--color-charcoal)] font-medium min-w-0 min-h-[44px]">
            <span aria-hidden="true">{'←'}</span>
            <span style={{ fontFamily: 'var(--font-fraunces)' }} className="text-base uppercase tracking-wide truncate">
              {state.project.name}
            </span>
          </Link>
          <AutosaveIndicator status={saveStatus} lastSavedAt={lastSavedAt} onRetry={() => void flush()} />
        </div>
      </div>

      <div className="px-4 pt-5 md:px-8 md:pt-8 max-w-7xl mx-auto pb-[calc(150px+env(safe-area-inset-bottom,0px))] 2xl:pb-16">
        {conflict ? (
          <div className="mb-4 rounded-lg border px-4 py-3 text-sm flex flex-wrap items-center gap-3" style={{ borderColor: DUE_RED, color: 'var(--color-charcoal)', backgroundColor: 'rgba(162,59,42,0.08)' }} role="alert">
            <span className="flex-1 min-w-[200px]">
              This tracker was saved elsewhere{conflict.updatedBy ? ` by ${conflict.updatedBy.split('@')[0]}` : ''} after you opened it, and your latest edit differs from it. Load that version, or keep yours and overwrite it.
            </span>
            <button type="button" onClick={() => adopt(conflict)} className="px-3 py-2 rounded-lg text-[var(--color-cream)] font-semibold min-h-[44px]" style={{ backgroundColor: 'var(--color-teal)' }}>
              Load latest
            </button>
            <button type="button" onClick={keepMine} className="px-3 py-2 rounded-lg border font-semibold min-h-[44px]" style={{ borderColor: 'var(--color-stone-mid)', color: 'var(--color-charcoal)' }}>
              Keep mine
            </button>
          </div>
        ) : null}

        {/* Everything below is read-only while a workbook is being generated or a payment recorded. */}
        <fieldset disabled={busyNow} className="contents">
          <header className="flex flex-wrap items-end justify-between gap-4 mb-5">
            <div className="min-w-0">
              <p className="text-[11px] tracking-[0.14em] uppercase mb-1 flex items-center gap-2" style={{ color: 'var(--color-gold-accessible)' }}>
                Progress payment tracker
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-[0.08em]" style={issued ? { backgroundColor: 'rgba(47,107,74,0.14)', color: '#2f6b4a' } : { backgroundColor: 'rgba(212,175,55,0.22)', color: '#7a5d16' }}>
                  {issued ? 'ISSUED' : 'DRAFT'}
                </span>
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
                  className="w-[112px] rounded-lg border px-3 py-2.5 bg-white text-base md:text-sm tabular-nums text-[var(--color-charcoal)] outline-none focus:border-[var(--color-teal)] min-h-[44px] md:min-h-[40px]"
                  style={{ borderColor: 'var(--color-stone)' }}
                  value={state.invoice.number}
                  onChange={(e) => onInvoiceField('number', e.target.value)}
                  maxLength={32}
                />
              </label>
              <label className="flex flex-col gap-1 text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--color-charcoal-light)' }}>
                Invoice date
                <input
                  className="w-[124px] rounded-lg border px-3 py-2.5 bg-white text-base md:text-sm tabular-nums text-[var(--color-charcoal)] outline-none focus:border-[var(--color-teal)] min-h-[44px] md:min-h-[40px]"
                  style={{ borderColor: 'var(--color-stone)' }}
                  value={state.invoice.date}
                  placeholder="MM/DD/YYYY"
                  onChange={(e) => onInvoiceField('date', e.target.value)}
                  maxLength={24}
                />
              </label>
            </div>
          </header>

          <TrackerKpis s={s} paymentsCount={state.payments.length} />

          <div className="mt-5 2xl:grid 2xl:grid-cols-[minmax(0,1fr)_300px] 2xl:gap-6 2xl:items-start">
            <div className="flex flex-col gap-5">
              <LinesSection lines={state.lines} calcs={calcs} s={s} onAmount={setAmount} onOpenAmount={(line, field) => setAmountReq({ line, field })} onEdit={(line) => setEditReq({ line })} onBillRemaining={billRemaining} />
              <div className="2xl:hidden">
                <InvoicePanel state={state} calcs={calcs} s={s} lines={state.lines} busy={busy} result={result} trackerId={trackerId} showGenerate={false} onGenerate={() => void generate(false)} onPaid={() => setPaidOpen(true)} />
              </div>
              <PaymentsSection payments={state.payments} onChange={changePayment} onAdd={addPayment} onRemove={removePayment} />
              <NotesSection
                mode={state.notes.mode}
                text={state.notes.text}
                auto={auto}
                onMode={(mode) => update((prev) => ({ ...prev, notes: { mode, text: mode === 'custom' && !prev.notes.text.trim() ? auto : prev.notes.text } }))}
                onText={(text) => update((prev) => ({ ...prev, notes: { ...prev.notes, text } }))}
              />
              <HistorySection trackerId={trackerId} invoices={invoices} onRestore={restore} busy={busyNow} />
              <ProjectSection
                trackerId={trackerId}
                project={state.project}
                pending={state.pendingChangeOrders}
                onProject={(patch) => update((prev) => ({ ...prev, project: { ...prev.project, ...patch } }))}
                onPending={(list) => update((prev) => ({ ...prev, pendingChangeOrders: list }))}
              />
            </div>
            <aside className="hidden 2xl:block sticky top-20">
              <InvoicePanel state={state} calcs={calcs} s={s} lines={state.lines} busy={busy} result={result} trackerId={trackerId} showGenerate onGenerate={() => void generate(false)} onPaid={() => setPaidOpen(true)} />
            </aside>
          </div>
        </fieldset>
      </div>

      {/* Phone / tablet / laptop: the total and the one button that matters, above the tab bar */}
      <div className="2xl:hidden fixed inset-x-0 z-30 border-t px-4 py-2.5 flex items-center justify-between gap-3 print:hidden bottom-[calc(57px+env(safe-area-inset-bottom,0px))] md:bottom-0 md:pb-[calc(10px+env(safe-area-inset-bottom,0px))]" style={{ backgroundColor: 'var(--color-background)', borderColor: 'var(--color-stone)' }}>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--color-charcoal-light)' }}>
            Total due
          </div>
          <div className="text-2xl tabular-nums leading-none" style={{ fontFamily: 'var(--font-fraunces)', color: Math.abs(s.totalDue) < 0.005 ? 'var(--color-charcoal-light)' : DUE_RED }}>
            {fmt(s.totalDue)}
          </div>
        </div>
        <button type="button" onClick={() => void generate(false)} disabled={busyNow} className="px-4 py-3 rounded-xl bg-[var(--color-teal)] text-[var(--color-cream)] font-semibold min-h-[48px] disabled:opacity-60 whitespace-nowrap">
          {busy === 'generate' ? 'Sending…' : 'Save & generate'}
        </button>
      </div>

      {toast ? (
        <div className="fixed inset-x-4 z-40 flex justify-center pointer-events-none bottom-[calc(140px+env(safe-area-inset-bottom,0px))] md:bottom-24 2xl:bottom-6">
          <button
            type="button"
            role="status"
            aria-live="polite"
            onClick={() => setToast(null)}
            className="pointer-events-auto max-w-full w-fit rounded-2xl px-4 py-2.5 text-sm text-center shadow-lg"
            style={{ backgroundColor: toast.tone === 'error' ? DUE_RED : 'var(--color-teal)', color: 'var(--color-cream)' }}
          >
            {toast.msg}
          </button>
        </div>
      ) : null}

      <AmountSheet request={amountReq} onClose={() => setAmountReq(null)} onApply={setAmount} />
      <LineEditorSheet request={editReq} canRemove={state.lines.length > 1} onClose={() => setEditReq(null)} onSave={saveLine} onRemove={removeLine} />
      <PaidSheet open={paidOpen} invoiceNumber={state.invoice.number} totalDue={s.totalDue} billed={s.sumG} changedSinceIssue={changedSinceIssue} busy={busy === 'roll'} onClose={() => setPaidOpen(false)} onSubmit={(input) => void rollForward(input)} />
      <ConfirmSheet request={confirm} onClose={() => setConfirm(null)} />
    </div>
  )
}
