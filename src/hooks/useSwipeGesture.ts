'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
 *
 * Multi-touch behavior: only the first finger to land is tracked. If a second
 * finger touches mid-swipe the gesture is cancelled (we treat additional
 * contacts as the user changing intent — pinch/zoom, scroll, etc.).
 */
export function useSwipeGesture(
  opts: UseSwipeGestureOptions
): UseSwipeGestureResult {
  const { onSwipeLeft, onSwipeRight, threshold = 50 } = opts

  const startXRef = useRef<number | null>(null)
  const startYRef = useRef<number | null>(null)
  const touchIdRef = useRef<number | null>(null)
  const firedRef = useRef<boolean>(false)
  const [swipeOffsetX, setSwipeOffsetX] = useState<number>(0)

  // Callback refs so the touch handlers can have stable identity (empty deps)
  // and the consumer's `bind` object stays referentially stable across
  // renders — this keeps React.memo and useMemo dep arrays effective.
  const onSwipeLeftRef = useRef<(() => void) | undefined>(onSwipeLeft)
  const onSwipeRightRef = useRef<(() => void) | undefined>(onSwipeRight)
  const thresholdRef = useRef<number>(threshold)
  useEffect(() => {
    onSwipeLeftRef.current = onSwipeLeft
    onSwipeRightRef.current = onSwipeRight
    thresholdRef.current = threshold
  }, [onSwipeLeft, onSwipeRight, threshold])

  const resetGesture = useCallback(() => {
    startXRef.current = null
    startYRef.current = null
    touchIdRef.current = null
    setSwipeOffsetX(0)
  }, [])

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0]
    if (!t) return
    startXRef.current = t.clientX
    startYRef.current = t.clientY
    touchIdRef.current = t.identifier
    firedRef.current = false
    setSwipeOffsetX(0)
  }, [])

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const startX = startXRef.current
      const startY = startYRef.current
      const trackedId = touchIdRef.current
      if (startX === null || startY === null || trackedId === null) return
      // Second finger landed — cancel the gesture so we don't fight a pinch
      // or two-finger scroll.
      if (e.touches.length > 1) {
        resetGesture()
        return
      }
      // Locate the originally-tracked finger; if it isn't in `touches`
      // anymore (already lifted, OS reordered), skip this update.
      let tracked: React.Touch | null = null
      for (let i = 0; i < e.touches.length; i++) {
        const candidate = e.touches[i]
        if (candidate && candidate.identifier === trackedId) {
          tracked = candidate
          break
        }
      }
      if (!tracked) return
      const dx = tracked.clientX - startX
      const dy = tracked.clientY - startY
      // Treat the gesture as horizontal only when |dx| > |dy|; otherwise the
      // user is scrolling vertically and we should leave the card untouched.
      if (Math.abs(dx) > Math.abs(dy)) {
        setSwipeOffsetX(dx)
      }
    },
    [resetGesture]
  )

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const startX = startXRef.current
    const trackedId = touchIdRef.current
    if (startX !== null && trackedId !== null) {
      // Only fire if the lifted finger is the one we started tracking.
      let tracked: React.Touch | null = null
      for (let i = 0; i < e.changedTouches.length; i++) {
        const candidate = e.changedTouches[i]
        if (candidate && candidate.identifier === trackedId) {
          tracked = candidate
          break
        }
      }
      if (tracked && !firedRef.current) {
        const dx = tracked.clientX - startX
        const t = thresholdRef.current
        if (dx <= -t) {
          firedRef.current = true
          onSwipeLeftRef.current?.()
        } else if (dx >= t) {
          firedRef.current = true
          onSwipeRightRef.current?.()
        }
      }
    }
    startXRef.current = null
    startYRef.current = null
    touchIdRef.current = null
    setSwipeOffsetX(0)
  }, [])

  // Stable `bind` reference: handlers above have empty (or stable) deps, so
  // this memo never invalidates after the first render.
  const bind = useMemo(
    () => ({ onTouchStart, onTouchMove, onTouchEnd }),
    [onTouchStart, onTouchMove, onTouchEnd]
  )

  return {
    bind,
    swipeOffsetX,
  }
}
