import { getEstimateWithTrades } from '@/lib/estimates/queries'
import { EstimatePageClient } from '@/components/estimate/EstimatePageClient'
import { notFound } from 'next/navigation'
import type { EstimateBundle } from '@/lib/estimates/types'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EstimatePage({ params }: Props) {
  const { id } = await params
  let bundle: EstimateBundle
  try {
    bundle = await getEstimateWithTrades(id)
  } catch {
    notFound()
  }
  return <EstimatePageClient bundle={bundle} />
}
