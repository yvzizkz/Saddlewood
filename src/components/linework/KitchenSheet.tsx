"use client";

/**
 * Kitchen elevation sheet — traced from the project's millwork set
 * (delivered in the 2026-08-28 handoff). Island with waterfall edges,
 * window with operable sash arrow, pendant, wine fridge, and the real
 * drafting dims (3'-0", 7'-8 5/16", SL-2 WATERFALL).
 *
 * Monochrome drafting sheet; wrap in `.linework-ink` on cream grounds.
 */

import {
  AnimatedLinework,
  Figure,
  FigurePath,
  Stroke,
  StrokeCircle,
} from "./AnimatedLinework";

export interface KitchenSheetProps {
  className?: string;
  glow?: boolean;
}

const THIN = { width: 0.75, opacity: 0.9 } as const;

export function KitchenSheet({ className, glow = false }: KitchenSheetProps) {
  return (
    <AnimatedLinework
      viewBox="0 0 560 390"
      className={className}
      glow={glow}
      duration={2.2}
      stagger={0.05}
      figureDelay={2.0}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Ceiling and floor */}
      <Stroke d="M30 42 H530" width={1.5} />
      <Stroke d="M30 332 H530" width={1.5} />
      {/* Left wall column */}
      <Stroke d="M46 42 V332 M58 42 V332" width={1.5} />
      {/* Open shelves */}
      <Stroke
        d="M70 108 H160 M70 156 H160 M70 108 V102 M160 108 V102 M70 156 V150 M160 156 V150"
        {...THIN}
      />
      {/* Counter left */}
      <Stroke d="M58 222 H180" width={1.5} />
      <Stroke d="M58 228 H180" {...THIN} />
      {/* Wine fridge + drawers */}
      <Stroke d="M66 236 H112 V326 H66 Z M72 242 H106 V320 H72 Z M104 250 V262" {...THIN} />
      <Stroke
        d="M120 236 H172 V278 H120 Z M120 284 H172 V326 H120 Z M138 256 H154 M138 304 H154"
        {...THIN}
      />
      {/* Window */}
      <Stroke d="M212 78 H352 V192 H212 Z" width={1.5} />
      <Stroke d="M282 78 V192 M218 84 H276 V186 H218 Z M288 84 H346 V186 H288 Z" {...THIN} />
      <Stroke d="M340 100 L316 100 M322 96 L316 100 L322 104" {...THIN} />
      {/* Pendant */}
      <Stroke d="M268 42 V58" {...THIN} />
      <StrokeCircle cx={268} cy={70} r={12} {...THIN} />
      {/* Island with waterfall */}
      <Stroke d="M198 240 H336 M198 246 H336" width={1.5} />
      <Stroke d="M198 240 V332 M206 246 V332 M336 240 V332 M328 246 V332" width={1.5} />
      <Stroke d="M248 240 V228 M252 240 V228 M244 228 H258" {...THIN} />
      {/* Stool */}
      <Stroke d="M352 272 H382 M356 272 V332 M378 272 V332 M354 300 H380" {...THIN} />

      {/* Dimensions — fade in after linework */}
      <FigurePath d="M344 246 H366 M344 332 H366 M360 246 V332" {...THIN} />
      <FigurePath d="M356 250 L364 242 M356 336 L364 328" {...THIN} />
      <Figure
        x={392}
        y={292}
        anchor="middle"
        size={9.5}
        transform="rotate(-90 392 292)"
      >
        3&apos;-0&quot;
      </Figure>
      <FigurePath d="M198 344 V362 M336 344 V362 M198 356 H336" {...THIN} />
      <FigurePath d="M194 360 L202 352 M332 360 L340 352" {...THIN} />
      <Figure x={267} y={350} anchor="middle" size={9.5}>
        7&apos;-8 5/16&quot;
      </Figure>
      <FigurePath d="M176 284 H200" {...THIN} />
      <Figure x={172} y={287} anchor="end" size={9.5}>
        SL-2 WATERFALL
      </Figure>
      <Figure x={330} y={108} size={9.5}>
        OPERABLE
      </Figure>
      <Figure x={36} y={380} size={9.5}>
        1H · KITCHEN ELEVATIONS · 1/2&quot; = 1&apos;-0&quot;
      </Figure>
    </AnimatedLinework>
  );
}
