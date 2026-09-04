import ComingSoon from '@/components/portal/ComingSoon'

export default function InternalNotFound() {
  return (
    <ComingSoon
      eyebrow="Portal"
      title="Not here yet"
      intro="That page does not exist in the portal, or it is still being built."
      items={['Estimates, the Ops board, the documents, and the calendar are live.', 'Bid Log and Activity are next.']}
    />
  )
}
