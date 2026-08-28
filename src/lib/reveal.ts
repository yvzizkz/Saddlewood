import type { Variants } from "framer-motion";

/**
 * Shared scroll-reveal spec, ported from the 2026-08-28 handoff demo.
 *
 * The load-bearing rules:
 *  - Elements start at opacity 0.12, never fully invisible, so a fast
 *    scroll never shows a blank viewport.
 *  - Rise 26px and fade over 0.8s on the house ease.
 *  - Trigger when 18% of the element is visible, once.
 *  - Staggered children step by 0.12s (d1/d2/d3 in the demo).
 */

export const REVEAL_EASE = [0.22, 1, 0.36, 1] as const;

/** Stagger step between successive reveal children (demo .d1/.d2/.d3). */
export const REVEAL_STEP = 0.12;

/** whileInView viewport config for reveals — 18% visible, fire once. */
export const REVEAL_VIEWPORT = { once: true, amount: 0.18 } as const;

/**
 * Variants for one revealed element. Pass a delay (s) via the motion
 * component's `custom` prop for staggering: custom={REVEAL_STEP * 2}.
 */
export const revealVariants: Variants = {
  hidden: { opacity: 0.12, y: 26 },
  visible: (delay: number = 0) => ({
    opacity: 1,
    y: 0,
    // 0.7s (round-2 timing trim from the 0.8s handoff spec).
    transition: { duration: 0.7, ease: REVEAL_EASE, delay },
  }),
};

/** Static variants for prefers-reduced-motion: content just shows. */
export const revealStaticVariants: Variants = {
  hidden: { opacity: 1, y: 0 },
  visible: { opacity: 1, y: 0 },
};
