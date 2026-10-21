// The one trade list (public.trades, migration 0029), pure so a client screen
// can read it: every picker, label and default in the app comes from here.
// trades.ts reads the table and falls back to this; the slugs and labels are
// the ones 0029 seeded.
//
// Saddlewood is a GC (ROC 305762) holding its own CR-11 electrical, CR-37
// plumbing and CR-39 AC & refrigeration licenses: electrical, plumbing and
// HVAC are our trades, next to framing, insulation and drywall.

export type Trade = { slug: string; label: string; ord: number };

const LIST = [
  { slug: "general", label: "General conditions", short: "General" },
  { slug: "demo", label: "Demolition" },
  { slug: "concrete", label: "Concrete" },
  { slug: "framing", label: "Framing" },
  { slug: "roofing", label: "Roofing" },
  { slug: "windows", label: "Windows and doors" },
  { slug: "plumbing", label: "Plumbing" },
  { slug: "electrical", label: "Electrical" },
  { slug: "hvac", label: "HVAC" },
  { slug: "insulation", label: "Insulation" },
  { slug: "drywall", label: "Drywall" },
  { slug: "finish-carpentry", label: "Finish carpentry" },
  { slug: "cabinets", label: "Cabinets" },
  { slug: "tile", label: "Tile" },
  { slug: "flooring", label: "Flooring" },
  { slug: "paint", label: "Paint" },
  { slug: "landscape", label: "Landscape" },
  { slug: "cleanup", label: "Cleanup" },
  { slug: "tools", label: "Tools and equipment", short: "Tools" },
  { slug: "rentals", label: "Rentals" },
] as const;

export type TradeSlug = (typeof LIST)[number]["slug"];

export const TRADE_SLUGS = LIST.map((t) => t.slug) as readonly TradeSlug[];

export const DEFAULT_TRADES: Trade[] = LIST.map(({ slug, label }, i) => ({ slug, label, ord: (i + 1) * 10 }));

/** The company's license and the trade licenses it holds, by trade. */
export const COMPANY_LICENSE = "ROC 305762";
export const TRADE_LICENSES: Partial<Record<TradeSlug, string>> = { electrical: "CR-11", plumbing: "CR-37", hvac: "CR-39" };

/** The trades our own crews perform, in build order. */
export const SELF_PERFORMED = ["framing", "plumbing", "electrical", "hvac", "insulation", "drywall"] as const satisfies readonly TradeSlug[];
export type SelfPerformed = (typeof SELF_PERFORMED)[number];

/** The quick chips on a purchase search: the trades money most often goes to. */
export const QUICK_TRADES = ["framing", "drywall", "electrical", "plumbing", "hvac", "paint", "tools", "rentals", "general"] as const satisfies readonly TradeSlug[];

export function isTradeSlug(v: unknown): v is TradeSlug {
  return typeof v === "string" && (TRADE_SLUGS as readonly string[]).includes(v);
}

/** "hvac" -> "HVAC"; anything not on the list comes back as written. */
export function tradeLabel(slug: string): string {
  return LIST.find((t) => t.slug === slug)?.label ?? slug;
}

/** The short label for a chip: "General", "Tools"; otherwise the label. */
export function tradeShort(slug: string): string {
  const t = LIST.find((x) => x.slug === slug);
  return t ? ("short" in t ? t.short : t.label) : slug;
}

/** "Finish Carpentry", "finish carpentry", "finish-carpentry" -> "finish-carpentry". */
export function tradeSlug(text: string | null | undefined): string {
  return (text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Resolve free text (a person's trade) or a slug to a trade in the list, or a stand-in. */
export function resolveTrade(text: string | null | undefined, trades: Trade[] = DEFAULT_TRADES): { key: string; label: string } | null {
  const slug = tradeSlug(text);
  if (!slug) return null;
  const hit = trades.find((t) => t.slug === slug || tradeSlug(t.label) === slug) ?? trades.find((t) => slug.startsWith(t.slug));
  if (hit) return { key: hit.slug, label: hit.label };
  return { key: slug, label: (text ?? "").trim() };
}
