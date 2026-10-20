import { redirect } from 'next/navigation'

import SettingsScreen from '@/components/sales/SettingsScreen'
import { salesSeatForPage } from '@/lib/sales/seat'
import { loadSettings } from '@/lib/sales/settingsStore'

export const dynamic = 'force-dynamic'

// Sales settings: anyone with a Sales seat may read them; owners change them.

export default async function SalesSettingsPage() {
  const seat = await salesSeatForPage(await loadSettings())
  if (!seat) redirect('/app')
  return <SettingsScreen canEdit={seat.can.editSettings} />
}
