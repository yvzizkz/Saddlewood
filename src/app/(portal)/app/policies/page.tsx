import { redirect } from 'next/navigation'

import PoliciesScreen from '@/components/policies/PoliciesScreen'
import { getViewer } from '@/lib/crew/auth'

export const dynamic = 'force-dynamic'

// Company policies: the owners' decisions for running a job after it is won.
// Office staff read them; an owner changes them (the API checks).

export default async function PoliciesPage() {
  if ((await getViewer()).kind !== 'staff') redirect('/app')
  return <PoliciesScreen />
}
