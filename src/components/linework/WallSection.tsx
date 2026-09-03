"use client";

/**
 * Whole-Home Remodels service diagram — a drafted wall section: concrete
 * footing and stem, grade hatch, floor line, stud wall with batt-insulation
 * zigzag, double top plate, raked roof line, and a 9'-1" vertical dimension
 * with F.F. / FTG labels. Geometry ported verbatim from the winning preview.
 */

import { AnimatedLinework, Figure, Stroke } from "./AnimatedLinework";

export interface WallSectionProps {
  className?: string;
  glow?: boolean;
  delay?: number;
}

export function WallSection({
  className,
  glow = false,
  delay = 0,
}: WallSectionProps) {
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
      {/* footing + stem */}
      <Stroke d="M118 192 H182 V170 H118 Z" />
      <Stroke d="M136 170 V140" />
      <Stroke d="M164 170 V140" />
      {/* grade + hatch */}
      <Stroke d="M60 148 H136" tone="cream" opacity={0.5} />
      <Stroke d="M70 158 L82 148" tone="cream" opacity={0.5} duration={1.2} />
      <Stroke d="M92 158 L104 148" tone="cream" opacity={0.5} duration={1.2} />
      <Stroke d="M114 158 L126 148" tone="cream" opacity={0.5} duration={1.2} />
      {/* floor lines */}
      <Stroke d="M136 140 H250" />
      <Stroke d="M136 133 H250" />
      {/* stud wall */}
      <Stroke d="M148 133 V58" />
      <Stroke d="M176 133 V58" />
      {/* batt insulation zigzag */}
      <Stroke
        d="M162 128 L174 116 L162 104 L174 92 L162 80 L174 68"
        width={1}
        opacity={0.5}
        duration={1.8}
      />
      {/* double top plate */}
      <Stroke d="M140 58 H184" />
      <Stroke d="M140 51 H184" />
      {/* roof */}
      <Stroke d="M112 66 L268 30" duration={1.8} />
      <Stroke d="M116 56 L272 20" duration={1.8} />
      <Stroke d="M268 30 L272 20" width={1} duration={1.2} />
      {/* ceiling line */}
      <Stroke d="M184 64 H250" width={1} opacity={0.5} />
      {/* dimension string */}
      <Stroke d="M262 133 V70" tone="dim" />
      <Stroke d="M256 128 L268 138" tone="dim" duration={1.2} />
      <Stroke d="M256 65 L268 75" tone="dim" duration={1.2} />
      <Figure x={254} y={106} anchor="end" size={9.5}>
        {"9'-1\""}
      </Figure>
      <Figure x={196} y={146} tone="cream" size={8.5} delay={0.13}>
        F.F.
      </Figure>
      <Figure x={192} y={188} tone="cream" size={8.5} delay={0.26}>
        FTG
      </Figure>
    </AnimatedLinework>
  );
}
