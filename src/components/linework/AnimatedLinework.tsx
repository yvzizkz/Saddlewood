"use client";

/**
 * Shared draw-on linework wrapper for the "Night Blueprint" design direction.
 *
 * Renders a decorative motion.svg whose stroke children draw themselves on
 * (pathLength 0 -> 1) when scrolled into view, staggered like a hand-drafted
 * elevation coming off the board. Dimension figures (the 18'-0" style
 * annotations) fade up only after the lines have landed. When the visitor
 * prefers reduced motion, everything renders fully drawn and static.
 *
 * Theming flows from the parent: strokes use the site CSS variables
 * (--gold, --cream) so the same drawing reads correctly on teal-dark or
 * cream grounds. No hex is hardcoded except the gold glow fallback, where
 * the preview deliberately layers gold over cream.
 */

import { motion, type Variants } from "framer-motion";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import {
  createContext,
  useContext,
  useId,
  useMemo,
  type CSSProperties,
  type ReactNode,
} from "react";

/** Signature ease for all linework animation — matches the Night Blueprint preview. */
export const LINEWORK_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/**
 * Stroke tones, mapped to theme CSS variables.
 * - "gold"  → var(--gold), weight 1.25 (primary architecture lines)
 * - "cream" → var(--cream), weight 1 (ground, landscape, context lines)
 * - "dim"   → var(--cream) at 55% (dimension strings and witness lines)
 */
export type StrokeTone = "gold" | "cream" | "dim";

const TONE_COLOR: Record<StrokeTone, string> = {
  gold: "var(--gold)",
  cream: "var(--cream)",
  dim: "var(--cream)",
};

const TONE_OPACITY: Record<StrokeTone, number> = {
  gold: 1,
  cream: 1,
  dim: 0.55,
};

const TONE_WIDTH: Record<StrokeTone, number> = {
  gold: 1.25,
  cream: 1,
  dim: 1,
};

const FIGURE_FADE_DURATION = 0.8;

function drawVariants(duration: number): Variants {
  return {
    hidden: { pathLength: 0 },
    visible: {
      pathLength: 1,
      transition: { duration, ease: LINEWORK_EASE },
    },
  };
}

function fadeVariants(delay: number): Variants {
  return {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { duration: FIGURE_FADE_DURATION, delay, ease: LINEWORK_EASE },
    },
  };
}

interface LineworkContextValue {
  /** prefers-reduced-motion — render fully drawn, never animate. */
  reduced: boolean;
  /** Default draw duration (s) for strokes in this drawing. */
  duration: number;
  /** Seconds after the drawing enters view before figures fade up. */
  figureDelay: number;
}

const LineworkContext = createContext<LineworkContextValue>({
  reduced: false,
  duration: 1.6,
  figureDelay: 1.9,
});

/** Prepared variants handed to a render-prop child for custom motion elements. */
export interface PreparedLineworkVariants {
  /** For an orchestrating motion group (already applied to the root motion.svg). */
  container: Variants;
  /** Draw-on variants for one stroke; pass a duration in seconds to override. */
  stroke: (duration?: number) => Variants;
  /** Fade-up variants for a dimension figure; offset (s) is added after lines land. */
  figure: (delayOffset?: number) => Variants;
  /** True when prefers-reduced-motion — the variants above become static. */
  reduced: boolean;
}

export interface AnimatedLineworkProps {
  /** SVG viewBox, in the coordinate space the strokes are drafted in. */
  viewBox: string;
  className?: string;
  /** Motion children, or a render prop receiving prepared variants. */
  children: ReactNode | ((variants: PreparedLineworkVariants) => ReactNode);
  /** Seconds before the first stroke starts drawing. Default 0. */
  delay?: number;
  /** Seconds between successive strokes. Default 0.08. */
  stagger?: number;
  /** Default draw duration per stroke in seconds (1.2–2.4). Default 1.6. */
  duration?: number;
  /** Seconds until dimension figures fade up (after lines land). Default 1.9. */
  figureDelay?: number;
  /** Soft gold glow via an SVG feDropShadow filter. Default false. */
  glow?: boolean;
  preserveAspectRatio?: string;
  style?: CSSProperties;
}

