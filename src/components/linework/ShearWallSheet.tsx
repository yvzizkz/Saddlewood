"use client";

/**
 * Perforated shear wall detail — v2, the premium-standard two-ink
 * treatment: poché top track, floor, and end double studs; hatched lintel;
 * real screw dots on the sheathing; earth hatch below the floor line; and
 * a crew figure setting the panel for life and scale. Traced from the
 * engineer's structural set for the active Paradise Valley steel build.
 *
 * On the dark ground the heavy tone reads as cream structure + gold
 * detail; wrap in `.linework-ink` on cream grounds for warm ink + brass.
 */

import {
  AnimatedLinework,
  Figure,
  FigureGroup,
  FigurePath,
  Stroke,
  StrokeCircle,
  StrokeRect,
} from "./AnimatedLinework";

export interface ShearWallSheetProps {
  className?: string;
  glow?: boolean;
}

const DETAIL = { tone: "gold", width: 0.8, opacity: 0.95 } as const;

const SCREW_ROWS = [100, 132, 164, 226, 258, 290];
const SCREW_COLS = [316, 348, 380, 412, 444, 476];

export function ShearWallSheet({ className, glow = false }: ShearWallSheetProps) {
  return (
    <AnimatedLinework
      viewBox="0 0 560 400"
      className={className}
      glow={glow}
      duration={2.2}
      stagger={0.05}
      figureDelay={2.0}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <pattern
          id="lintel-hatch"
          width="7"
          height="7"
          patternTransform="rotate(45)"
          patternUnits="userSpaceOnUse"
        >
          <line x1="0" y1="0" x2="0" y2="7" stroke="var(--gold)" strokeWidth="1" opacity="0.6" />
        </pattern>
        <pattern id="shear-earth" width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M0 8 L8 0" stroke="var(--gold)" strokeWidth="0.7" opacity="0.5" />
        </pattern>
      </defs>

      {/* Poché track, floor, end studs, hatched lintel, earth, screw dots */}
      <FigureGroup>
        <rect x="40" y="64" width="480" height="9" fill="var(--cream)" opacity="0.9" />
        <rect x="40" y="316" width="480" height="9" fill="var(--cream)" opacity="0.9" />
        <rect x="40" y="327" width="480" height="11" fill="url(#shear-earth)" />
        <rect x="62" y="73" width="11" height="243" fill="var(--cream)" opacity="0.85" />
        <rect x="136" y="138" width="128" height="14" fill="url(#lintel-hatch)" />
        {SCREW_ROWS.flatMap((cy) =>
          SCREW_COLS.map((cx) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.6} fill="var(--gold)" />
          ))
        )}
      </FigureGroup>

      {/* Studs: brass */}
      <Stroke d="M104 73 V316 M136 73 V316 M168 73 V316 M200 73 V316 M232 73 V316 M264 73 V316" {...DETAIL} />
      {/* Lintel outline: heavy */}
      <StrokeRect x={136} y={138} width={128} height={14} tone="cream" strokeW={1.6} />
      {/* Opening */}
      <Stroke d="M156 158 H244 V250 H156 Z M156 158 L244 250" {...DETAIL} />
      {/* Blocking */}
      <Stroke d="M64 198 H136 M64 204 H136 M64 258 H136 M64 264 H136" tone="gold" width={0.7} opacity={0.95} />
      {/* Holdown: heavy box, brass anchors */}
      <StrokeRect x={76} y={294} width={24} height={22} tone="cream" strokeW={1.5} />
      <StrokeCircle cx={84} cy={305} r={3} tone="gold" width={0.9} opacity={0.95} />
      <StrokeCircle cx={93} cy={305} r={3} tone="gold" width={0.9} opacity={0.95} />
      {/* Sheathing: heavy border, brass panel joint */}
      <StrokeRect x={292} y={73} width={208} height={243} tone="cream" strokeW={1.8} />
      <Stroke d="M292 194 H500" tone="gold" width={0.7} opacity={0.95} />

      {/* Dims + labels: brass, after the linework */}
      <FigurePath d="M136 56 V38 M264 56 V38 M136 44 H264" tone="gold" width={0.7} />
      <FigurePath d="M132 48 L140 40 M260 48 L268 40" tone="gold" width={0.7} />
      <FigurePath
        d="M264 44 H330 M60 118 H30 M200 144 V120 M100 305 L120 288 M500 88 H524"
        tone="gold"
        width={0.7}
      />
      <Figure x={200} y={36} anchor="middle" size={10}>
        32&quot; MAX
      </Figure>
      <Figure x={297} y={36} anchor="middle" size={10}>
        20&quot; TYP
      </Figure>
      <Figure x={28} y={110} size={10}>
        WALL STUDS
      </Figure>
      <Figure x={28} y={130} size={10}>
        16&quot; O.C.
      </Figure>
      <Figure x={204} y={116} size={10}>
        LINTEL PER PLAN
      </Figure>
      <Figure x={124} y={286} size={10}>
        HOLDOWN
      </Figure>
      <Figure x={526} y={91} size={9}>
        EDGE
      </Figure>
      <Figure x={36} y={382} size={10}>
        PERFORATED SHEAR WALL DETAIL · S-SERIES · PARADISE VALLEY
      </Figure>
    </AnimatedLinework>
  );
}
