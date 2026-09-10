'use client'

import { BottomSheet } from '@/components/ui/BottomSheet'
import { SHEET_H2 } from './format'

export type ConfirmRequest = {
  title: string
  body: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
}

/** A yes/no question as a bottom sheet, so it reads the same on a phone and a desktop. */
export function ConfirmSheet({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  return (
    <BottomSheet isOpen={!!request} onClose={onClose} maxHeightDvh={60} ariaLabel={request?.title ?? 'Confirm'}>
      {request ? (
        <div className="px-5 py-4 flex flex-col gap-4">
          <div>
            <h2 className={SHEET_H2} style={{ fontFamily: 'var(--font-fraunces)' }}>
              {request.title}
            </h2>
            <p className="text-sm mt-1 leading-relaxed" style={{ color: 'var(--color-charcoal-light)' }}>
              {request.body}
            </p>
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border-2 border-[var(--color-stone)] text-[var(--color-charcoal)] font-semibold min-h-[48px]"
            >
              Cancel
            </button>
            <button
              type="button"
              autoFocus
              onClick={() => {
                request.onConfirm()
                onClose()
              }}
              className="flex-1 py-3 rounded-xl font-semibold min-h-[48px] text-[var(--color-cream)]"
              style={{ backgroundColor: request.danger ? '#a23b2a' : 'var(--color-teal)' }}
            >
              {request.confirmLabel ?? 'Continue'}
            </button>
          </div>
        </div>
      ) : null}
    </BottomSheet>
  )
}
