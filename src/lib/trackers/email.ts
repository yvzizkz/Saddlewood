import { renderNotificationEmail, type EmailRow } from '@/lib/emailTemplate'

import { lineCalc, money, money2, pctStr, summary, type TrackerSummary } from './core'
import type { TrackerState } from './types'

// The email that carries the generated workbook to Marco (or whoever generated
// it) so it can be forwarded to the owners from his own mailbox.

export type TrackerEmail = { subject: string; html: string; text: string }

export function buildTrackerEmail(state: TrackerState, opts: { portalUrl: string; generatedBy: string; filename: string }): TrackerEmail {
  const calcs = state.lines.map(lineCalc)
  const s: TrackerSummary = summary(state, calcs)
  const inv = state.invoice
  const billed: string[] = []
  state.lines.forEach((l, i) => {
    if (calcs[i].cp > 0) billed.push(`${l.name} ${money(calcs[i].cp)}`)
    if (calcs[i].draw > 0) billed.push(`${l.name} ${money(calcs[i].draw)} draw`)
  })
  const carry = s.totalDue - s.sumG
  if (Math.abs(carry) > 0.005) billed.push((carry > 0 ? 'prior balance ' : 'credit ') + money2(carry))

  const subject = `${state.project.name} — Progress Payment Tracker #${inv.number} (${money2(s.totalDue)} due)`
  const ofWhich = [s.balance > 0.005 ? `${money2(s.balance)} on completed work` : '', s.draws > 0.005 ? `${money2(s.draws)} advance draws` : ''].filter(Boolean).join(' + ')
  const rows: EmailRow[] = [
    { label: 'Invoice', value: `#${inv.number} · ${inv.date}` },
    { label: 'Total due', value: money2(s.totalDue) },
    { label: 'Of which', value: ofWhich },
    { label: 'Billed this invoice', value: billed.length ? billed.join(' · ') : 'Nothing billed' },
    { label: 'Paid to date', value: `${money2(s.paid)} (${state.payments.length} ${state.payments.length === 1 ? 'payment' : 'payments'})` },
    { label: 'Performed to date', value: `${money2(s.performed)} · ${pctStr(s.pct)} of ${money2(s.contract)}` },
    { label: 'Remaining', value: money2(s.remaining) },
    { label: 'Owners', value: state.project.owners },
  ]
  const intro = `The tracker workbook for invoice #${inv.number} is attached (${opts.filename}), built from the numbers saved in the portal a moment ago. Open it in Numbers or Excel to check it over, then forward the attachment (not this email) to ${state.project.owners || 'the owners'}.`
  const footerNote = `Generated from the Saddlewood Portal by ${opts.generatedBy}. Edit the tracker at ${opts.portalUrl}. The workbook is also kept under Invoice history there.`
  const html = renderNotificationEmail({
    eyebrow: 'Progress payment tracker',
    heading: `${state.project.name} · Invoice #${inv.number}`,
    intro,
    rows,
    noteLabel: 'Attached',
    noteText: `${opts.filename} — the same layout, colours, and formulas as the trackers sent before.`,
    footerNote,
  })
  const text = [
    `${state.project.name} — Progress Payment Tracker #${inv.number}`,
    '',
    intro,
    '',
    ...rows.map((r) => `${r.label}: ${r.value}`),
    '',
    footerNote,
  ].join('\n')
  return { subject, html, text }
}
