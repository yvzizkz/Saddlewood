import { redirect } from 'next/navigation'

// The old proposal builder is retired: proposals are made, sent and signed in
// Sales (/app/sales). Links already sent to clients (/p/<token>, /share/)
// still open, view-only. Old bookmarks land in Sales.
export default function ProposalsMoved() {
  redirect('/app/sales')
}
