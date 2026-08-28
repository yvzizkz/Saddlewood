"use client";

/**
 * Framing service diagram — a steel W-column on a baseplate with anchor
 * bolts, weld ticks, grade hatch, and a leader line to the STRUCTURAL STEEL
 * callout. Geometry ported verbatim from the winning static preview.
 */

import { AnimatedLinework, Figure, Stroke, StrokeCircle } from "./AnimatedLinework";

export interface SteelBeamProps {
  className?: string;
  glow?: boolean;
  delay?: number;
}

export function SteelBeam({ className, glow = false, delay = 0 }: SteelBeamProps) {
  return (
    <AnimatedLinework
      viewBox="0 0 300 210"
      className={className}
      glow={glow}
      delay={delay}
      stagger={0.07}
      duration={1.4}
      figureDelay={1.9}
    >
      {/* W-shape profile */}
      <Stroke
        d="M78 50 H152 V58 H121 V130 H152 V138 H78 V130 H109 V58 H78 Z"
        duration={2.4}
      />
      {/* baseplate */}
      <Stroke d="M66 144 H164" />
      <Stroke d="M66 152 H164" />
      {/* anchor bolts */}
      <StrokeCircle cx={84} cy={163} r={4} width={1} duration={1.2} />
      <StrokeCircle cx={146} cy={163} r={4} width={1} duration={1.2} />
      <Stroke d="M84 158 V170" width={1} duration={1.2} />
      <Stroke d="M146 158 V170" width={1} duration={1.2} />
      {/* grade + hatch */}
      <Stroke d="M62 178 H168" tone="cream" opacity={0.5} />
      <Stroke d="M72 188 L86 178" tone="cream" opacity={0.5} duration={1.2} />
      <Stroke d="M100 188 L114 178" tone="cream" opacity={0.5} duration={1.2} />
      <Stroke d="M128 188 L142 178" tone="cream" opacity={0.5} duration={1.2} />
      <Stroke d="M156 188 L166 180" tone="cream" opacity={0.5} duration={1.2} />
      {/* weld ticks */}
      <Stroke d="M104 142 L112 134" width={1} opacity={0.5} duration={1.2} />
      <Stroke d="M118 142 L126 134" width={1} opacity={0.5} duration={1.2} />
      {/* leader to callout */}
      <Stroke d="M156 94 L192 80 H204" tone="dim" />
      <Figure x={210} y={76} tone="cream" size={8.5}>
        STEEL
      </Figure>
      <Figure x={210} y={90} tone="cream" size={8.5} delay={0.13}>
        FRAMING
      </Figure>
    </AnimatedLinework>
  );
}
