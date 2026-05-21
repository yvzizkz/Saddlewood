import type { LineItem } from './types'

// Single canonical predicate for "counts toward flag totals".
// Soft-deleted items are excluded even if they still carry flags so a deleted
// row doesn't keep showing up in the dashboard badge or the review walkthrough.
export function isActiveFlagged(li: LineItem): boolean {
  return li.flags.length > 0 && !li.is_deleted
}

export function countActiveFlagged(items: Iterable<LineItem>): number {
  let n = 0
  for (const li of items) if (isActiveFlagged(li)) n++
  return n
}
