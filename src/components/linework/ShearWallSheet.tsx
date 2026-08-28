"use client";

/**
 * Perforated shear wall detail, traced from the engineer's structural set
 * for the active Paradise Valley steel build (2026-08-28 handoff). Steel
 * studs at 16" O.C., lintel per plan, holdown, and the sheathing panel
 * with edge/field screws.
 *
 * Monochrome drafting sheet; reads full-gold on the dark ground.
 */

import {
  AnimatedLinework,
  Figure,
  FigurePath,
  Stroke,
  StrokeCircle,
} from "./AnimatedLinework";

export interface ShearWallSheetProps {
  className?: string;
  glow?: boolean;
}

const THIN = { width: 0.75, opacity: 0.9 } as const;

export function ShearWallSheet({ className, glow = false }: ShearWallSheetProps) {
  return (
    <AnimatedLinework
      viewBox="0 0 560 390"
      className={className}
      glow={glow}
      duration={2.2}
      stagger={0.05}
      figureDelay={2.3}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Top track and floor */}
      <Stroke d="M40 66 H520 M40 74 H520" width={1.5} />
      <Stroke d="M40 318 H520 M40 326 H520" width={1.5} />
      {/* Studs, left bay */}
      <Stroke d="M64 74 V318 M72 74 V318" {...THIN} />
      <Stroke
        d="M104 74 V318 M136 74 V318 M168 74 V318 M200 74 V318 M232 74 V318 M264 74 V318"
        {...THIN}
      />
      {/* Lintel over opening */}
      <Stroke d="M136 140 H264 M136 152 H264" width={1.5} />
      <Stroke
        d="M140 152 L152 140 M156 152 L168 140 M172 152 L184 140 M188 152 L200 140 M204 152 L216 140 M220 152 L232 140 M236 152 L248 140 M252 152 L260 144"
        {...THIN}
      />
      {/* Opening */}
      <Stroke d="M156 158 H244 V252 H156 Z M156 158 L244 252" {...THIN} />
      {/* Blocking rows */}
      <Stroke d="M64 200 H136 M64 206 H136 M64 260 H136 M64 266 H136" {...THIN} />
      {/* Holdown */}
      <Stroke d="M76 296 H100 V318 H76 Z" {...THIN} />
      <StrokeCircle cx={84} cy={307} r={3} {...THIN} />
      <StrokeCircle cx={93} cy={307} r={3} {...THIN} />
      {/* Sheathing panel, right */}
      <Stroke d="M292 74 H500 V318 H292 Z" width={1.5} />
      <Stroke d="M292 196 H500" {...THIN} />
      {/* Field screws — dots fade in with the annotations (a pathLength
          draw would distort the dot pattern) */}
      <FigurePath
        d="M316 100 h.1 M348 100 h.1 M380 100 h.1 M412 100 h.1 M444 100 h.1 M476 100 h.1
           M316 132 h.1 M348 132 h.1 M380 132 h.1 M412 132 h.1 M444 132 h.1 M476 132 h.1
           M316 164 h.1 M348 164 h.1 M380 164 h.1 M412 164 h.1 M444 164 h.1 M476 164 h.1
           M316 228 h.1 M348 228 h.1 M380 228 h.1 M412 228 h.1 M444 228 h.1 M476 228 h.1
           M316 260 h.1 M348 260 h.1 M380 260 h.1 M412 260 h.1 M444 260 h.1 M476 260 h.1
           M316 292 h.1 M348 292 h.1 M380 292 h.1 M412 292 h.1 M444 292 h.1 M476 292 h.1"
        width={2.5}
        opacity={0.9}
      />

      {/* Dims + labels — fade in after linework */}
      <FigurePath d="M136 58 V40 M264 58 V40 M136 46 H264" {...THIN} />
      <FigurePath d="M132 50 L140 42 M260 50 L268 42" {...THIN} />
      <Figure x={200} y={38} anchor="middle" size={9.5}>
        32&quot; MAX
      </Figure>
      <FigurePath d="M264 46 H330" {...THIN} />
      <Figure x={297} y={38} anchor="middle" size={9.5}>
        20&quot; TYP
      </Figure>
      <FigurePath d="M60 120 H30" {...THIN} />
      <Figure x={28} y={112} size={9.5}>
        STEEL STUDS
      </Figure>
      <Figure x={28} y={132} size={9.5}>
        16&quot; O.C.
      </Figure>
      <FigurePath d="M200 146 V120" {...THIN} />
      <Figure x={204} y={116} size={9.5}>
        LINTEL PER PLAN
      </Figure>
      <FigurePath d="M100 307 L120 290" {...THIN} />
      <Figure x={124} y={288} size={9.5}>
        HOLDOWN
      </Figure>
      <FigurePath d="M500 90 H524" {...THIN} />
      <Figure x={526} y={93} size={9.5}>
        EDGE SCREWS · TYP
      </Figure>
      <FigurePath d="M500 318 H524" {...THIN} />
      <Figure x={526} y={321} size={9.5}>
        FLOOR LINE
      </Figure>
      <Figure x={36} y={376} size={9.5}>
        PERFORATED SHEAR WALL DETAIL · S-SERIES · PARADISE VALLEY
      </Figure>
    </AnimatedLinework>
  );
}
