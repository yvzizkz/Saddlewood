"use client";

/**
 * Colophon-style spec table for the Night Blueprint case-study pages:
 * gold small-caps labels, cream values, hairline rules between rows.
 * Renders as a definition list and reveals with the shared editorial
 * ease; fully static under prefers-reduced-motion.
 */

import { motion } from "framer-motion";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import { REVEAL_VIEWPORT } from "@/lib/reveal";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

export interface SpecTableProps {
  specs: { label: string; value: string }[];
  className?: string;
}

export function SpecTable({ specs, className }: SpecTableProps) {
  const prefersReducedMotion = usePrefersReducedMotion();

  if (specs.length === 0) return null;

  return (
    <motion.dl
      className={cn("border-t border-off-white/[0.14]", className)}
      initial={
        prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 22 }
      }
      whileInView={{ opacity: 1, y: 0 }}
      viewport={REVEAL_VIEWPORT}
      transition={{ duration: 1, ease: EASE }}
    >
      {specs.map((spec) => (
        <div
          key={spec.label}
          className="grid grid-cols-[110px_1fr] gap-4 border-b border-off-white/[0.14] py-3.5 sm:grid-cols-[150px_1fr]"
        >
          <dt className="pt-0.5 text-[10.5px] font-medium uppercase tracking-[0.22em] text-gold">
            {spec.label}
          </dt>
          <dd className="m-0 text-[13px] leading-[1.6] text-off-white">
            {spec.value}
          </dd>
        </div>
      ))}
    </motion.dl>
  );
}
