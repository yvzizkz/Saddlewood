import { NextRequest, NextResponse } from 'next/server'

import { authorizeOps } from '@/lib/ops/auth'
import { getInvoiceState, isTrackerId } from '@/lib/trackers/queries'

// One generated invoice's full snapshot (the state the workbook was built from),
// for Restore under Invoice history.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; number: string }> }

export async function GET(request: NextRequest, { params }: Ctx) {
  const who = await authorizeOps(request)
  if (!who) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const { id, number } = await params
  const invoice = decodeURIComponent(number || '').trim().slice(0, 32)
  if (!isTrackerId(id) || !invoice) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
  try {
    const state = await getInvoiceState(id, invoice)
    if (!state) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
    return NextResponse.json({ ok: true, invoice, state })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
