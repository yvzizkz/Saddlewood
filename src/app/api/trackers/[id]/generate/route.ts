import { NextRequest, NextResponse } from 'next/server'

import { SITE_URL, sendEmail } from '@/lib/auth/magicLink'
import { isAllowedEmail, normalizeEmail } from '@/lib/ops/allowlist'
import { authorizeOps } from '@/lib/ops/auth'
import { lineCalc, normalizeState, overBilledLines, summary, unpricedBilledLines, workbookFilename } from '@/lib/trackers/core'
import { buildTrackerEmail } from '@/lib/trackers/email'
import { getTracker, isTrackerId, saveInvoiceSnapshot, saveTracker, StaleTrackerError } from '@/lib/trackers/queries'
import { generateSchema } from '@/lib/trackers/types'
import { workbookBuffer, XLSX_MIME } from '@/lib/trackers/workbook'

// "Save & generate": persist the numbers, build the client workbook, email it
// to the person who generated it (Marco forwards it to the owners from his own
// mailbox), keep a snapshot under Invoice history, and mark the invoice issued.
// Nothing is written until the guards pass; nothing is marked issued until the
// email has gone.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

function defaultRecipient(actor: string, via: 'session' | 'token'): string | null {
  if (via === 'session' && actor.includes('@')) return normalizeEmail(actor)
  const marco = normalizeEmail(process.env.MARCO_EMAIL)
  return marco || null
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const who = await authorizeOps(request)
  if (!who) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  if (!isTrackerId(id)) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
  let body: unknown = {}
  try {
    const raw = await request.text()
    body = raw.trim() ? JSON.parse(raw) : {}
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 })
  }
  const parsed = generateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }, { status: 400 })
  }
  const input = parsed.data

  try {
    let tracker = await getTracker(id)
    if (!tracker) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
    if (input.baseUpdatedAt && input.baseUpdatedAt !== tracker.updatedAt) {
      return NextResponse.json({ ok: false, error: 'stale', tracker }, { status: 409 })
    }

    // Guards run on what would be generated, before anything is written.
    const candidate = input.state ? normalizeState(input.state) : tracker.state
    const calcs = candidate.lines.map(lineCalc)
    const s = summary(candidate, calcs)
    if (!candidate.invoice.number) return NextResponse.json({ ok: false, error: 'Give the invoice a number first.' }, { status: 400 })
    const unpriced = unpricedBilledLines(candidate, calcs)
    if (unpriced.length) {
      return NextResponse.json({ ok: false, code: 'unpriced', error: `Price these lines before billing them: ${unpriced.map((l) => l.name).join(', ')}` }, { status: 400 })
    }
    if (!input.force) {
      const over = overBilledLines(candidate, calcs)
      if (over.length) {
        return NextResponse.json({ ok: false, code: 'over', error: `These lines bill more than their remaining value: ${over.map((l) => l.name).join(', ')}`, lines: over.map((l) => l.id) }, { status: 409 })
      }
      if (Math.abs(s.totalDue) < 0.005) {
        return NextResponse.json({ ok: false, code: 'zero_due', error: 'Nothing is due on this invoice.' }, { status: 409 })
      }
    }

    // Recipients: whoever generated it, plus any allowlisted extras.
    const primary = defaultRecipient(who.actor, who.via)
    const extras = (input.to ?? []).map(normalizeEmail).filter((e) => e && e !== primary && isAllowedEmail(e))
    const rejected = (input.to ?? []).map(normalizeEmail).filter((e) => e && e !== primary && !isAllowedEmail(e))
    if (rejected.length) return NextResponse.json({ ok: false, error: `Not on the allowlist: ${rejected.join(', ')}` }, { status: 403 })
    if (input.send && !primary) return NextResponse.json({ ok: false, error: 'No recipient: sign in, or set MARCO_EMAIL.' }, { status: 400 })

    if (input.state) tracker = await saveTracker(id, input.state, who.actor, input.baseUpdatedAt)
    const state = tracker.state

    // Build and send first; only then mark the invoice issued and keep the
    // snapshot, so a failed send leaves nothing half-done.
    const issued = { ...state, invoice: { ...state.invoice, status: 'issued' as const, issuedAt: new Date().toISOString() } }
    const filename = workbookFilename(issued)
    const buffer = await workbookBuffer(issued)

    let emailId: string | null = null
    let sentTo: string[] = []
    if (input.send && primary) {
      const portalUrl = `${SITE_URL}/internal/trackers/${id}`
      const mail = buildTrackerEmail(issued, { portalUrl, generatedBy: who.actor, filename })
      const res = await sendEmail({
        to: primary,
        cc: extras,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        attachments: [{ filename, content: buffer.toString('base64'), contentType: XLSX_MIME }],
      })
      emailId = res.id
      sentTo = [primary, ...extras]
    }

    tracker = await saveTracker(id, issued, who.actor)
    const snapshot = await saveInvoiceSnapshot({ trackerId: id, state: tracker.state, actor: who.actor, status: 'issued', sentTo: sentTo.join(', ') || null, emailId })
    return NextResponse.json({
      ok: true,
      tracker,
      snapshot,
      invoice: { number: tracker.state.invoice.number, date: tracker.state.invoice.date, totalDue: s.totalDue },
      filename,
      sentTo,
      emailId,
      download: `/api/trackers/${id}/workbook?invoice=${encodeURIComponent(tracker.state.invoice.number)}`,
      by: who.actor,
    })
  } catch (e) {
    if (e instanceof StaleTrackerError) {
      return NextResponse.json({ ok: false, error: 'stale', tracker: e.current }, { status: 409 })
    }
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
