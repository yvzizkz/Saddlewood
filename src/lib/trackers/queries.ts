import { getSupabaseAdmin } from '@/lib/supabase/admin'

import { cents, lineCalc, normalizeState, summary } from './core'
import type { TrackerInvoiceSnapshot, TrackerListRow, TrackerRecord, TrackerState } from './types'

// All reads and writes go through the service-role client after the route has
// authorized the actor (lib/ops/auth). The tables carry RLS with no policies,
// so nothing reaches them from the anon key. Migration 0008.

type Row = {
  id: string
  project_name: string
  invoice_number: string
  state: unknown
  updated_by: string | null
  updated_at: string
  created_at: string
}

type InvoiceRow = {
  id: number
  tracker_id: string
  invoice_number: string
  invoice_date: string
  total_due: string | number
  status: string
  generated_by: string | null
  sent_to: string | null
  email_id: string | null
  created_at: string
  generated_at?: string | null
}

const INVOICE_COLS = 'id, tracker_id, invoice_number, invoice_date, total_due, status, generated_by, sent_to, email_id, created_at, generated_at'

function toRecord(r: Row): TrackerRecord {
  return {
    id: r.id,
    projectName: r.project_name,
    invoiceNumber: r.invoice_number,
    state: normalizeState(r.state),
    updatedBy: r.updated_by ?? '',
    updatedAt: r.updated_at,
    createdAt: r.created_at,
  }
}

function toSnapshot(r: InvoiceRow): TrackerInvoiceSnapshot {
  return {
    id: r.id,
    trackerId: r.tracker_id,
    invoiceNumber: r.invoice_number,
    invoiceDate: r.invoice_date,
    totalDue: Number(r.total_due) || 0,
    status: r.status === 'superseded' ? 'superseded' : 'issued',
    generatedBy: r.generated_by ?? '',
    sentTo: r.sent_to,
    emailId: r.email_id,
    createdAt: r.created_at,
    generatedAt: r.generated_at ?? r.created_at,
  }
}

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

export function isTrackerId(id: string): boolean {
  return ID_RE.test(id)
}

export async function listTrackers(): Promise<TrackerListRow[]> {
  const db = getSupabaseAdmin()
  const { data, error } = await db.from('progress_trackers').select('*').order('project_name', { ascending: true })
  if (error) throw new Error(`progress_trackers select failed: ${error.message}`)
  return ((data ?? []) as Row[]).map((r) => {
    const rec = toRecord(r)
    const s = summary(rec.state)
    const { state: _state, ...rest } = rec
    void _state
    return { ...rest, totalDue: cents(s.totalDue), percentComplete: s.pct }
  })
}

export async function getTracker(id: string): Promise<TrackerRecord | null> {
  if (!isTrackerId(id)) return null
  const db = getSupabaseAdmin()
  const { data, error } = await db.from('progress_trackers').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`progress_trackers select failed: ${error.message}`)
  return data ? toRecord(data as Row) : null
}

/** Thrown when the row changed since the client last loaded it; carries the current row. */
export class StaleTrackerError extends Error {
  current: TrackerRecord
  constructor(current: TrackerRecord) {
    super('stale')
    this.name = 'StaleTrackerError'
    this.current = current
  }
}

/**
 * Replace the live state. With `baseUpdatedAt`, the write only lands if the row
 * still carries that updated_at (one editor at a time; a second tab loses and
 * gets the current row back to reconcile).
 */
export async function saveTracker(id: string, input: TrackerState, actor: string, baseUpdatedAt?: string): Promise<TrackerRecord> {
  if (!isTrackerId(id)) throw new Error('bad tracker id')
  const db = getSupabaseAdmin()
  const state = normalizeState({ ...input, meta: { updatedAt: new Date().toISOString(), updatedBy: actor } })
  const patch = { project_name: state.project.name, invoice_number: state.invoice.number, state, updated_by: actor }
  let q = db.from('progress_trackers').update(patch).eq('id', id)
  if (baseUpdatedAt) q = q.eq('updated_at', baseUpdatedAt)
  const { data, error } = await q.select('*').maybeSingle()
  if (error) throw new Error(`progress_trackers update failed: ${error.message}`)
  if (!data) {
    const current = await getTracker(id)
    if (!current) throw new Error('not found')
    throw new StaleTrackerError(current)
  }
  return toRecord(data as Row)
}

export async function listInvoices(trackerId: string): Promise<TrackerInvoiceSnapshot[]> {
  if (!isTrackerId(trackerId)) return []
  const db = getSupabaseAdmin()
  const { data, error } = await db
    .from('progress_tracker_invoices')
    .select(INVOICE_COLS)
    .eq('tracker_id', trackerId)
    .order('generated_at', { ascending: false })
    .limit(200)
  if (error) throw new Error(`progress_tracker_invoices select failed: ${error.message}`)
  return ((data ?? []) as InvoiceRow[]).map(toSnapshot)
}

export async function getInvoiceState(trackerId: string, invoiceNumber: string): Promise<TrackerState | null> {
  if (!isTrackerId(trackerId)) return null
  const db = getSupabaseAdmin()
  const { data, error } = await db
    .from('progress_tracker_invoices')
    .select('state')
    .eq('tracker_id', trackerId)
    .eq('invoice_number', invoiceNumber)
    .maybeSingle()
  if (error) throw new Error(`progress_tracker_invoices select failed: ${error.message}`)
  return data ? normalizeState((data as { state: unknown }).state) : null
}

export async function saveInvoiceSnapshot(input: {
  trackerId: string
  state: TrackerState
  actor: string
  status?: 'issued' | 'superseded'
  sentTo?: string | null
  emailId?: string | null
}): Promise<TrackerInvoiceSnapshot> {
  const { trackerId, state, actor } = input
  if (!isTrackerId(trackerId)) throw new Error('bad tracker id')
  const s = summary(state, state.lines.map(lineCalc))
  const db = getSupabaseAdmin()
  const row = {
    tracker_id: trackerId,
    invoice_number: state.invoice.number,
    invoice_date: state.invoice.date,
    total_due: cents(s.totalDue),
    status: input.status ?? 'issued',
    state,
    generated_by: actor,
    sent_to: input.sentTo ?? null,
    email_id: input.emailId ?? null,
    generated_at: new Date().toISOString(),
  }
  const { data, error } = await db
    .from('progress_tracker_invoices')
    .upsert(row, { onConflict: 'tracker_id,invoice_number' })
    .select(INVOICE_COLS)
    .single()
  if (error) throw new Error(`progress_tracker_invoices upsert failed: ${error.message}`)
  return toSnapshot(data as InvoiceRow)
}
