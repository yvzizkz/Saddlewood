"use client";

/**
 * Brass hairline fixed at the very top of the viewport, tracking scroll
 * progress across the page. Mounted once in the (marketing) layout.
 * It mirrors the visitor's own scrolling (no autonomous motion), so it
 * stays on under prefers-reduced-motion, matching the handoff demo.
 */

import { motion, useScroll } from "framer-motion";

export function ScrollProgress() {
  const { scrollYProgress } = useScroll();

  return (
    <motion.div
      aria-hidden="true"
      className="fixed left-0 top-0 z-[60] h-[2px] w-full origin-left bg-gold"
      style={{ scaleX: scrollYProgress }}
    />
  );
}
