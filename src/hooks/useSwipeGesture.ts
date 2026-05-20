'use client'

import { useCallback, useRef, useState } from 'react'
import type React from 'react'

interface UseSwipeGestureOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  /** Pixels the user must drag past before the callback fires. Default 50. */
  threshold?: number
}

interface UseSwipeGestureResult {
  bind: {
    onTouchStart: (e: React.TouchEvent) => void
    onTouchMove: (e: React.TouchEvent) => void
    onTouchEnd: (e: React.TouchEvent) => void
  }
  /** Current drag offset (px) — use for visual feedback. 0 when not dragging. */
  swipeOffsetX: number
}

/**
 * Touch-based horizontal swipe detector.
 *
 * Tracks finger position between `touchstart` and `touchend`. Exposes a live
 * `swipeOffsetX` (negative for left drag, positive for right) so the consumer
 * can translate the card under the finger. Fires `onSwipeLeft` /
 * `onSwipeRight` exactly once per gesture when the total drag exceeds the
 * threshold. Offset is reset to 0 on `touchend` so the card animates back.
 */
export function useSwipeGesture(
  opts: UseSwipeGestureOptions
): UseSwipeGestureResult {
  const { onSwipeLeft, onSwipeRight, threshold = 50 } = opts

  const startXRef = useRef<number | null>(null)
  const startYRef = useRef<number | null>(null)
  const firedRef = useRef<boolean>(false)
  const [swipeOffsetX, setSwipeOffsetX] = useState<number>(0)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0]
    if (!t) return
    startXRef.current = t.clientX
    startYRef.current = t.clientY
    firedRef.current = false
    setSwipeOffsetX(0)
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const startX = startXRef.current
    const startY = startYRef.current
    if (startX === null || startY === null) return
    const t = e.touches[0]
    if (!t) return
    const dx = t.clientX - startX
    const dy = t.clientY - startY
    // Treat the gesture as horizontal only when |dx| > |dy|; otherwise the
    // user is scrolling vertically and we should leave the card untouched.
    if (Math.abs(dx) > Math.abs(dy)) {
      setSwipeOffsetX(dx)
    }
  }, [])

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const startX = startXRef.current
      if (startX !== null) {
        const t = e.changedTouches[0]
        if (t) {
          const dx = t.clientX - startX
          if (!firedRef.current) {
            if (dx <= -threshold) {
              firedRef.current = true
              onSwipeLeft?.()
            } else if (dx >= threshold) {
              firedRef.current = true
              onSwipeRight?.()
            }
          }
        }
      }
      startXRef.current = null
      startYRef.current = null
      setSwipeOffsetX(0)
    },
    [onSwipeLeft, onSwipeRight, threshold]
  )

  return {
    bind: { onTouchStart, onTouchMove, onTouchEnd },
    swipeOffsetX,
  }
}
