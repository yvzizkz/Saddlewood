// The trade list (migration 0029_trades). Read from the table when it exists;
// before the migration reaches a database the same list is used from
// tradeList.ts, so a screen never breaks on a missing table.

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { DEFAULT_TRADES, type Trade } from "./tradeList";

export { DEFAULT_TRADES, resolveTrade, tradeLabel, tradeSlug, type Trade } from "./tradeList";

export async function listTrades(): Promise<Trade[]> {
  const { data, error } = await getSupabaseAdmin().from("trades").select("slug,label,ord,active").order("ord");
  if (error || !data?.length) return DEFAULT_TRADES;
  return (data as { slug: string; label: string; ord: number; active: boolean }[]).filter((t) => t.active).map(({ slug, label, ord }) => ({ slug, label, ord }));
}