export function AnimatedLinework({
  viewBox,
  className,
  children,
  delay = 0,
  stagger = 0.08,
  duration = 1.6,
  figureDelay = 1.9,
  glow = false,
  preserveAspectRatio,
  style,
}: AnimatedLineworkProps) {
  const reduced = usePrefersReducedMotion();
  const rawId = useId();
  const glowId = `lw-glow-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const contextValue = useMemo<LineworkContextValue>(
    () => ({ reduced, duration, figureDelay }),
    [reduced, duration, figureDelay]
  );

  const containerVariants = useMemo<Variants>(
    () => ({
      hidden: {},
      visible: {
        transition: { delayChildren: delay, staggerChildren: stagger },
      },
    }),
    [delay, stagger]
  );

  const prepared = useMemo<PreparedLineworkVariants>(() => {
    if (reduced) {
      const staticStroke: Variants = {
        hidden: { pathLength: 1 },
        visible: { pathLength: 1 },
      };
      const staticFigure: Variants = {
        hidden: { opacity: 1 },
        visible: { opacity: 1 },
      };
      return {
        container: containerVariants,
        stroke: () => staticStroke,
        figure: () => staticFigure,
        reduced: true,
      };
    }
    return {
      container: containerVariants,
      stroke: (d?: number) => drawVariants(d ?? duration),
      figure: (offset = 0) => fadeVariants(figureDelay + offset),
      reduced: false,
    };
  }, [reduced, containerVariants, duration, figureDelay]);

  const content = typeof children === "function" ? children(prepared) : children;

  return (
    <LineworkContext.Provider value={contextValue}>
      <motion.svg
        viewBox={viewBox}
        preserveAspectRatio={preserveAspectRatio}
        className={className}
        style={style}
        fill="none"
        aria-hidden="true"
        focusable="false"
        variants={containerVariants}
        initial={reduced ? "visible" : "hidden"}
        whileInView="visible"
        // Handoff motion spec: sheets start drawing at 30% visibility.
        viewport={{ once: true, amount: 0.3 }}
      >
        {glow ? (
          <>
            <defs>
              <filter
                id={glowId}
                x="-20%"
                y="-20%"
                width="140%"
                height="140%"
                colorInterpolationFilters="sRGB"
              >
                <feDropShadow
                  dx="0"
                  dy="0"
                  stdDeviation="3"
                  style={{
                    floodColor: "var(--gold, #c8a55a)",
                    floodOpacity: 0.35,
                  }}
                />
              </filter>
            </defs>
            <g filter={`url(#${glowId})`}>{content}</g>
          </>
        ) : (
          content
        )}
      </motion.svg>
    </LineworkContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/* Stroke primitives                                                   */
/* ------------------------------------------------------------------ */

interface StrokeStyleProps {
  /** Theme tone. Default "gold". */
  tone?: StrokeTone;
  /** Stroke width in viewBox units; defaults per tone (gold 1.25, cream/dim 1). */
  width?: number;
  /** Static opacity multiplier (preview's "half" = 0.5, "faint" = 0.28). */
  opacity?: number;
  /** Draw duration override in seconds. */
  duration?: number;
}

function useStrokeAttrs({ tone = "gold", width, opacity }: StrokeStyleProps) {
  return {
    stroke: TONE_COLOR[tone],
    strokeWidth: width ?? TONE_WIDTH[tone],
    strokeOpacity: (opacity ?? 1) * TONE_OPACITY[tone],
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
  };
}

export interface StrokeProps extends StrokeStyleProps {
  /** SVG path data, ported verbatim from the drafted drawing. */
  d: string;
}

/** One draw-on line of the drawing. Renders motion.path (static path when reduced). */
export function Stroke({ d, duration, ...styleProps }: StrokeProps) {
  const ctx = useContext(LineworkContext);
  const attrs = useStrokeAttrs(styleProps);
  if (ctx.reduced) {
    return <path d={d} {...attrs} />;
  }
  return (
    <motion.path d={d} {...attrs} variants={drawVariants(duration ?? ctx.duration)} />
  );
}

export interface StrokeRectProps extends Omit<StrokeStyleProps, "width"> {
  x: number;
  y: number;
  width: number;
  height: number;
  rx?: number;
  /** Stroke width in viewBox units (the rect's own `width` is its size). */
  strokeW?: number;
}

/** A draw-on rectangle (plan furniture, sheathing panels, holdowns). */
export function StrokeRect({ x, y, width, height, rx, strokeW, duration, ...styleProps }: StrokeRectProps) {
  const ctx = useContext(LineworkContext);
  const attrs = useStrokeAttrs({ ...styleProps, width: strokeW });
  if (ctx.reduced) {
    return <rect x={x} y={y} width={width} height={height} rx={rx} {...attrs} />;
  }
  return (
    <motion.rect
      x={x}
      y={y}
      width={width}
      height={height}
      rx={rx}
      {...attrs}
      variants={drawVariants(duration ?? ctx.duration)}
    />
  );
}

