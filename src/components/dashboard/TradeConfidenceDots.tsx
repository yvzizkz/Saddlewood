// Pure-display indicator for trade-review progress on an estimate card.
//
// Renders one dot per trade in the estimate; the first `reviewed` dots are
// filled teal, the remainder are open (hollow). A "reviewed/count trades"
// label sits to the right.
//
// Not currently rendered by EstimateCard (the dashboard query doesn't yet
// expose per-trade confidence counts), but kept available for future use
// once the trade-level rollup lands.

interface TradeConfidenceDotsProps {
  /** Total trades on the estimate. */
  count: number
  /** Number of trades whose confidence has been set (non-null). */
  reviewed: number
}

export function TradeConfidenceDots({
  count,
  reviewed,
}: TradeConfidenceDotsProps) {
  // Clamp `reviewed` into [0, count] so a stale prop can't produce more filled
  // dots than there are trades.
  const safeCount = Math.max(0, Math.trunc(count))
  const safeReviewed = Math.min(Math.max(0, Math.trunc(reviewed)), safeCount)

  const dots: Array<{ key: number; filled: boolean }> = []
  for (let i = 0; i < safeCount; i++) {
    dots.push({ key: i, filled: i < safeReviewed })
  }

  return (
    <div className="flex items-center gap-2">
      <div
        className="flex items-center gap-1"
        role="img"
        aria-label={`${safeReviewed} of ${safeCount} trades reviewed`}
      >
        {dots.map((d) => (
          <span
            key={d.key}
            className={
              'size-2 rounded-full ' +
              (d.filled
                ? 'bg-[var(--color-teal)]'
                : 'border border-[var(--color-stone)]')
            }
            aria-hidden="true"
          />
        ))}
      </div>
      <span
        className="text-xs"
        style={{ color: 'var(--color-charcoal-light)' }}
      >
        {safeReviewed}/{safeCount} trades
      </span>
    </div>
  )
}
