import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isSettingKey, parseSettingValue, SETTING_DEFAULTS, SETTING_KEYS, type AppSettings, type SettingKey } from "./settingsRules";

// Settings the owners edit in the app (app_settings, migration 0023). Read
// with defaults, so the site works before the migration runs and a row that
// goes missing falls back to what the code shipped with. Cached in-process
// for a short while: every request read and every push looks them up. The
// keys, defaults and labels are in settingsRules.ts (client-safe).

export { ANSWERS_FIRST, isSettingKey, parseSettingValue, SETTING_DEFAULTS, SETTING_KEYS, SETTING_LABELS } from "./settingsRules";
export type { AnswersFirst, AppSettings, SettingKey } from "./settingsRules";

const CACHE_MS = 30_000;
let cache: { at: number; settings: AppSettings } | null = null;

export function clearSettingsCache(): void {
  cache = null;
}

/** Every setting, with the default where a row is missing or holds something the key does not take. */
export async function readSettings(now = Date.now()): Promise<AppSettings> {
  if (cache && now - cache.at < CACHE_MS) return cache.settings;
  const settings: AppSettings = { ...SETTING_DEFAULTS };
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db.from("app_settings").select("key, value").in("key", SETTING_KEYS);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as { key: string; value: unknown }[]) {
      if (!isSettingKey(row.key)) continue;
      const v = parseSettingValue(row.key, row.value);
      if (v !== null) (settings as Record<string, unknown>)[row.key] = v;
    }
  } catch (e) {
    // Before migration 0023, or a hiccup: the defaults stand, and nothing that
    // needed a setting fails over it. Not cached, so the next read tries again.
    console.error("[crew/settings] read:", (e as Error).message);
    return settings;
  }
  cache = { at: now, settings };
  return settings;
}

/** An owner's change. Validated by key; the cache is dropped so the next read sees it. */
export async function writeSetting<K extends SettingKey>(key: K, value: AppSettings[K], by: string): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db.from("app_settings").upsert({ key, value, updated_by: by, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(`app_settings write failed: ${error.message}`);
  cache = null;
}
