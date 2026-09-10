import { NextRequest, NextResponse } from 'next/server'

import { authorizeOps } from '@/lib/ops/auth'
import { listTrackers } from '@/lib/trackers/queries'

// Progress payment trackers: one per residential job. People reach these with
// their portal session; the bot and Claude sessions with OPS_AGENT_TOKEN.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const who = await authorizeOps(request)
  if (!who) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  try {
    const trackers = await listTrackers()
    return NextResponse.json({ ok: true, trackers })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
