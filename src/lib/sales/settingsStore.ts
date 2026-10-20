import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { readSettings, type SalesSettings } from "./settings";

// The company's Sales settings in the database (sales_settings, key
// "company"). Reading never fails a screen: a missing row or a bad value is
// the default (settings.ts readSettings).

const KEY = "company";

export async function loadSettings(): Promise<SalesSettings> {
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db.from("sales_settings").select("data, updated_by, updated_at").eq("key", KEY).maybeSingle();
    if (error) throw new Error(error.message);
    const row = data as { data: unknown; updated_by: string; updated_at: string } | null;
    const s = readSettings(row?.data ?? null);
    if (row) {
      s.updatedAt = row.updated_at;
      s.updatedBy = row.updated_by;
    }
    return s;
  } catch (err) {
    console.error("sales settings not loaded, using the defaults:", err);
    return readSettings(null);
  }
}

/** Save what an owner set. What is stored is what readSettings makes of it, so nothing out of range is kept. */
export async function saveSettings(next: unknown, actor: string): Promise<SalesSettings> {
  const clean = readSettings(next);
  delete clean.updatedAt;
  delete clean.updatedBy;
  const db = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { error } = await db.from("sales_settings").upsert({ key: KEY, data: clean, updated_by: actor, updated_at: now }, { onConflict: "key" });
  if (error) throw new Error(`save sales settings failed: ${error.message}`);
  return { ...clean, updatedAt: now, updatedBy: actor };
}
