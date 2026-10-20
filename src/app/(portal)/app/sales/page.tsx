import { redirect } from 'next/navigation'

import SalesScreen from '@/components/sales/SalesScreen'
import { salesSeatForPage } from '@/lib/sales/seat'
import { loadSettings } from '@/lib/sales/settingsStore'

export const dynamic = 'force-dynamic'

// The pipeline: office staff, and a crew seat whose group has Sales on (a
// project manager). Any other crew seat refers a lead from its More screen
// and never sees the pipeline itself.

export default async function SalesPage() {
  if (!(await salesSeatForPage(await loadSettings()))) redirect('/app')
  return <SalesScreen />
}
