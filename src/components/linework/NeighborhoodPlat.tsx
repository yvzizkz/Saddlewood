"use client";

/**
 * Neighborhoods background plat — a survey-style subdivision fragment:
 * curving road pair, lot lines with corner nodes, rear boundary, and faint
 * contour lines. Renders quiet (35% opacity, like the preview) behind the
 * neighborhoods list. Geometry ported verbatim from the winning preview.
 */

import { AnimatedLinework, Stroke, StrokeCircle } from "./AnimatedLinework";

export interface NeighborhoodPlatProps {
  className?: string;
  glow?: boolean;
  delay?: number;
  /** Whole-drawing opacity; the preview sits this at 0.35 behind content. */
  opacity?: number;
}

export function NeighborhoodPlat({
  className,
  glow = false,
  delay = 0,
  opacity = 0.35,
}: NeighborhoodPlatProps) {
  return (
    <AnimatedLinework
      viewBox="0 0 620 640"
      className={className}
      style={{ opacity }}
      glow={glow}
      delay={delay}
      stagger={0.14}
      duration={2.2}
      figureDelay={1.9}
    >
      {/* road pair */}
      <Stroke d="M20 90 C200 62 340 150 600 118" width={1} duration={2.4} />
      <Stroke d="M20 124 C200 96 340 184 600 152" width={1} duration={2.4} />
      {/* lot lines */}
      <Stroke d="M120 116 L106 300" width={1} opacity={0.5} duration={1.6} />
      <Stroke d="M242 132 L246 302" width={1} opacity={0.5} duration={1.6} />
      <Stroke d="M368 156 L382 296" width={1} opacity={0.5} duration={1.6} />
      <Stroke d="M492 152 L512 288" width={1} opacity={0.5} duration={1.6} />
      {/* rear boundary */}
      <Stroke d="M60 300 H560" width={1} duration={2.4} />
      <Stroke d="M60 300 L48 470" width={1} opacity={0.5} duration={1.6} />
      <Stroke d="M560 300 L580 462" width={1} opacity={0.5} duration={1.6} />
      <Stroke d="M48 470 C220 500 420 434 580 462" width={1} opacity={0.5} duration={2.4} />
      {/* contours */}
      <Stroke d="M90 380 C240 400 400 350 540 372" tone="cream" opacity={0.28} duration={2.4} />
      <Stroke d="M104 424 C250 446 396 396 528 416" tone="cream" opacity={0.28} duration={2.4} />
      {/* corner nodes */}
      <StrokeCircle cx={106} cy={300} r={3.5} width={1} duration={1.2} />
      <StrokeCircle cx={246} cy={302} r={3.5} width={1} duration={1.2} />
      <StrokeCircle cx={382} cy={296} r={3.5} width={1} duration={1.2} />
      <StrokeCircle cx={512} cy={288} r={3.5} width={1} duration={1.2} />
    </AnimatedLinework>
  );
}
