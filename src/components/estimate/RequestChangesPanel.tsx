'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useEstimateStore } from '@/store/estimateStore'
import { useBottomSheet } from '@/hooks/useBottomSheet'

/**
 * Slide-up bottom sheet for the "Request Changes" flow. Owner enters a single
 * overall note describing what needs to change; on send, PATCHes the estimate
 * with `action: 'request_changes'`. The endpoint lands in Task 9, so a 404 is
 * surfaced inline as a friendly "coming soon" alert.
 */
export function RequestChangesPanel() {
  const router = useRouter()
  const requestChangesOpen = useEstimateStore((s) => s.requestChangesOpen)
  const closeRequestChanges = useEstimateStore((s) => s.closeRequestChanges)
  const estimateId = useEstimateStore((s) => s.estimate?.id ?? null)
  const { state, shouldRender } = useBottomSheet(requestChangesOpen)

  const [overallNote, setOverallNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset local form whenever the panel transitions to open.
  useEffect(() => {
    if (requestChangesOpen) {
      setOverallNote('')
      setError(null)
    }
  }, [requestChangesOpen])

  // Esc closes the sheet.
  useEffect(() => {
    if (!requestChangesOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRequestChanges()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [requestChangesOpen, closeRequestChanges])

  if (!shouldRender || !estimateId) return null

  async function handleSend() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/estimates/${estimateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'request_changes',
          overallNote,
          flagNotes: [],
        }),
      })
      if (res.status === 404) {
        alert('Request-changes endpoint coming soon.')
        closeRequestChanges()
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      closeRequestChanges()
      router.refresh()
      alert('Changes requested')
    } catch (e) {
      console.error('Request changes failed:', e)
      setError('Could not send request. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const sendDisabled = overallNote.trim() === '' || submitting

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label="Request changes"
    >
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-[250ms]"
        style={{ opacity: state === 'open' ? 1 : 0 }}
        onClick={() => !submitting && closeRequestChanges()}
      />
      {/* sheet */}
      <div
        className="absolute bottom-0 inset-x-0 bg-[var(--color-background)] rounded-t-2xl shadow-2xl transition-transform duration-[250ms] ease-out"
        style={{
          transform: state === 'open' ? 'translateY(0)' : 'translateY(100%)',
          maxHeight: '90dvh',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div className="p-6">
          <h2
            style={{ fontFamily: 'var(--font-fraunces)' }}
            className="text-xl mb-4"
          >
            Request Changes
          </h2>

          <label className="block mb-2">
            <textarea
              rows={8}
              value={overallNote}
              onChange={(e) => setOverallNote(e.target.value)}
              maxLength={2000}
              placeholder="Describe what needs to change…"
              className="w-full px-3 py-3 rounded-lg border border-[var(--color-stone)] text-base"
            />
          </label>
          <div className="text-xs text-right opacity-60 mb-4">
            {overallNote.length} / 2000
          </div>

          {error && (
            <div className="mb-4 p-3 rounded bg-red-50 text-red-700 border border-red-200 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              disabled={submitting}
              onClick={closeRequestChanges}
              className="flex-1 min-h-[56px] rounded-xl border border-[var(--color-stone)] font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={sendDisabled}
              onClick={handleSend}
              className="flex-1 min-h-[56px] rounded-xl bg-[var(--color-teal)] text-white font-semibold disabled:opacity-50"
            >
              {submitting ? 'Sending…' : 'Send Request →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
