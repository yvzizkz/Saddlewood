import { NextRequest, NextResponse } from 'next/server'

import { authorizeOps } from '@/lib/ops/auth'
import { workbookFilename } from '@/lib/trackers/core'
import { getInvoiceState, getTracker, isTrackerId } from '@/lib/trackers/queries'
import { workbookBuffer, XLSX_MIME } from '@/lib/trackers/workbook'

// The workbook as a download: the live state, or ?invoice=<number> for the
// snapshot kept when that invoice was generated.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Ctx) {
  const who = await authorizeOps(request)
  if (!who) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  if (!isTrackerId(id)) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
  const invoice = (new URL(request.url).searchParams.get('invoice') || '').trim().slice(0, 32)
  try {
    let state = null
    if (invoice) state = await getInvoiceState(id, invoice)
    else state = (await getTracker(id))?.state ?? null
    if (!state) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
    const buffer = await workbookBuffer(state)
    const base = workbookFilename(state).replace(/\.xlsx$/, '')
    const name = invoice ? `${base}_${invoice.replace(/[^A-Za-z0-9-]/g, '_')}.xlsx` : `${base}.xlsx`
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': XLSX_MIME,
        'Content-Disposition': `attachment; filename="${name}"`,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
