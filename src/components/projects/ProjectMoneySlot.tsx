'use client'

import JobMoneyCard from './JobMoneyCard'

// Where a job's money card goes on the Projects screen: contract, billed,
// paid, owed and past due, and the Material block (Home Depot, 0022), read
// only (money.view). The card reads its own route, /api/crew/projects/money
// (a crew-marked sign-in reaches nothing outside /api/crew/), which checks
// requireSwitch("money.view") and the job scope again. Projects only renders
// this for a viewer with money.view.

export default function ProjectMoneySlot({ crewJobId, billingJobId }: { crewJobId: string; billingJobId: string | null }) {
  return <JobMoneyCard billingJobId={billingJobId} crewJobId={crewJobId} />
}
