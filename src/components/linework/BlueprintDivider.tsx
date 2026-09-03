"use client";

/**
 * Small section ornament derived from the preview's dimension-string
 * dividers: two witness (extension) lines in dim cream, a gold dimension
 * string running past them, and a 45-degree slash tick at each intersection
 * — the drafting shorthand the hero elevation uses over the entry tower.
 */

import { AnimatedLinework, Stroke } from "./AnimatedLinework";

export interface BlueprintDividerProps {
  className?: string;
  glow?: boolean;
  delay?: number;
}

export function BlueprintDivider({
  className,
  glow = false,
  delay = 0,
}: BlueprintDividerProps) {
  return (
    <AnimatedLinework
      viewBox="0 0 180 24"
      className={className}
      glow={glow}
      delay={delay}
      stagger={0.14}
      duration={1.4}
    >
      {/* witness lines */}
      <Stroke d="M14 22 V4" tone="dim" duration={1.2} />
      <Stroke d="M166 22 V4" tone="dim" duration={1.2} />
      {/* dimension string */}
      <Stroke d="M2 13 H178" width={1} duration={1.6} />
      {/* slash ticks */}
      <Stroke d="M8 19 L20 7" width={1} duration={1.2} />
      <Stroke d="M160 19 L172 7" width={1} duration={1.2} />
    </AnimatedLinework>
  );
}
