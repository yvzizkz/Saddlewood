import { redirect } from 'next/navigation'

// The old call list moved into the Sales inbox (/app/sales, "Not tracked
// yet"): the same list from the Mac, with Sync GoHighLevel and the called /
// texted / dismissed marks. Old bookmarks and emailed links land there.
export default function LeadsMoved() {
  redirect('/app/sales')
}
