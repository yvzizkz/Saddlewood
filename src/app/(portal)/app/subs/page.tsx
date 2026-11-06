import { redirect } from 'next/navigation'

import SubsScreen from '@/components/subs/SubsScreen'
import { subsSeatForPage } from '@/lib/subs/access'

export const dynamic = 'force-dynamic'

// Subs and bids (SOP-008): office staff, and a crew seat whose group has the subs switch on.
// ?find=<name> opens the directory on that sub.

export default async function SubsPage({ searchParams }: { searchParams: Promise<{ find?: string | string[] }> }) {
  if (!(await subsSeatForPage())) redirect('/app')
  const { find } = await searchParams
  return <SubsScreen find={typeof find === 'string' ? find : ''} />
}
