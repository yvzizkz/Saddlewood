import Link from 'next/link'
import ComingSoon from '@/components/portal/ComingSoon'

export const metadata = { title: 'Activity · Saddlewood Portal' }

export default function ActivityPage() {
  return (
    <ComingSoon
      eyebrow="Pulse"
      title="Activity"
      intro="What happened, what is waiting on someone, and what got older overnight. One feed, so nobody has to read three mailboxes to know the state of the company."
      items={[
        'The morning and afternoon digests the bot already sends, readable here.',
        'The waiting-on ledger: every open commitment, who owes it, how old it is.',
        'Invoices crossing 30, 60, 90 days; commitments going stale; leads unanswered.',
        'Board moves and responses from the Ops board, in the same stream.',
        'Approvals queued for Marco, with one tap to decide.',
      ]}
      meanwhile={
        <>
          The digests arrive by email at 8:00 and 16:00. The weekly report lands Monday. Goals and deadlines are on the{' '}
          <Link href="/internal/ops/calendar" className="underline" style={{ color: 'var(--color-teal)' }}>
            Ops calendar
          </Link>
          .
        </>
      }
    />
  )
}
