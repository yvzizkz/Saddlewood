import { listEstimatesForDashboard } from '@/lib/estimates/queries'
import { EstimateList } from '@/components/dashboard/EstimateList'

interface DashboardPageProps {
  searchParams: Promise<{ tab?: string }>
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const { tab } = await searchParams
  const activeTab: 'pending' | 'all' = tab === 'all' ? 'all' : 'pending'

  // Auth is enforced by the (portal)/internal layout, so we can hit the
  // query directly without re-checking the session here.
  const estimates = await listEstimatesForDashboard()

  return (
    <div className="px-4 pt-6 md:px-8 md:pt-10 max-w-3xl mx-auto">
      <h1
        style={{ fontFamily: 'var(--font-fraunces)' }}
        className="text-3xl mb-6 text-[var(--color-charcoal)]"
      >
        Estimates
      </h1>
      <EstimateList estimates={estimates} activeTab={activeTab} />
    </div>
  )
}
