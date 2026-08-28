"use client";

/**
 * Garage-side line elevation of the Paradise Valley estate, traced from the
 * project's working drawings (delivered in the 2026-08-28 handoff demo).
 * The 24' height-restriction note, T.O.R. marks, and F.F.E. datum are kept
 * deliberately: they read authentic and identify no one.
 *
 * Monochrome drafting sheet: every stroke draws in the gold tone (wrap in
 * `.linework-ink` on cream grounds for accessible drafting ink).
 */

import {
  AnimatedLinework,
  Figure,
  FigurePath,
  Stroke,
} from "./AnimatedLinework";

export interface GarageElevationProps {
  className?: string;
  glow?: boolean;
}

const THIN = { width: 0.75, opacity: 0.9 } as const;

export function GarageElevation({ className, glow = false }: GarageElevationProps) {
  return (
    <AnimatedLinework
      viewBox="0 0 960 320"
      className={className}
      glow={glow}
      duration={2.2}
      stagger={0.05}
      figureDelay={2.3}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Ground line */}
      <Stroke d="M30 270 H930" width={1.5} />

      {/* Far-left slat fence */}
      <Stroke d="M40 232 H120" width={1.5} />
      <Stroke
        d="M46 232 V270 M54 232 V270 M62 232 V270 M70 232 V270 M78 232 V270 M86 232 V270 M94 232 V270 M102 232 V270 M110 232 V270 M118 232 V270"
        {...THIN}
      />

      {/* Left low wing: cantilevered roof plane with thick fascia */}
      <Stroke d="M105 196 H315 M105 188 H315 M105 188 V196 M315 188 V196" width={1.5} />
      <Stroke d="M120 196 V270 M300 196 V270" width={1.5} />
      {/* Slat screen */}
      <Stroke
        d="M132 204 V270 M141 204 V270 M150 204 V270 M159 204 V270 M168 204 V270 M177 204 V270 M186 204 V270 M195 204 V270 M204 204 V270"
        {...THIN}
      />
      {/* Glazing */}
      <Stroke d="M218 270 V206 H290 V270 M254 206 V270" {...THIN} />

      {/* Center tall mass: main roof plane */}
      <Stroke d="M288 118 H482 M288 108 H482 M288 108 V118 M482 108 V118" width={1.5} />
      <Stroke d="M300 118 V270 M470 118 V270" width={1.5} />
      {/* Clerestory band */}
      <Stroke
        d="M308 128 H462 M308 146 H462 M308 128 V146 M332 128 V146 M356 128 V146 M380 128 V146 M404 128 V146 M428 128 V146 M452 128 V146 M462 128 V146"
        {...THIN}
      />
      {/* Full-height glazing + entry */}
      <Stroke d="M312 270 V156 H382 V270 M347 156 V270 M312 213 H382" {...THIN} />
      <Stroke d="M398 270 V178 H442 V270 M420 178 V270" {...THIN} />
      {/* Rooftop element */}
      <Stroke d="M352 108 V100 H392 V108" {...THIN} />

      {/* Right garage volume: long low roof plane */}
      <Stroke d="M458 162 H884 M458 154 H884 M458 154 V162 M884 154 V162" width={1.5} />
      <Stroke d="M470 162 V270 M870 162 V270" width={1.5} />
      {/* Garage door A: panel grid */}
      <Stroke
        d="M500 270 V186 H660 V270 M500 207 H660 M500 228 H660 M500 249 H660 M520 186 V270 M540 186 V270 M560 186 V270 M580 186 V270 M600 186 V270 M620 186 V270 M640 186 V270"
        {...THIN}
      />
      {/* Garage door B: panel grid */}
      <Stroke
        d="M690 270 V186 H850 V270 M690 207 H850 M690 228 H850 M690 249 H850 M710 186 V270 M730 186 V270 M750 186 V270 M770 186 V270 M790 186 V270 M810 186 V270 M830 186 V270"
        {...THIN}
      />
      {/* Rooftop element on garage roof */}
      <Stroke d="M700 154 V146 H734 V154" {...THIN} />

      {/* Dimensions and notes: fade in after linework */}
      <FigurePath d="M60 84 H900" dash="10 6" width={0.8} opacity={0.85} />
      <Figure x={480} y={76} anchor="middle" size={9.5}>
        24&apos; HEIGHT RESTRICTION FROM LNG
      </Figure>
      <FigurePath d="M288 118 H248" {...THIN} />
      <Figure x={242} y={121} anchor="end" size={9.5}>
        T.O.R. 119&apos;-0&quot;
      </Figure>
      <FigurePath d="M884 162 H920" {...THIN} />
      <Figure x={922} y={165} size={9.5}>
        T.O.R. 112&apos;-0&quot;
      </Figure>
      <FigurePath d="M30 270 V284" {...THIN} />
      <Figure x={36} y={288} size={9.5}>
        F.F.E. 100&apos;-0&quot;
      </Figure>
      <Figure x={36} y={308} size={9.5}>
        GARAGE SIDE · 3/16&quot; = 1&apos;-0&quot; · PARADISE VALLEY
      </Figure>
    </AnimatedLinework>
  );
}
