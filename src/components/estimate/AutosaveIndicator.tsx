'use client'

import type { SaveStatus } from '@/hooks/useAutosave'

interface AutosaveIndicatorProps {
  status: SaveStatus
  lastSavedAt: Date | null
  onRetry?: () => void
}

function formatRelative(d: Date): string {
  const secs = Math.floor((Date.now() - d.getTime()) / 1000)
  if (secs < 5) return 'just now'
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ago`
}

// Compact status pill rendered next to the back-nav title. Stays out of the
// way when idle with no prior save; shows saved/saving/error otherwise.
export function AutosaveIndicator({
  status,
  lastSavedAt,
  onRetry,
}: AutosaveIndicatorProps) {
  if (status === 'idle' && !lastSavedAt) return null

  if (status === 'saving') {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs"
        style={{ color: 'var(--color-charcoal-light)' }}
        aria-live="polite"
      >
        <span className="size-1.5 rounded-full bg-[var(--color-charcoal-light)] animate-pulse" />
        Saving…
      </span>
    )
  }

  if (status === 'error') {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 text-xs text-red-700 underline min-h-[44px] md:min-h-0"
        aria-live="polite"
      >
        <span className="size-1.5 rounded-full bg-red-600" aria-hidden="true" />
        Save failed — tap to retry
      </button>
    )
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs"
      style={{ color: 'var(--color-charcoal-light)' }}
      aria-live="polite"
    >
      <span className="size-1.5 rounded-full bg-[var(--color-teal)]" aria-hidden="true" />
      Saved · {lastSavedAt ? formatRelative(lastSavedAt) : 'just now'}
    </span>
  )
}
