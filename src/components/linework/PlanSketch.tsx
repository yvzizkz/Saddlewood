"use client";

/**
 * Small plan sketch for the "The plan. The build. The aim." trio panel —
 * the garage-side footprint of the Paradise Valley estate, traced from the
 * working set (2026-08-28 handoff). The parent panel supplies the cream
 * ground; wrap in `.linework-ink` there.
 */

import { AnimatedLinework, Figure, Stroke } from "./AnimatedLinework";

export interface PlanSketchProps {
  className?: string;
  glow?: boolean;
}

const THIN = { width: 0.7, opacity: 0.85 } as const;

export function PlanSketch({ className, glow = false }: PlanSketchProps) {
  return (
    <AnimatedLinework
      viewBox="0 0 400 300"
      className={className}
      glow={glow}
      duration={2.2}
      stagger={0.06}
      figureDelay={2.0}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Site line */}
      <Stroke d="M30 228 H370" tone="cream" width={1.8} />
      {/* Massing outlines */}
      <Stroke d="M60 228 V150 H150 V228" tone="cream" width={1.8} />
      <Stroke d="M52 150 H158" tone="cream" width={1.8} />
      <Stroke d="M150 228 V118 H230 V228 M144 118 H236" tone="cream" width={1.8} />
      <Stroke d="M230 228 V162 H352 V228 M224 162 H360" tone="cream" width={1.8} />
      {/* Interior partitions */}
      <Stroke d="M70 228 V166 H140 V228 M105 166 V228" {...THIN} />
      <Stroke d="M160 228 V134 H184 V228 M196 134 H220 V180 H196 Z" {...THIN} />
      <Stroke d="M240 228 V176 H342 M240 202 H342 M291 176 V228 M342 176 V228" {...THIN} />

      <Figure x={36} y={248} size={9}>
        GARAGE SIDE · PARADISE VALLEY
      </Figure>
    </AnimatedLinework>
  );
}
