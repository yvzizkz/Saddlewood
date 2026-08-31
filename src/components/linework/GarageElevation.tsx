"use client";

/**
 * Garage-side line elevation of the Paradise Valley estate — v2, the
 * premium-standard two-ink treatment: heavy ink structure with poché
 * fascias, brass detail, earth hatch at grade, and life for scale (a
 * saguaro, an agave, a figure at the entry). The 24' height note, T.O.R.
 * marks, and F.F.E. datum are kept deliberately: they read authentic and
 * identify no one.
 *
 * Wrap in `.linework-ink` on cream grounds (warm ink + accessible brass);
 * on dark grounds the same tones read as cream structure + gold detail.
 */

import {
  AnimatedLinework,
  Figure,
  FigureGroup,
  FigurePath,
  Stroke,
} from "./AnimatedLinework";

export interface GarageElevationProps {
  className?: string;
  glow?: boolean;
  /** Seconds before the first stroke starts drawing. */
  delay?: number;
}

const HEAVY = { tone: "cream", width: 1.8 } as const;
const DETAIL = { tone: "gold", width: 0.7, opacity: 0.95 } as const;

export function GarageElevation({ className, glow = false, delay = 0 }: GarageElevationProps) {
  return (
    <AnimatedLinework
      viewBox="0 0 960 330"
      className={className}
      glow={glow}
      delay={delay}
      duration={2.2}
      stagger={0.05}
      figureDelay={2.0}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <pattern id="garage-earth" width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M0 8 L8 0" stroke="var(--gold)" strokeWidth="0.7" opacity="0.5" />
        </pattern>
      </defs>

      {/* Poché fascias + earth hatch — arrive with the annotations */}
      <FigureGroup>
        <rect x="30" y="272" width="900" height="10" fill="url(#garage-earth)" />
        <rect x="105" y="188" width="210" height="8" fill="var(--cream)" opacity="0.9" />
        <rect x="288" y="108" width="194" height="10" fill="var(--cream)" opacity="0.9" />
        <rect x="458" y="154" width="426" height="8" fill="var(--cream)" opacity="0.9" />
      </FigureGroup>

      {/* Ground: heavy ink */}
      <Stroke d="M30 270 H930" tone="cream" width={2.6} />

      {/* Saguaro, far left */}
      <Stroke
        d="M38 270 V208 M38 224 C30 224 28 216 28 208 M28 208 V196 M38 232 C46 232 48 224 48 218 M48 218 V204"
        tone="gold"
        width={1.1}
        opacity={0.95}
      />

      {/* Slat fence */}
      <Stroke d="M58 232 H120" {...HEAVY} />
      <Stroke
        d="M63 232 V270 M71 232 V270 M79 232 V270 M87 232 V270 M95 232 V270 M103 232 V270 M111 232 V270 M119 232 V270"
        {...DETAIL}
      />

      {/* Left low wing */}
      <Stroke d="M120 196 V270 M300 196 V270" {...HEAVY} />
      <Stroke
        d="M132 204 V270 M141 204 V270 M150 204 V270 M159 204 V270 M168 204 V270 M177 204 V270 M186 204 V270 M195 204 V270 M204 204 V270"
        {...DETAIL}
      />
      <Stroke d="M218 270 V206 H290 V270 M254 206 V270" tone="gold" width={0.8} opacity={0.95} />

      {/* Center tall mass */}
      <Stroke d="M300 118 V270 M470 118 V270" {...HEAVY} />
      <Stroke
        d="M308 128 H462 M308 146 H462 M308 128 V146 M332 128 V146 M356 128 V146 M380 128 V146 M404 128 V146 M428 128 V146 M452 128 V146 M462 128 V146"
        {...DETAIL}
      />
      <Stroke d="M312 270 V156 H382 V270 M347 156 V270 M312 213 H382" tone="gold" width={0.8} opacity={0.95} />
      <Stroke d="M398 270 V178 H442 V270 M420 178 V270" tone="gold" width={0.8} opacity={0.95} />
      <Stroke d="M352 108 V100 H392 V108" tone="gold" width={0.8} opacity={0.95} />

      {/* Garage volume */}
      <Stroke d="M470 162 V270 M870 162 V270" {...HEAVY} />
      <Stroke
        d="M500 270 V186 H660 V270 M500 207 H660 M500 228 H660 M500 249 H660 M520 186 V270 M540 186 V270 M560 186 V270 M580 186 V270 M600 186 V270 M620 186 V270 M640 186 V270"
        {...DETAIL}
      />
      <Stroke
        d="M690 270 V186 H850 V270 M690 207 H850 M690 228 H850 M690 249 H850 M710 186 V270 M730 186 V270 M750 186 V270 M770 186 V270 M790 186 V270 M810 186 V270 M830 186 V270"
        {...DETAIL}
      />
      <Stroke d="M700 154 V146 H734 V154" tone="gold" width={0.8} opacity={0.95} />

      {/* Agave, right */}
      <Stroke
        d="M902 270 C898 254 892 246 884 240 M902 270 C902 250 900 242 898 234 M902 270 C906 252 912 244 920 238 M902 270 C908 256 916 250 924 248"
        tone="gold"
        width={1}
        opacity={0.95}
      />

      {/* Annotations: brass, after the linework */}
      <FigurePath d="M60 84 H900" dash="10 6" tone="gold" width={0.7} />
      <FigurePath d="M288 118 H248 M884 162 H920 M30 270 V284" tone="gold" width={0.7} />
      <Figure x={480} y={76} anchor="middle" size={10}>
        24&apos; HEIGHT RESTRICTION FROM LNG
      </Figure>
      <Figure x={242} y={121} anchor="end" size={10}>
        T.O.R. 119&apos;-0&quot;
      </Figure>
      <Figure x={924} y={165} size={10}>
        T.O.R. 112&apos;-0&quot;
      </Figure>
      <Figure x={36} y={288} size={10}>
        F.F.E. 100&apos;-0&quot;
      </Figure>
      <Figure x={36} y={316} size={10}>
        GARAGE SIDE · 3/16&quot; = 1&apos;-0&quot; · PARADISE VALLEY
      </Figure>
    </AnimatedLinework>
  );
}
