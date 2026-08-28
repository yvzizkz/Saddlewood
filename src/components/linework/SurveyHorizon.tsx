"use client";

/**
 * Footer survey horizon — the bookend to the hero elevation: a long survey
 * baseline with station ticks, an agave, a low moon, and the SCOTTSDALE ·
 * ARIZONA station label fading up after the line lands. Geometry ported
 * verbatim from the winning static preview.
 */

import { AnimatedLinework, Figure, Stroke, StrokeCircle } from "./AnimatedLinework";

export interface SurveyHorizonProps {
  className?: string;
  glow?: boolean;
  delay?: number;
}

export function SurveyHorizon({
  className,
  glow = true,
  delay = 0,
}: SurveyHorizonProps) {
  return (
    <AnimatedLinework
      viewBox="0 0 1440 96"
      preserveAspectRatio="xMidYMax slice"
      className={className}
      glow={glow}
      delay={delay}
      stagger={0.12}
      duration={1.4}
      figureDelay={1.9}
    >
      {/* survey baseline */}
      <Stroke d="M24 78 H1416" width={1} duration={2.4} />
      {/* station ticks */}
      <Stroke d="M360 78 V70" width={1} opacity={0.5} duration={1.2} />
      <Stroke d="M720 78 V68" width={1} opacity={0.5} duration={1.2} />
      <Stroke d="M1080 78 V70" width={1} opacity={0.5} duration={1.2} />
      {/* agave */}
      <Stroke d="M196 78 L180 52" tone="cream" opacity={0.5} duration={1.2} />
      <Stroke d="M196 78 L191 46" tone="cream" opacity={0.5} duration={1.2} />
      <Stroke d="M196 78 L203 45" tone="cream" opacity={0.5} duration={1.2} />
      <Stroke d="M196 78 L214 54" tone="cream" opacity={0.5} duration={1.2} />
      <Stroke d="M196 78 L172 66" tone="cream" opacity={0.5} duration={1.2} />
      <Stroke d="M196 78 L221 67" tone="cream" opacity={0.5} duration={1.2} />
      {/* low moon */}
      <StrokeCircle cx={1252} cy={34} r={15} width={1} opacity={0.5} duration={1.6} />
      {/* station label */}
      <Figure x={720} y={56} tone="cream" size={8.5} anchor="middle">
        SCOTTSDALE · ARIZONA
      </Figure>
    </AnimatedLinework>
  );
}
