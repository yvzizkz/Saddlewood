// The trade list (migration 0029_trades). Read from the table when it exists;
// before the migration reaches a database the same list is used from here, so
// a screen never breaks on a missing table.

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type Trade = { slug: string; label: string; ord: number };

export const DEFAULT_TRADES: Trade[] = [
  ["general", "General conditions"],
  ["demo", "Demolition"],
  ["concrete", "Concrete"],
  ["framing", "Framing"],
  ["roofing", "Roofing"],
  ["windows", "Windows and doors"],
  ["plumbing", "Plumbing"],
  ["electrical", "Electrical"],
  ["hvac", "HVAC"],
  ["insulation", "Insulation"],
  ["drywall", "Drywall"],
  ["finish-carpentry", "Finish carpentry"],
  ["cabinets", "Cabinets"],
  ["tile", "Tile"],
  ["flooring", "Flooring"],
  ["paint", "Paint"],
  ["landscape", "Landscape"],
  ["cleanup", "Cleanup"],
  ["tools", "Tools and equipment"],
  ["rentals", "Rentals"],
].map(([slug, label], i) => ({ slug, label, ord: (i + 1) * 10 }));

export async function listTrades(): Promise<Trade[]> {
  const { data, error } = await getSupabaseAdmin().from("trades").select("slug,label,ord,active").order("ord");
  if (error || !data?.length) return DEFAULT_TRADES;
  return (data as { slug: string; label: string; ord: number; active: boolean }[]).filter((t) => t.active).map(({ slug, label, ord }) => ({ slug, label, ord }));
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
export function resolveTrade(text: string | null | undefined, trades: Trade[]): { key: string; label: string } | null {
  const slug = tradeSlug(text);
  if (!slug) return null;
  const hit = trades.find((t) => t.slug === slug || tradeSlug(t.label) === slug) ?? trades.find((t) => slug.startsWith(t.slug));
  if (hit) return { key: hit.slug, label: hit.label };
  return { key: slug, label: (text ?? "").trim() };
}
