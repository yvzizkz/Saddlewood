import { notFound } from 'next/navigation'

import { TrackerPageClient } from '@/components/trackers/TrackerPageClient'
import { getTracker, isTrackerId, listInvoices } from '@/lib/trackers/queries'

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
  const invoices = await listInvoices(id)
  return <TrackerPageClient tracker={tracker} invoices={invoices} />
}
