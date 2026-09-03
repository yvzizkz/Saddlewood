"use client";

/**
 * Great room plan fragment — v2, the premium-standard two-ink treatment:
 * true wall poché (one heavy open path that leaves the sliding-door gap),
 * furniture at plan weight, paver-grid terrace, pool edge peek, room
 * labels off the linework, one vertical dimension, and a north arrow.
 *
 * On the dark ground the heavy tone reads as cream structure + gold
 * detail; wrap in `.linework-ink` on cream grounds for warm ink + brass.
 */

import {
  AnimatedLinework,
  Figure,
  FigurePath,
  Stroke,
  StrokeCircle,
  StrokeRect,
} from "./AnimatedLinework";

export interface PlanFragmentProps {
  className?: string;
  glow?: boolean;
  delay?: number;
}

const DETAIL = { tone: "gold", width: 0.9, opacity: 0.95 } as const;

export function PlanFragment({
  className,
  glow = false,
  delay = 0,
}: PlanFragmentProps) {
  return (
    <AnimatedLinework
      viewBox="0 0 560 330"
      className={className}
      glow={glow}
      delay={delay}
      duration={2.2}
      stagger={0.05}
      figureDelay={2.0}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Exterior walls: true poché — one heavy open path that leaves the
          sliding-door opening between x170 and x300 on the terrace wall */}
      <Stroke
        d="M300 220 H360 V150 H470 V60 H90 V220 H170"
        tone="cream"
        width={7}
      />
      {/* Sliding door jambs and overlapping panels */}
      <Stroke d="M170 216 H236 M234 224 H300" tone="gold" width={1.2} opacity={0.95} />
      {/* Interior partition */}
      <Stroke d="M360 150 V60" tone="gold" width={1} opacity={0.95} />

      {/* Island: heavy with brass cabinetry marks */}
      <StrokeRect x={360} y={96} width={84} height={26} tone="cream" strokeW={1.6} />
      <Stroke d="M368 96 V122 M376 96 V122" tone="gold" width={0.6} opacity={0.95} />

      {/* Dining: table + chairs */}
      <StrokeCircle cx={300} cy={110} r={26} {...DETAIL} />
      <StrokeCircle cx={300} cy={110} r={7} tone="gold" width={0.7} opacity={0.95} />
      <Stroke
        d="M300 78 A32 32 0 0 1 328 96 M328 124 A32 32 0 0 1 300 142 M272 124 A32 32 0 0 1 268 104"
        tone="gold"
        width={0.6}
        opacity={0.95}
      />

      {/* Sofa group */}
      <StrokeRect x={120} y={96} width={86} height={22} rx={4} tone="gold" strokeW={0.9} opacity={0.95} />
      <StrokeRect x={120} y={140} width={40} height={20} rx={4} tone="gold" strokeW={0.9} opacity={0.95} />
      <StrokeRect x={168} y={140} width={40} height={20} rx={4} tone="gold" strokeW={0.9} opacity={0.95} />

      {/* Terrace: paver grid */}
      <StrokeRect x={140} y={240} width={220} height={60} tone="gold" strokeW={1} opacity={0.95} />
      <Stroke
        d="M195 240 V300 M250 240 V300 M305 240 V300 M140 270 H360"
        tone="gold"
        width={0.5}
        opacity={0.7}
      />
      {/* Pool edge peek */}
      <Stroke
        d="M380 252 C400 246 430 246 452 252 M380 268 C400 262 430 262 452 268"
        tone="gold"
        width={0.8}
        opacity={0.95}
      />

      {/* North arrow */}
      <StrokeCircle cx={500} cy={290} r={14} tone="cream" width={1.2} />
      <Stroke d="M500 300 V280 M495 286 L500 280 L505 286" tone="cream" width={1.2} />

      {/* Labels + dimension: brass, after the linework */}
      <Figure x={150} y={84} size={10}>
        GREAT ROOM
      </Figure>
      <Figure x={368} y={88} size={9}>
        KITCHEN
      </Figure>
      <Figure x={212} y={212} size={9}>
        SLIDING DOORS
      </Figure>
      <Figure x={200} y={290} size={9}>
        POOL TERRACE
      </Figure>
      <FigurePath d="M76 60 H62 M76 220 H62 M68 60 V220" tone="gold" width={0.7} />
      <FigurePath d="M64 64 L72 56 M64 224 L72 216" tone="gold" width={0.7} />
      <Figure x={54} y={144} anchor="end" size={9.5} transform="rotate(-90 54 144)">
        24&apos;-0&quot;
      </Figure>
      <Figure x={497} y={322} size={9}>
        N
      </Figure>
      <Figure x={90} y={322} size={10}>
        PLAN FRAGMENT · GREAT ROOM TO POOL TERRACE
      </Figure>
    </AnimatedLinework>
  );
}
