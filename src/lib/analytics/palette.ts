// The chart colors: eight hues drawn from the brand (teal, terracotta, slate,
// gold, plum, sage, rose, violet), in a fixed order that passes the colorblind
// and contrast checks on a white card (dataviz validator, 10/20: worst adjacent
// CVD ΔE 9.2, normal-vision ΔE 20.1, every slot >= 3:1 on #fff).
//
// Colors follow the thing, not its rank: a trade keeps its color whatever the
// period or filter, and a group past the eighth folds into "Other" (gray).

export const SERIES = ["#008a7c", "#c4572f", "#3d6fb0", "#b8861a", "#8a4f8f", "#4f8f3f", "#cf6f86", "#6d6bd0"] as const;

export const OTHER_COLOR = "#a39c92";
/** The single-series accent (trend lines, sparklines). */
export const ACCENT = "#182828";
export const ACCENT_WASH = "rgba(24,40,40,0.08)";
export const GRID = "#ece6dc";

/**
 * Trades get a fixed slot, so Framing is the same color on Payroll, Purchases
 * and the job page. Anything else takes the next free slot in the order given.
 */
const TRADE_SLOT: Record<string, number> = {
  framing: 0,
  drywall: 1,
  concrete: 2,
  finish: 3,
  "finish carpentry": 3,
  carpentry: 3,
  demo: 4,
  demolition: 4,
  insulation: 5,
  paint: 6,
  painting: 6,
  general: 7,
  "general conditions": 7,
};

export function colorMap(keys: readonly string[], opts: { trades?: boolean } = {}): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<number>();
  if (opts.trades) {
    for (const k of keys) {
      const slot = TRADE_SLOT[k.toLowerCase()];
      if (slot !== undefined && !used.has(slot)) {
        out.set(k, SERIES[slot]);
        used.add(slot);
      }
    }
  }
  let next = 0;
  for (const k of keys) {
    if (out.has(k)) continue;
    if (k === "__other" || k === "") {
      out.set(k, OTHER_COLOR);
      continue;
    }
    while (used.has(next) && next < SERIES.length) next++;
    if (next >= SERIES.length) {
      out.set(k, OTHER_COLOR);
      continue;
    }
    out.set(k, SERIES[next]);
    used.add(next);
  }
  return out;
}
