import { notFound, redirect } from 'next/navigation'

import PackageScreen from '@/components/subs/PackageScreen'
import { isId } from '@/lib/billing/http'
import { subsSeatForPage } from '@/lib/subs/access'

export const dynamic = 'force-dynamic'

export default async function PackagePage({ params }: { params: Promise<{ pid: string }> }) {
  if (!(await subsSeatForPage())) redirect('/app')
  const { pid } = await params
  if (!isId(pid)) notFound()
  return <PackageScreen id={pid} />
}
