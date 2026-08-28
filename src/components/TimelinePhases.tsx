"use client";

/**
 * Numbered build-sequence rows for the Night Blueprint case-study pages.
 * Each phase gets a Fraunces numeral (01, 02, ...) over a drafted
 * dimension-tick string, the phase name, and its description, separated
 * by hairline rules. The DimensionTicks ornament handles its own
 * reduced-motion state; row reveals respect usePrefersReducedMotion here.
 */

import { motion } from "framer-motion";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import { REVEAL_VIEWPORT } from "@/lib/reveal";
import { DimensionTicks } from "@/components/linework";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

export interface TimelinePhasesProps {
  phases: { phase: string; description: string; duration?: string }[];
  className?: string;
}

export function TimelinePhases({ phases, className }: TimelinePhasesProps) {
  const prefersReducedMotion = usePrefersReducedMotion();

  if (phases.length === 0) return null;

  return (
    <ol
      className={cn(
        "list-none border-t border-off-white/[0.14] p-0",
        className
      )}
    >
      {phases.map((item, i) => (
        <motion.li
          key={item.phase}
          className="grid grid-cols-[76px_1fr] gap-x-6 border-b border-off-white/[0.14] py-[clamp(22px,3.4vh,34px)] sm:grid-cols-[120px_1fr] sm:gap-x-10"
          initial={
            prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0.12, y: 22 }
          }
          whileInView={{ opacity: 1, y: 0 }}
          viewport={REVEAL_VIEWPORT}
          transition={{ duration: 0.9, ease: EASE, delay: (i % 3) * 0.1 }}
        >
          <div>
            <span className="block font-heading text-[clamp(28px,3.2vw,40px)] font-medium leading-none text-gold">
              {String(i + 1).padStart(2, "0")}
            </span>
            <DimensionTicks className="mt-3 block w-12 sm:w-14" />
          </div>
          <div className="pt-1">
            <h3 className="font-heading text-[18px] font-medium leading-[1.3] text-off-white sm:text-[20px]">
              {item.phase}
            </h3>
            <p className="mt-2 max-w-[560px] text-[13.5px] leading-[1.7] text-off-white/[0.62]">
              {item.description}
            </p>
            {item.duration ? (
              <div className="mt-3 text-[10.5px] font-medium uppercase tracking-[0.22em] text-off-white/55">
                {item.duration}
              </div>
            ) : null}
          </div>
        </motion.li>
      ))}
    </ol>
  );
}
