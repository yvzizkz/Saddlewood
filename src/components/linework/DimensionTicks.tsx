"use client";

/**
 * Small tick-string underline — the drafted dimension-tick stroke that sits
 * under stat numerals in the preview: slash tick, horizontal string, slash
 * tick. Geometry ported verbatim from the winning static preview.
 */

import { AnimatedLinework, Stroke } from "./AnimatedLinework";

export interface DimensionTicksProps {
  className?: string;
  glow?: boolean;
  /** Seconds before the first tick draws; the preview leads with 0.3s. */
  delay?: number;
}

export function DimensionTicks({
  className,
  glow = false,
  delay = 0.3,
}: DimensionTicksProps) {
  return (
    <AnimatedLinework
      viewBox="0 0 64 14"
      className={className}
      glow={glow}
      delay={delay}
      stagger={0.22}
      duration={1.2}
    >
      <Stroke d="M2 12 L12 2" width={1} />
      <Stroke d="M7 7 H57" />
      <Stroke d="M52 12 L62 2" width={1} />
    </AnimatedLinework>
  );
}
