'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  /**
   * Max height as a percentage of the dynamic viewport. Default 50dvh keeps
   * the sheet compact for a single-field edit; pass 90 for taller content.
   */
  maxHeightDvh?: number
  /** Aria label for the dialog. Falls back to `title` if set. */
  ariaLabel?: string
}

// Returns the document.body lazily so this module can be imported on the
// server without crashing (createPortal is the actual render-time call that
// requires a DOM target).
function getPortalTarget(): HTMLElement | null {
  return typeof document !== 'undefined' ? document.body : null
}

/**
 * Generic bottom-sheet primitive. Renders a backdrop + cream sheet with a
 * drag handle that closes on swipe-down. iOS-aware: uses dvh + safe-area
 * insets so the on-screen keyboard doesn't cover the content.
 *
 * No external animation library — a single keyframe in globals.css drives
 * the slide-up. Reduced-motion users get an instant appear.
 */
export function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  maxHeightDvh = 50,
  ariaLabel,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const dragStartY = useRef<number | null>(null)
  const dragCurrentY = useRef<number>(0)
  const [dragOffset, setDragOffset] = useState<number>(0)

  // Lock body scroll while the sheet is open so the page underneath doesn't
  // scroll under the user's finger.
  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isOpen])

  // Close on Escape.
  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  function onHandleTouchStart(e: React.TouchEvent) {
    dragStartY.current = e.touches[0].clientY
    dragCurrentY.current = dragStartY.current
  }

  function onHandleTouchMove(e: React.TouchEvent) {
    if (dragStartY.current === null) return
    dragCurrentY.current = e.touches[0].clientY
    const delta = dragCurrentY.current - dragStartY.current
    // Only allow pulling down (positive delta); clamp upward drag to 0.
    setDragOffset(Math.max(0, delta))
  }

  function onHandleTouchEnd() {
    if (dragStartY.current === null) return
    const delta = dragCurrentY.current - dragStartY.current
    dragStartY.current = null
    if (delta > 80) {
      onClose()
    }
    setDragOffset(0)
  }

  if (!isOpen) return null

  const target = getPortalTarget()
  if (!target) return null

  return createPortal(
    <div role="presentation">
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-200"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? title ?? 'Editor'}
        className="bottom-sheet-enter fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-[var(--color-cream)] shadow-2xl pb-[env(safe-area-inset-bottom)] flex flex-col"
        style={{
          maxHeight: `${maxHeightDvh}dvh`,
          transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
          transition: dragOffset > 0 ? 'none' : undefined,
        }}
      >
        {/* Drag handle */}
        <div
          className="flex justify-center pt-3 pb-1 cursor-grab touch-none"
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
          aria-hidden="true"
        >
          <div className="w-10 h-1 rounded-full bg-[var(--color-charcoal)] opacity-20" />
        </div>
        {title && (
          <div className="px-5 pb-3 border-b border-[var(--color-stone)]">
            <h2
              className="text-base font-semibold text-[var(--color-charcoal)]"
              style={{ fontFamily: 'var(--font-fraunces)' }}
            >
              {title}
            </h2>
          </div>
        )}
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>,
    target
  )
}
