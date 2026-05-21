'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useEstimateStore } from '@/store/estimateStore'
import { useBottomSheet } from '@/hooks/useBottomSheet'

/**
 * Centered confirmation modal for the Approve action. Shows the grand total,
 * an optional "Notify estimator" checkbox, and PATCHes the estimate with
 * `action: 'approve'`.
 */
export function ApproveModal() {
  const router = useRouter()
  const approveModalOpen = useEstimateStore((s) => s.approveModalOpen)
  const closeApproveModal = useEstimateStore((s) => s.closeApproveModal)
  const estimate = useEstimateStore((s) => s.estimate)
  const { state, shouldRender } = useBottomSheet(approveModalOpen)

  const [notify, setNotify] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset local form whenever the modal transitions to open.
  useEffect(() => {
    if (approveModalOpen) {
      setNotify(true)
      setError(null)
    }
  }, [approveModalOpen])

  // Esc closes the modal (only when not mid-submit).
  useEffect(() => {
    if (!approveModalOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) closeApproveModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [approveModalOpen, closeApproveModal, submitting])

  if (!shouldRender || !estimate) return null

  async function handleApprove() {
    if (!estimate) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/estimates/${estimate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', notifyEstimator: notify }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      closeApproveModal()
      router.refresh()
    } catch (e) {
      console.error('Approve failed:', e)
      setError('Could not approve. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Approve estimate"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-[250ms]"
        style={{ opacity: state === 'open' ? 1 : 0 }}
        onClick={() => !submitting && closeApproveModal()}
      />
      <div
        className="relative bg-[var(--color-background)] rounded-2xl shadow-2xl max-w-md w-full p-6 transition-all duration-[250ms]"
        style={{
          opacity: state === 'open' ? 1 : 0,
          transform: state === 'open' ? 'scale(1)' : 'scale(0.95)',
        }}
      >
        <h2
          style={{ fontFamily: 'var(--font-fraunces)' }}
          className="text-2xl mb-2"
        >
          Approve this estimate?
        </h2>
        <p
          className="text-3xl my-4"
          style={{ fontFamily: 'var(--font-fraunces)' }}
        >
          {estimate.grand_total.toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0,
          })}
        </p>
        <label className="flex items-center gap-3 mb-6 min-h-[44px]">
          <input
            type="checkbox"
            checked={notify}
            onChange={(e) => setNotify(e.target.checked)}
            className="size-5"
          />
          <span>Notify estimator via email</span>
        </label>
        {error && (
          <div className="mb-4 p-3 rounded bg-red-50 text-red-700 border border-red-200 text-sm">
            {error}
          </div>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            disabled={submitting}
            onClick={closeApproveModal}
            className="flex-1 min-h-[56px] rounded-xl border border-[var(--color-stone)] font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={handleApprove}
            className="flex-1 min-h-[56px] rounded-xl bg-green-600 text-white font-semibold disabled:opacity-50"
          >
            {submitting ? 'Approving…' : 'Approve & Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
