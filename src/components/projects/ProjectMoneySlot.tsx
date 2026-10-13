'use client'

// Where a job's money card goes on the Projects screen: contract, billed,
// paid, owed and past due, read only (money.view). The money side (Lane B of
// the project manager group) fills this in from its own route under
// /api/crew/ (a crew-marked sign-in reaches nothing else), gated by
// requireSwitch("money.view") and visibleBillingJobs. Projects only renders
// it for a viewer with money.view; until it is built it shows nothing.

export default function ProjectMoneySlot({ crewJobId, billingJobId }: { crewJobId: string; billingJobId: string | null }) {
  void crewJobId
  void billingJobId
  return null
}
