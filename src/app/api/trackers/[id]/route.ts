import { NextRequest, NextResponse } from 'next/server'

import { authorizeOps } from '@/lib/ops/auth'
import { getTracker, isTrackerId, listInvoices, saveTracker, StaleTrackerError } from '@/lib/trackers/queries'
import { saveTrackerSchema } from '@/lib/trackers/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Ctx) {
  const who = await authorizeOps(request)
  if (!who) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  if (!isTrackerId(id)) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
  try {
    const tracker = await getTracker(id)
    if (!tracker) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
    const invoices = await listInvoices(id)
    return NextResponse.json({ ok: true, tracker, invoices })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}

/** Save the live state. 409 (with the current row) when someone else saved first. */
export async function PUT(request: NextRequest, { params }: Ctx) {
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
  const parsed = saveTrackerSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }, { status: 400 })
  }
  try {
    const tracker = await saveTracker(id, parsed.data.state, who.actor, parsed.data.baseUpdatedAt)
    return NextResponse.json({ ok: true, tracker })
  } catch (e) {
    if (e instanceof StaleTrackerError) {
      return NextResponse.json({ ok: false, error: 'stale', tracker: e.current }, { status: 409 })
    }
    const msg = (e as Error).message
    return NextResponse.json({ ok: false, error: msg }, { status: msg === 'not found' ? 404 : 500 })
  }
}
