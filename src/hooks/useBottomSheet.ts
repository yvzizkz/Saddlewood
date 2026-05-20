'use client'

import { useEffect, useRef, useState } from 'react'

export type BottomSheetState = 'closed' | 'opening' | 'open' | 'closing'

interface UseBottomSheetResult {
  state: BottomSheetState
  /**
   * True during `opening` / `open` / `closing`, false only in `closed`.
   * Use this to gate rendering of the sheet so the exit animation can play
   * before the node is removed from the tree.
   */
  shouldRender: boolean
}

const TRANSITION_MS = 250

/**
 * Bottom-sheet open/close animation state machine.
 *
 * Drives the `data-state` attribute / className that the consumer uses to
 * animate the sheet in and out. Lifecycle:
 *
 *   isOpen=true  : closed  → opening → (next frame) open
 *   isOpen=false : open    → closing → (after TRANSITION_MS) closed
 *
 * The brief `opening` step gives the consumer one frame at the off-screen
 * starting position before the `open` state's CSS transition kicks in, so
 * the slide-up animation actually runs (rather than snapping into place).
 */
export function useBottomSheet(isOpen: boolean): UseBottomSheetResult {
  const [state, setState] = useState<BottomSheetState>('closed')
  const stateRef = useRef<BottomSheetState>('closed')
  stateRef.current = state

  useEffect(() => {
    if (isOpen) {
      setState('opening')
      let raf2: number | null = null
      const raf1 = window.requestAnimationFrame(() => {
        // Two rAFs so the browser has committed the `opening` styles before
        // we transition to `open`. One rAF works on most engines; the
        // second is cheap insurance against batched commits.
        raf2 = window.requestAnimationFrame(() => {
          setState('open')
        })
      })
      return () => {
        window.cancelAnimationFrame(raf1)
        if (raf2 !== null) window.cancelAnimationFrame(raf2)
      }
    }

    // isOpen=false. From a fresh mount with isOpen=false, the previous
    // state is `closed` — nothing to do, no closing animation to play.
    if (stateRef.current === 'closed') {
      return
    }

    setState('closing')
    const timer = setTimeout(() => {
      setState('closed')
    }, TRANSITION_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [isOpen])

  return {
    state,
    shouldRender: state !== 'closed',
  }
}
