"use client";

/**
 * New Construction service diagram — three stepped building massings on a
 * ground line with a 22'-0" dimension string over the center volume.
 * Geometry ported verbatim from the winning static preview.
 */

import { AnimatedLinework, Figure, Stroke } from "./AnimatedLinework";

export interface MassingDiagramProps {
  className?: string;
  glow?: boolean;
  delay?: number;
}

export function MassingDiagram({
  className,
  glow = false,
  delay = 0,
}: MassingDiagramProps) {
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
      {/* ground line */}
      <Stroke d="M10 180 H290" tone="cream" opacity={0.5} duration={2} />
      {/* left massing */}
      <Stroke d="M32 116 H158" />
      <Stroke d="M32 122 H158" />
      <Stroke d="M42 122 V180" />
      <Stroke d="M148 122 V180" />
      {/* center massing */}
      <Stroke d="M144 84 H216" />
      <Stroke d="M144 90 H216" />
      <Stroke d="M152 90 V180" />
      <Stroke d="M208 90 V180" />
      <Stroke d="M163 102 V132" width={1} opacity={0.5} duration={1.2} />
      <Stroke d="M175 102 V132" width={1} opacity={0.5} duration={1.2} />
      <Stroke d="M187 102 V132" width={1} opacity={0.5} duration={1.2} />
      <Stroke d="M199 102 V132" width={1} opacity={0.5} duration={1.2} />
      {/* right massing */}
      <Stroke d="M204 126 H286" />
      <Stroke d="M204 132 H286" />
      <Stroke d="M276 132 V180" />
      <Stroke d="M222 142 V180" width={1} opacity={0.5} duration={1.2} />
      <Stroke d="M244 142 V180" width={1} opacity={0.5} duration={1.2} />
      <Stroke d="M266 142 V180" width={1} opacity={0.5} duration={1.2} />
      {/* dimension string */}
      <Stroke d="M144 76 V58" tone="dim" duration={1.2} />
      <Stroke d="M216 76 V58" tone="dim" duration={1.2} />
      <Stroke d="M136 64 H224" tone="dim" />
      <Stroke d="M139 69 L149 59" tone="dim" duration={1.2} />
      <Stroke d="M211 69 L221 59" tone="dim" duration={1.2} />
      <Figure x={180} y={52} anchor="middle" size={9.5}>
        {"22'-0\""}
      </Figure>
    </AnimatedLinework>
  );
}
