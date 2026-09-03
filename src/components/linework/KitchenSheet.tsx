"use client";

/**
 * Kitchen elevation sheet — drafted to match the delivered luxury study:
 * Floor-to-ceiling pocket slider on the left, monolithic Calacatta waterfall
 * marble island with barstools, gooseneck faucet, and twin cylinder pendants
 * in the center, and 48" range with tapered custom hood and tall rift oak
 * cabinetry on the right.
 *
 * Wrap in `.linework-ink` on cream grounds: heavy ink + brass accents.
 * On dark grounds reads as cream structure + gold.
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
      viewBox="0 0 580 340"
      className={className}
      glow={glow}
      duration={2.2}
      stagger={0.04}
      figureDelay={1.9}
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
        <pattern
          id="marble-vein"
          width="24"
          height="24"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M0 12 Q6 4 12 10 T24 16 M8 0 Q14 10 20 6"
            stroke="var(--gold)"
            strokeWidth="0.6"
            opacity="0.35"
            fill="none"
          />
        </pattern>
      </defs>

      {/* Fills, poché, and warm lighting blooms — arrive with annotations */}
      <FigureGroup>
        {/* Sky / mountain vista through the glass slider */}
        <rect x="25" y="45" width="155" height="245" fill="var(--cream)" opacity="0.05" />
        {/* Waterfall island marble slab fill */}
        <rect x="190" y="186" width="195" height="8" fill="var(--cream)" opacity="0.95" />
        <rect x="190" y="194" width="8" height="96" fill="url(#kitchen-hatch)" />
        <rect x="377" y="194" width="8" height="96" fill="url(#kitchen-hatch)" />
        <rect x="198" y="194" width="179" height="96" fill="url(#marble-vein)" opacity="0.75" />
        {/* Twin pendant ambient light blooms */}
        <circle cx="250" cy="116" r="16" fill="var(--gold)" opacity="0.16" />
        <circle cx="325" cy="116" r="16" fill="var(--gold)" opacity="0.16" />
        {/* Backsplash marble slab */}
        <rect x="408" y="125" width="82" height="75" fill="var(--cream)" opacity="0.12" />
        {/* Patio fire bowl glow through slider */}
        <circle cx="105" cy="254" r="10" fill="var(--gold)" opacity="0.2" />
      </FigureGroup>

      {/* Main floor line */}
      <Stroke d="M15 290 H565" tone="cream" width={2.4} />

      {/* =========================================================
          LEFT: 12'-0" Multi-Slide Pocket Glass Doors
          ========================================================= */}
      {/* Outer frame & pocket jamb */}
      <Stroke d="M25 45 H180 V290 H25 Z" {...HEAVY} />
      <Stroke d="M20 45 V290 M185 45 V290" tone="cream" width={1.2} opacity={0.6} />
      {/* Glass stiles & sliding track */}
      <Stroke d="M78 45 V290 M132 45 V290" {...DETAIL} />
      <Stroke d="M25 286 H180 M25 283 H180" tone="gold" width={0.7} opacity={0.9} />
      {/* Mountain silhouette on exterior horizon */}
      <Stroke
        d="M28 230 Q65 190 100 215 T155 195 T180 220"
        tone="gold"
        width={0.8}
        opacity={0.6}
      />
      {/* Fire bowl on exterior terrace */}
      <Stroke d="M92 258 Q105 264 118 258" tone="gold" width={1.2} />
      <Stroke d="M98 254 Q105 240 107 245 Q112 242 112 254" tone="gold" width={0.8} />

      {/* =========================================================
          CENTER: Monolithic Calacatta Marble Waterfall Island
          ========================================================= */}
      {/* Top 3" mitred marble slab */}
      <Stroke d="M190 186 H385 V194 H190 Z" tone="cream" width={1.8} />
      {/* Left & right waterfall returns */}
      <Stroke d="M190 194 V290 H198 V194" tone="cream" width={1.6} />
      <Stroke d="M385 194 V290 H377 V194" tone="cream" width={1.6} />
      {/* Island cabinet reveals / shadow gap */}
      <Stroke d="M198 198 H377 M257 198 V290 M317 198 V290" {...DETAIL} />

      {/* Under-counter barstools */}
      {/* Stool 1 */}
      <Stroke d="M216 226 H244" tone="cream" width={1.4} />
      <Stroke d="M220 226 V290 M240 226 V290 M220 264 H240" {...DETAIL} />
      {/* Stool 2 */}
      <Stroke d="M276 226 H304" tone="cream" width={1.4} />
      <Stroke d="M280 226 V290 M300 226 V290 M280 264 H300" {...DETAIL} />
      {/* Stool 3 */}
      <Stroke d="M336 226 H364" tone="cream" width={1.4} />
      <Stroke d="M340 226 V290 M360 226 V290 M340 264 H360" {...DETAIL} />

      {/* Gooseneck brass faucet */}
      <Stroke
        d="M284 186 V158 A9 9 0 0 1 302 158 V170"
        tone="gold"
        width={1.5}
        opacity={0.95}
      />
      <Stroke d="M296 172 H302" tone="gold" width={1.2} />

      {/* Twin architectural cylinder pendant lights */}
      {/* Pendant 1 */}
      <Stroke d="M250 45 V96" tone="gold" width={0.8} />
      <Stroke d="M246 96 H254 V116 H246 Z" tone="cream" width={1.2} />
      {/* Pendant 2 */}
      <Stroke d="M325 45 V96" tone="gold" width={0.8} />
      <Stroke d="M321 96 H329 V116 H321 Z" tone="cream" width={1.2} />

      {/* =========================================================
          RIGHT: Custom Rift Oak Cabinetry, Range & Tapered Hood
          ========================================================= */}
      {/* Full-height tall cabinetry on far right */}
      <Stroke d="M495 45 H555 V290 H495 Z" {...HEAVY} />
      <Stroke d="M525 45 V290 M495 180 H555" {...DETAIL} />

      {/* Custom tapered range hood */}
      <Stroke d="M408 125 H490 L475 45 H423 Z" {...HEAVY} />
      <Stroke d="M420 85 H478" tone="gold" width={0.6} opacity={0.8} />

      {/* Floating stone shelf with vessels */}
      <Stroke d="M408 152 H490" tone="cream" width={2} />
      {/* Curated vessel on shelf */}
      <Stroke d="M428 152 V142 A5 5 0 0 1 438 142 V152" {...DETAIL} />
      <Stroke d="M458 152 V138 H470 V152" {...DETAIL} />

      {/* 48" Professional range */}
      <Stroke d="M410 196 H490 V290 H410 Z" {...HEAVY} />
      <Stroke d="M410 206 H490" tone="gold" width={0.8} />
      {/* Burner knobs & oven door handles */}
      <Stroke d="M418 220 H482 V270 H418 Z M424 235 H476" {...DETAIL} />
      <StrokeCircle cx={425} cy={201} r={2} tone="gold" width={0.7} />
      <StrokeCircle cx={445} cy={201} r={2} tone="gold" width={0.7} />
      <StrokeCircle cx={465} cy={201} r={2} tone="gold" width={0.7} />

      {/* =========================================================
          DIMENSIONS & ARCHITECTURAL ANNOTATIONS
          ========================================================= */}
      {/* Slider dimension */}
      <FigurePath d="M25 35 V20 M180 35 V20 M25 26 H180" tone="gold" width={0.7} />
      <FigurePath d="M21 30 L29 22 M176 30 L184 22" tone="gold" width={0.7} />
      <Figure x={102} y={20} anchor="middle" size={9.5}>
        12&apos;-0&quot; SLIDER
      </Figure>

      {/* Island dimension */}
      <FigurePath d="M190 306 V322 M385 306 V322 M190 316 H385" tone="gold" width={0.7} />
      <FigurePath d="M186 320 L194 312 M381 320 L389 312" tone="gold" width={0.7} />
      <Figure x={287} y={310} anchor="middle" size={9.5}>
        9&apos;-6&quot; WATERFALL ISLAND
      </Figure>

      {/* Range hood callout */}
      <FigurePath d="M450 35 V20 M490 35 V20 M450 26 H490" tone="gold" width={0.7} />
      <Figure x={450} y={20} anchor="middle" size={9.5}>
        48&quot; RANGE
      </Figure>
    </AnimatedLinework>
  );
}
