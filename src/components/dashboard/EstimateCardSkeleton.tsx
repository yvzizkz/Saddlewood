// Loading placeholder for an EstimateCard.
//
// Matches the rendered card's outer geometry (rounded-xl, p-4, mb-3) so the
// list height doesn't jump when real data swaps in. The internal bars are
// rough proxies for: project-name row, client/date sub-row, the centered
// total, and the two action buttons.

export function EstimateCardSkeleton() {
  return (
    <div
      className="rounded-xl border border-[var(--color-stone)] bg-white p-4 mb-3"
      role="status"
      aria-label="Loading estimate"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="h-5 w-2/5 rounded bg-[var(--color-stone)] animate-pulse" />
        <div className="h-5 w-12 rounded-full bg-[var(--color-stone)] animate-pulse" />
      </div>

      <div className="h-3 w-3/5 rounded bg-[var(--color-stone)] animate-pulse mb-6" />

      <div className="flex justify-center mb-6">
        <div className="h-8 w-1/3 rounded bg-[var(--color-stone)] animate-pulse" />
      </div>

      <div className="flex items-center gap-2">
        <div className="h-10 flex-1 rounded bg-[var(--color-stone)] animate-pulse" />
        <div className="h-10 flex-1 rounded bg-[var(--color-stone)] animate-pulse" />
      </div>
    </div>
  )
}
