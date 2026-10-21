import Link from 'next/link'
import { notFound } from 'next/navigation'

import { TrackerPageClient } from '@/components/trackers/TrackerPageClient'
import { getTracker, isTrackerId, listInvoices } from '@/lib/trackers/queries'
import { jobHref, listJobRefs } from '@/lib/jobs/hub'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const tracker = isTrackerId(id) ? await getTracker(id).catch(() => null) : null
  return { title: tracker ? `${tracker.projectName} tracker · Saddlewood Portal` : 'Tracker · Saddlewood Portal' }
}

export default async function TrackerPage({ params }: Props) {
  const { id } = await params
  if (!isTrackerId(id)) notFound()
  const tracker = await getTracker(id)
  if (!tracker) notFound()
  const [invoices, linked] = await Promise.all([
    listInvoices(id),
    // The job this tracker bills (jobs.tracker_id), so the tracker is not a dead end.
    getSupabaseAdmin().from('jobs').select('id').eq('tracker_id', id).maybeSingle(),
  ])
  const billingId = (linked.data as { id: string } | null)?.id ?? null
  const job = billingId ? (await listJobRefs().catch(() => [])).find((r) => r.billingId === billingId) : undefined
  return (
    <>
      {job ? (
        <div className="mx-auto max-w-5xl px-4 pt-4 text-sm md:px-6">
          <Link href={jobHref(job.key, 'money')} className="text-[var(--color-teal)] underline underline-offset-2">
            Job: {job.name}
          </Link>
        </div>
      ) : null}
      <TrackerPageClient tracker={tracker} invoices={invoices} />
    </>
  )
}
