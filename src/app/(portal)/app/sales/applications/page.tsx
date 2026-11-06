import Link from 'next/link'
import { redirect } from 'next/navigation'

import ApplicationsList from '@/components/sales/ApplicationsList'
import { salesSeatForPage } from '@/lib/sales/seat'
import { loadSettings } from '@/lib/sales/settingsStore'
import { findSub } from '@/lib/subs/fromApplication'
import { listSubs } from '@/lib/subs/store'
import { listApplications } from '@/lib/webforms/store'

export const dynamic = 'force-dynamic'

// Trade-partner and job applications from the website, the last 90 days.
// The office only: they carry salary expectations. Contact-form leads are in
// the Sales inbox.

export default async function ApplicationsPage() {
  const seat = await salesSeatForPage(await loadSettings())
  if (seat?.role !== 'owner' && seat?.role !== 'staff') redirect('/app')
  const [rows, subs] = await Promise.all([
    listApplications(),
    // Without the directory the button still shows, and the route checks again.
    listSubs().catch((err) => {
      console.error('applications, subs:', err)
      return []
    }),
  ])
  const onSubs = Object.fromEntries(rows.flatMap((s) => (s.form === 'trade_partner' ? [[s.id, findSub(s, subs)?.name ?? '']] : [])).filter(([, name]) => name))
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <p className="text-sm">
        <Link className="underline" href="/app/sales">
          Sales
        </Link>
      </p>
      <h1 className="text-xl font-semibold text-[var(--color-charcoal)]">Website applications</h1>
      <ApplicationsList rows={rows} onSubs={onSubs} />
    </div>
  )
}
