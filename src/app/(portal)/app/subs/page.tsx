import { redirect } from 'next/navigation'

import SubsScreen from '@/components/subs/SubsScreen'
import { subsSeatForPage } from '@/lib/subs/access'

export const dynamic = 'force-dynamic'

// Subs and bids (SOP-008): office staff, and a crew seat whose group has the subs switch on.

export default async function SubsPage() {
  if (!(await subsSeatForPage())) redirect('/app')
  return <SubsScreen />
}
