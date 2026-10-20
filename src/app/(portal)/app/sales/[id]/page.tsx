import { notFound, redirect } from 'next/navigation'

import OpportunityScreen from '@/components/sales/OpportunityScreen'
import { salesSeatForPage } from '@/lib/sales/seat'
import { loadSettings } from '@/lib/sales/settingsStore'

export const dynamic = 'force-dynamic'

// One prospect, start to finish. Whoever may open the pipeline.

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await salesSeatForPage(await loadSettings()))) redirect('/app')
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  return <OpportunityScreen id={id} />
}
