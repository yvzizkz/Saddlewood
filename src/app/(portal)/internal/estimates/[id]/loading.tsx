// Suspense skeleton shown while the RSC `page.tsx` is fetching the estimate
// bundle from Supabase. Geometry roughly mirrors the rendered page (sticky
// back nav, summary header block, two trade-section rows) so the layout
// doesn't jump when real content swaps in.

export default function EstimateLoading() {
  return (
    <div
      className="min-h-screen bg-[var(--color-cream)]"
      role="status"
      aria-label="Loading estimate"
    >
      {/* Back nav skeleton */}
      <div className="sticky top-0 z-10 bg-[var(--color-cream)] border-b border-[var(--color-stone)] px-4 py-3">
        <div className="h-5 w-40 rounded bg-[var(--color-stone)] animate-pulse" />
      </div>

      {/* Summary header skeleton */}
      <div className="px-4 py-8 max-w-3xl mx-auto">
        <div className="flex flex-col items-center gap-3 mb-6">
          <div className="h-12 w-56 rounded bg-[var(--color-stone)] animate-pulse" />
          <div className="h-4 w-24 rounded bg-[var(--color-stone)] animate-pulse" />
          <div className="h-4 w-40 rounded bg-[var(--color-stone)] animate-pulse mt-2" />
        </div>
        <div className="h-14 w-full rounded-xl bg-[var(--color-stone)] animate-pulse" />
      </div>

      {/* Trade rows skeleton */}
      <div className="px-4 max-w-3xl mx-auto space-y-3">
        <div className="h-16 rounded-xl border border-[var(--color-stone)] bg-white animate-pulse" />
        <div className="h-16 rounded-xl border border-[var(--color-stone)] bg-white animate-pulse" />
        <div className="h-16 rounded-xl border border-[var(--color-stone)] bg-white animate-pulse" />
      </div>
    </div>
  )
}
