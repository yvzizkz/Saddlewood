"use client";

/**
 * Drawn/Delivered pair — one traced sheet beside one real photo or video
 * frame from the same discipline (handoff page pattern). Used on the
 * homepage service sections and reusable on /services and /framing.
 *
 * tone="cream" renders the panels on the cream interlude treatment
 * (drafting ink linework); tone="dark" renders on the page ground.
 */

import { motion } from "framer-motion";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import {
  revealVariants,
  revealStaticVariants,
  REVEAL_STEP,
  REVEAL_VIEWPORT,
} from "@/lib/reveal";

export interface SheetPairPanel {
  /** Mono chip in the panel's top-left corner, e.g. "Drawn" / "Delivered". */
  tag: string;
  /** Mono caption bar under the panel. */
  caption: string;
  children: React.ReactNode;
  /** Media panels get a fixed aspect so PhotoWipe can fill; sheets size themselves. */
  aspect?: string;
}

export interface SheetPairProps {
  tone: "dark" | "cream";
  left: SheetPairPanel;
  right: SheetPairPanel;
}

export function SheetPair({ tone, left, right }: SheetPairProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const variants = prefersReducedMotion ? revealStaticVariants : revealVariants;

  const border = tone === "cream" ? "border-stone-mid" : "border-gold/[0.28]";
  const panelBg = tone === "cream" ? "bg-[#faf6ea]" : "bg-teal";
  const tagStyle =
    tone === "cream"
      ? "border-stone-mid bg-off-white/90 text-gold-accessible"
      : "border-gold/[0.35] bg-teal-dark/80 text-gold";
  const capStyle =
    tone === "cream"
      ? "border-stone-mid text-[#8a8672]"
      : "border-gold/[0.28] text-off-white/[0.55]";

  const renderPanel = (panel: SheetPairPanel, delay: number) => (
    <motion.div
      variants={variants}
      custom={delay}
      initial="hidden"
      whileInView="visible"
      viewport={REVEAL_VIEWPORT}
      className={`relative flex flex-col border ${border} ${panelBg}`}
    >
      <span
        className={`absolute left-3.5 top-3.5 z-[2] border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] ${tagStyle}`}
      >
        {panel.tag}
      </span>
      <div
        className={`relative flex flex-1 items-center justify-center overflow-hidden ${panel.aspect ?? ""}`}
      >
        {panel.children}
      </div>
      <div
        className={`border-t px-4 py-3 font-mono text-[10.5px] uppercase tracking-[0.14em] ${capStyle}`}
      >
        {panel.caption}
      </div>
    </motion.div>
  );

  return (
    <div className="grid grid-cols-1 items-stretch gap-[22px] lg:grid-cols-[1.15fr_0.85fr]">
      {renderPanel(left, 0)}
      {renderPanel(right, REVEAL_STEP)}
    </div>
  );
}
