import Link from 'next/link'
import ComingSoon from '@/components/portal/ComingSoon'

export const metadata = { title: 'Bid Log · Saddlewood Portal' }

export default function BidLogPage() {
  return (
    <ComingSoon
      eyebrow="Estimating"
      title="Bid Log"
      intro="Every invitation, every bid, and what happened to it. The lost ones are pricing history, not failures, so nothing here gets deleted."
      items={[
        'Each invite as it arrives: GC, project, due date, plans on file.',
        'The bid we sent: amount, trades, exclusions, who priced it.',
        'Outcome and reason: won, lost on price, lost on schedule, passed and why.',
        'Win rate by GC and by trade, so the next bid knows the odds.',
        'Three-quote leveling for the packages we send out to subs (SOP-008).',
      ]}
      meanwhile={
        <>
          Today the record lives in the estimating pipeline and the knowledge base. The rules it will enforce are in{' '}
          <Link href="/internal/ops/docs/sop-005" className="underline" style={{ color: 'var(--color-teal)' }}>
            SOP-005 Estimate intake
          </Link>{' '}
          and{' '}
          <Link href="/internal/ops/docs/sop-008" className="underline" style={{ color: 'var(--color-teal)' }}>
            SOP-008 Subs and vendors
          </Link>
          .
        </>
      }
    />
  )
}
