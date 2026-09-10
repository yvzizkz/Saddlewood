import { NextRequest, NextResponse } from 'next/server'

import { authorizeOps } from '@/lib/ops/auth'
import { rollForward, todayStr } from '@/lib/trackers/core'
import { getTracker, isTrackerId, listInvoices, saveInvoiceSnapshot, saveTracker, StaleTrackerError } from '@/lib/trackers/queries'
import { rollForwardSchema } from '@/lib/trackers/types'

// The owner paid the current invoice: record the payment, fold this invoice's
// progress and draws into completed work, and open the next invoice number.
// The numbers being rolled are kept under Invoice history: untouched if they
// were generated from the portal and not edited since (status 'issued'),
// otherwise written as 'superseded' so History shows what was actually paid.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: Ctx) {
  const who = await authorizeOps(request)
  if (!who) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  if (!isTrackerId(id)) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 })
  }
  const parsed = rollForwardSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }, { status: 400 })
  }
  try {
    const tracker = await getTracker(id)
    if (!tracker) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
    if (parsed.data.baseUpdatedAt && parsed.data.baseUpdatedAt !== tracker.updatedAt) {
      return NextResponse.json({ ok: false, error: 'stale', tracker }, { status: 409 })
    }
    const before = tracker.state
    const invoices = await listInvoices(id)
    const existing = invoices.find((s) => s.invoiceNumber === before.invoice.number)
    if (!existing || before.invoice.status !== 'issued') {
      await saveInvoiceSnapshot({ trackerId: id, state: before, actor: who.actor, status: 'superseded', sentTo: existing?.sentTo ?? null, emailId: existing?.emailId ?? null })
    }
    const next = rollForward(before, parsed.data, todayStr())
    const saved = await saveTracker(id, next, who.actor, tracker.updatedAt)
    return NextResponse.json({ ok: true, tracker: saved, invoices: await listInvoices(id), from: before.invoice.number, by: who.actor })
  } catch (e) {
    if (e instanceof StaleTrackerError) {
      return NextResponse.json({ ok: false, error: 'stale', tracker: e.current }, { status: 409 })
    }
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
