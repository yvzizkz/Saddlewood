"use client";

/**
 * Case-study plan fragment — great room opening to pool terrace: double-line
 * exterior walls, dashed sliding-wall track (fades with the figures), kitchen
 * island, wine-wall hatch, rounded pool with water ticks, vertical dimension,
 * and a north arrow. Geometry ported verbatim from the winning preview.
 */

import {
  AnimatedLinework,
  Figure,
  FigurePath,
  Stroke,
  StrokeCircle,
} from "./AnimatedLinework";

export interface PlanFragmentProps {
  className?: string;
  glow?: boolean;
  delay?: number;
}

export function PlanFragment({
  className,
  glow = false,
  delay = 0,
}: PlanFragmentProps) {
  return (
    <AnimatedLinework
      viewBox="0 0 560 400"
      className={className}
      glow={glow}
      delay={delay}
      stagger={0.08}
      duration={1.6}
      figureDelay={1.9}
    >
      {/* exterior walls (double line) */}
      <Stroke d="M60 60 H500" duration={2.2} />
      <Stroke d="M72 72 H488" width={1} duration={2.2} />
      <Stroke d="M60 60 V240" duration={2} />
      <Stroke d="M72 72 V228" width={1} duration={2} />
      <Stroke d="M500 60 V140" />
      <Stroke d="M488 72 V140" width={1} />
      <Stroke d="M60 240 H150" />
      <Stroke d="M72 228 H150" width={1} />
      <Stroke d="M330 240 H420 V140 H500" duration={2} />
      <Stroke d="M330 228 H408 V140" width={1} duration={2} />
      {/* sliding wall track (dashed, fades with figures) */}
      <FigurePath d="M150 234 H330" width={1} dash="7 5" />
      {/* kitchen island + wine wall hatch */}
      <Stroke d="M356 104 H470 V130 H356 Z" width={1} duration={1.8} />
      <Stroke d="M492 78 L500 86" width={1} opacity={0.5} duration={1.2} />
      <Stroke d="M488 92 L500 104" width={1} opacity={0.5} duration={1.2} />
      <Stroke d="M488 110 L500 122" width={1} opacity={0.5} duration={1.2} />
      <Stroke d="M488 128 L498 138" width={1} opacity={0.5} duration={1.2} />
      {/* terrace + pool */}
      <Stroke d="M118 264 H452" tone="cream" opacity={0.28} duration={2} />
      <Stroke
        d="M162 288 H390 A12 12 0 0 1 402 300 V352 A12 12 0 0 1 390 364 H162 A12 12 0 0 1 150 352 V300 A12 12 0 0 1 162 288 Z"
        duration={2.4}
      />
      <Stroke d="M176 308 H214" tone="cream" opacity={0.5} duration={1.2} />
      <Stroke d="M176 318 H202" tone="cream" opacity={0.5} duration={1.2} />
      <Stroke d="M176 328 H222" tone="cream" opacity={0.5} duration={1.2} />
      {/* vertical dimension */}
      <Stroke d="M32 60 V240" tone="dim" />
      <Stroke d="M26 66 L38 54" tone="dim" duration={1.2} />
      <Stroke d="M26 246 L38 234" tone="dim" duration={1.2} />
      {/* north arrow */}
      <StrokeCircle cx={524} cy={330} r={15} width={1} />
      <Stroke d="M524 348 V312" width={1} duration={1.2} />
      <Stroke d="M524 312 L518 322" width={1} duration={1.2} />
      <Stroke d="M524 312 L530 322" width={1} duration={1.2} />
      {/* labels */}
      <Figure x={150} y={158} tone="cream">
        GREAT ROOM
      </Figure>
      <Figure x={360} y={94} tone="cream" delay={0.13}>
        KITCHEN
      </Figure>
      <Figure x={196} y={332} tone="cream" delay={0.26}>
        POOL TERRACE
      </Figure>
      <Figure x={188} y={222} tone="cream" delay={0.39}>
        SLIDING DOORS
      </Figure>
      <Figure
        x={22}
        y={156}
        anchor="middle"
        transform="rotate(-90 22 156)"
        delay={0.52}
      >
        {"24'-0\""}
      </Figure>
      <Figure x={519} y={366} tone="cream" delay={0.65}>
        N
      </Figure>
    </AnimatedLinework>
  );
}