export interface StrokeCircleProps extends StrokeStyleProps {
  cx: number;
  cy: number;
  r: number;
}

/** A draw-on circle (moon, north arrow ring, anchor bolts, plat nodes). */
export function StrokeCircle({ cx, cy, r, duration, ...styleProps }: StrokeCircleProps) {
  const ctx = useContext(LineworkContext);
  const attrs = useStrokeAttrs(styleProps);
  if (ctx.reduced) {
    return <circle cx={cx} cy={cy} r={r} {...attrs} />;
  }
  return (
    <motion.circle
      cx={cx}
      cy={cy}
      r={r}
      {...attrs}
      variants={drawVariants(duration ?? ctx.duration)}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Figures (dimension text + annotation lines that fade, not draw)     */
/* ------------------------------------------------------------------ */

export interface FigureProps {
  x: number;
  y: number;
  children: ReactNode;
  /**
   * "gold" — dimension figures (18'-0"), gold fill, 11 units.
   * "cream" — quiet drafting labels (F.F.E., room names), cream at 60%, 9.5 units.
   */
  tone?: "gold" | "cream";
  /** Font size in viewBox units. */
  size?: number;
  anchor?: "start" | "middle" | "end";
  /** Extra delay (s) after the shared figure fade-in starts, for cascading figures. */
  delay?: number;
  transform?: string;
}

const FIGURE_FONT: CSSProperties = {
  // Drafting voice: dimension figures and sheet labels set in mono.
  fontFamily: "var(--font-mono, 'SF Mono', ui-monospace, monospace)",
  letterSpacing: "0.08em",
  fontWeight: 500,
};

/** A dimension figure or drafting label that fades up after the lines land. */
export function Figure({
  x,
  y,
  children,
  tone = "gold",
  size,
  anchor = "start",
  delay = 0,
  transform,
}: FigureProps) {
  const ctx = useContext(LineworkContext);
  const attrs = {
    x,
    y,
    transform,
    textAnchor: anchor,
    fontSize: size ?? (tone === "gold" ? 11 : 9.5),
    fill: tone === "gold" ? "var(--gold)" : "var(--cream)",
    fillOpacity: tone === "gold" ? 1 : 0.6,
    style: FIGURE_FONT,
  };
  if (ctx.reduced) {
    return <text {...attrs}>{children}</text>;
  }
  return (
    <motion.text {...attrs} variants={fadeVariants(ctx.figureDelay + delay)}>
      {children}
    </motion.text>
  );
}

export interface FigurePathProps extends Omit<StrokeStyleProps, "duration"> {
  d: string;
  /** stroke-dasharray, e.g. "7 5" for the sliding-wall track. */
  dash?: string;
  /** Extra delay (s) after the shared figure fade-in starts. */
  delay?: number;
}

/**
 * An annotation line that fades in with the figures instead of drawing on —
 * used for dashed operable elements (e.g. the sliding-wall track) where a
 * pathLength draw would distort the dash pattern.
 */
export function FigurePath({ d, dash, delay = 0, ...styleProps }: FigurePathProps) {
  const ctx = useContext(LineworkContext);
  const attrs = { ...useStrokeAttrs(styleProps), strokeDasharray: dash };
  if (ctx.reduced) {
    return <path d={d} {...attrs} />;
  }
  return (
    <motion.path d={d} {...attrs} variants={fadeVariants(ctx.figureDelay + delay)} />
  );
}

export interface FigureGroupProps {
  children: ReactNode;
  /** Extra delay (s) after the shared figure fade-in starts. */
  delay?: number;
}

/**
 * A group of arbitrary SVG shapes (poché fills, hatches, glows, sky hints)
 * that fades in with the annotations. The drawing-upgrade standard fills
 * cut surfaces and adds one piece of life per sheet; fills can't draw on
 * via pathLength, so they arrive with the figures instead.
 */
export function FigureGroup({ children, delay = 0 }: FigureGroupProps) {
  const ctx = useContext(LineworkContext);
  if (ctx.reduced) {
    return <g>{children}</g>;
  }
  return (
    <motion.g variants={fadeVariants(ctx.figureDelay + delay)}>{children}</motion.g>
  );
}
