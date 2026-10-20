import type { Tone } from '@/components/bot/ui'
import type { IssuedProposal, Opportunity, SalesEvent } from '@/lib/sales/types'
import { daysSince } from '@/lib/sales/pipeline'
import { KINDS, LOST_REASONS, SOURCES, stageInfo } from '@/lib/sales/types'
import { shortDay, usd } from '../format'

// How a proposal, a stage or a timeline line reads on the Sales screens. Kept
// apart from the screens so the wording is tested and the same everywhere.

/** One chip for where a proposal stands: accepted, opened, or not yet. */
export function proofChip(p: IssuedProposal | null): { tone: Tone; text: string } | null {
  if (!p) return null
  if (p.status === 'void') return { tone: 'quiet', text: 'Withdrawn' }
  if (p.accepted) return { tone: 'ok', text: 'Accepted' }
  if (p.views > 0) return { tone: 'ok', text: p.views === 1 ? 'Viewed' : `Viewed ${p.views}×` }
  return { tone: 'warn', text: 'Not opened' }
}

/**
 * Where a proposal's signatures stand, as chips: who has signed and who still
 * has to. Nothing when the proposal asks for no signature.
 */
export function signatureChips(p: IssuedProposal): { tone: Tone; text: string }[] {
  if (p.signing === 'none' || p.status === 'void') return []
  if (p.executed) return [{ tone: 'ok', text: 'Fully signed' }]
  const client = p.signatures.find((x) => x.role === 'client')
  const company = p.signatures.find((x) => x.role === 'company')
  const out: { tone: Tone; text: string }[] = []
  out.push(client ? { tone: 'ok', text: `Client signed ${shortDay(client.at)}` } : { tone: 'warn', text: 'Awaiting client signature' })
  if (p.signing === 'both') out.push(company ? { tone: 'ok', text: 'Countersigned' } : { tone: client ? 'bad' : 'quiet', text: 'Awaiting our signature' })
  return out
}

/** The company still has to countersign this proposal. */
export function needsCountersign(p: IssuedProposal): boolean {
  return p.status === 'issued' && p.signing === 'both' && !p.signatures.some((x) => x.role === 'company')
}

export const kindLabel = (k: Opportunity['kind']) => KINDS.find((x) => x.key === k)?.label ?? k
export const sourceLabel = (s: Opportunity['source']) => SOURCES.find((x) => x.key === s)?.label ?? s
export const lostLabel = (r: string) => LOST_REASONS.find((x) => x.key === r)?.label ?? r

/** Who we talk to, in one line: "Ryan Ottersberg · Visual Expression". */
export function contactLine(o: Pick<Opportunity, 'contact'>): string {
  return [o.contact.name, o.contact.company].filter((s) => s && s.trim()).join(' · ')
}

/** What a timeline line says, in words. */
export function eventText(e: SalesEvent): string {
  const d = e.detail
  switch (e.kind) {
    case 'created':
      return 'Started tracking'
    case 'stage': {
      const to = stageInfo(String(d.to) as Opportunity['stage']).label
      const reason = typeof d.reason === 'string' && d.reason ? ` (${lostLabel(d.reason)})` : ''
      return `Moved to ${to}${reason}${e.text ? `: ${e.text}` : ''}`
    }
    case 'estimate':
      return `Estimate started: ${typeof d.name === 'string' ? d.name : `version ${d.version ?? ''}`}`
    case 'issued': {
      const total = Number(d.totalCents)
      return `Proposal sent, rev ${d.revision ?? 1}${Number.isFinite(total) && total > 0 ? `, ${usd(total, { whole: true })}` : ''}`
    }
    case 'viewed':
      return 'Client opened the proposal'
    case 'accepted': {
      const total = Number(d.totalCents)
      return `Accepted ${typeof d.packageName === 'string' ? d.packageName : ''}${Number.isFinite(total) && total > 0 ? ` at ${usd(total)}` : ''}`.replace(/\s+/g, ' ')
    }
    case 'signed': {
      const name = typeof d.name === 'string' && d.name ? d.name : d.role === 'company' ? 'Saddlewood' : 'The client'
      return d.role === 'company' ? `Countersigned by ${name}` : `Signed by ${name}`
    }
    case 'emailed': {
      const to = Array.isArray(d.to) ? (d.to as unknown[]).filter((x) => typeof x === 'string').join(', ') : ''
      const how = [d.link ? 'link' : '', d.attachPdf ? 'PDF' : ''].filter(Boolean).join(' + ')
      const what = typeof d.what === 'string' && d.what ? d.what : 'Proposal emailed'
      return `${what}${to ? ` to ${to}` : ''}${how ? ` (${how})` : ''}`
    }
    case 'job':
      if (d.award) return e.text || 'Awarded'
      return d.created ? 'Job opened' : 'Linked to an existing job'
    case 'field':
      return `From ${typeof d.by === 'string' ? d.by : 'the crew'}: ${e.text}`
    default:
      return e.text
  }
}

/** "Lead · 4d" — the stage and how long it has sat there. */
export function stageAge(o: Pick<Opportunity, 'stage' | 'stageAt'>, today: string): string {
  const days = Math.max(0, daysSince(o.stageAt, today))
  return `${stageInfo(o.stage).short} · ${days === 0 ? 'today' : `${days}d`}`
}

/** A YYYY-MM-DD some days from a day. */
export function plusDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** The Monday after a day (or the one a week on, if it is a Monday). */
export function nextMonday(day: string): string {
  const d = new Date(`${day}T12:00:00Z`)
  const add = ((8 - d.getUTCDay()) % 7) || 7
  return plusDays(day, add)
}

/** Dollars typed by a person ("12,500", "$12.5k") to cents; null when it is not a number. */
export function parseDollars(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/[$,\s]/g, '')
  if (!s) return null
  const m = /^(\d+(?:\.\d+)?)(k|m)?$/.exec(s)
  if (!m) return null
  const n = Number(m[1]) * (m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : 1)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

/** A phone number as a tel:/sms: target. */
export function dialable(phone: string | undefined): string {
  return (phone ?? '').replace(/[^\d+]/g, '')
}
