"use client";

/**
 * Kitchen elevation sheet — upgraded drafting standard (hero-v2 handoff):
 * two ink weights (heavy structure via the "cream" tone, brass detail),
 * poché where a surface is cut, hatch on the waterfall returns, a sky hint
 * in the window, and one piece of life per sheet (scale figure, plant
 * sprig, pendant glow). Fills fade in with the annotations; lines draw on.
 *
 * Wrap in `.linework-ink` on cream grounds: heavy ink #3a2f1d + accessible
 * brass. On dark grounds the same tones read as cream structure + gold.
 */

import {
  AnimatedLinework,
  Figure,
  FigureGroup,
  FigurePath,
  Stroke,
  StrokeCircle,
} from "./AnimatedLinework";

export interface KitchenSheetProps {
  className?: string;
  glow?: boolean;
}

const HEAVY = { tone: "cream", width: 2 } as const;
const DETAIL = { tone: "gold", width: 0.8, opacity: 0.95 } as const;

export function KitchenSheet({ className, glow = false }: KitchenSheetProps) {
  return (
    <AnimatedLinework
      viewBox="0 0 560 330"
      className={className}
      glow={glow}
      duration={2.2}
      stagger={0.05}
      figureDelay={2.0}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <pattern
          id="kitchen-hatch"
          width="7"
          height="7"
          patternTransform="rotate(45)"
          patternUnits="userSpaceOnUse"
        >
          <line x1="0" y1="0" x2="0" y2="7" stroke="var(--gold)" strokeWidth="1" opacity="0.55" />
        </pattern>
      </defs>

      {/* Sky hint + poché fills + glow — arrive with the annotations */}
      <FigureGroup>
        <rect x="212" y="98" width="140" height="114" fill="var(--cream)" opacity="0.08" />
        <rect x="46" y="60" width="12" height="230" fill="var(--cream)" opacity="0.85" />
        <rect x="198" y="254" width="138" height="8" fill="var(--cream)" opacity="0.9" />
        <rect x="198" y="262" width="10" height="28" fill="url(#kitchen-hatch)" stroke="var(--gold)" strokeWidth="0.7" />
        <rect x="326" y="262" width="10" height="28" fill="url(#kitchen-hatch)" stroke="var(--gold)" strokeWidth="0.7" />
        <circle cx="268" cy="92" r="22" fill="var(--gold)" opacity="0.14" />
      </FigureGroup>

      {/* Floor + wall column: heavy ink */}
      <Stroke d="M30 290 H530" tone="cream" width={2.4} />
      <Stroke d="M46 60 V290 M58 60 V290" {...HEAVY} />

      {/* Window: heavy frame, brass mullions */}
      <Stroke d="M212 98 H352 V212 H212 Z" {...HEAVY} />
      <Stroke d="M282 98 V212 M218 104 H276 V206 H218 Z M288 104 H346 V206 H288 Z" {...DETAIL} />

      {/* Island: brass body over the poché countertop */}
      <Stroke d="M208 262 H326 V290 M208 262 V290" {...DETAIL} />
      <Stroke d="M240 262 V290 M272 262 V290 M304 262 V290" tone="gold" width={0.6} opacity={0.95} />

      {/* Shelves with objects */}
      <Stroke d="M70 128 H160 M70 176 H160" tone="cream" width={1.6} />
      <Stroke
        d="M84 128 V116 M84 116 A6 6 0 0 1 96 116 M96 116 V128 M118 128 V112 H130 V128 M144 128 V120 A4 4 0 0 1 152 120 V128"
        {...DETAIL}
      />
      <Stroke d="M80 176 V166 H94 V176 M112 176 V162 A7 7 0 0 1 126 162 V176" {...DETAIL} />

      {/* Counter left: heavy edge, brass cabinets */}
      <Stroke d="M58 242 H180" {...HEAVY} />
      <Stroke d="M66 248 H174 V290 H66 Z M120 248 V290 M84 266 H104 M136 266 H156" {...DETAIL} />

      {/* Pendant: brass stem, heavy ring (glow arrives with the fills) */}
      <Stroke d="M268 60 V80" tone="gold" width={0.9} opacity={0.95} />
      <StrokeCircle cx={268} cy={92} r={12} tone="cream" width={1.6} />

      {/* Plant sprig */}
      <Stroke
        d="M470 290 C468 272 476 262 472 250 M472 262 C480 258 484 250 483 244 M471 270 C464 266 460 258 461 252"
        tone="gold"
        width={0.9}
        opacity={0.95}
      />

      {/* Dimension: brass with proper ticks */}
      <FigurePath d="M198 302 V316 M336 302 V316 M198 311 H336" tone="gold" width={0.7} />
      <FigurePath d="M194 315 L202 307 M332 315 L340 307" tone="gold" width={0.7} />
      <Figure x={267} y={306} anchor="middle" size={9.5}>
        7&apos;-8 5/16&quot;
      </Figure>
    </AnimatedLinework>
  );
}
