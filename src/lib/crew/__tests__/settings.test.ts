import { beforeEach, describe, expect, it, vi } from "vitest";

// The owners' settings (app_settings, 0023): defaults when the table is not
// there or a row holds nonsense, the whitelist of what each key takes, and
// the short cache so every push does not hit the database.

const store = vi.hoisted(() => ({
  rows: [] as { key: string; value: unknown }[],
  error: null as { message: string } | null,
  reads: 0,
  writes: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        in: async () => {
          store.reads += 1;
          return store.error ? { data: null, error: store.error } : { data: store.rows, error: null };
        },
      }),
      upsert: async (row: Record<string, unknown>) => {
        store.writes.push(row);
        return { error: null };
      },
    }),
  }),
}));

import { clearSettingsCache, parseSettingValue, readSettings, SETTING_DEFAULTS, writeSetting } from "../settings";

beforeEach(() => {
  store.rows = [];
  store.error = null;
  store.reads = 0;
  store.writes = [];
  clearSettingsCache();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the owners' settings", () => {
  it("start at $500 for the PM, $1,000 for the owners, either owner first, and half a mile", async () => {
    expect(SETTING_DEFAULTS).toEqual({ "requests.pmLimitCents": 50000, "requests.ownerLimitCents": 100000, "requests.answersFirst": "either", "crew.farFromJobM": 805 });
    expect(await readSettings()).toEqual(SETTING_DEFAULTS);
  });

  it("fall back to the defaults before the migration, and try again next time", async () => {
    store.error = { message: 'relation "public.app_settings" does not exist' };
    expect(await readSettings(1_000)).toEqual(SETTING_DEFAULTS);
    expect(await readSettings(2_000)).toEqual(SETTING_DEFAULTS);
    expect(store.reads).toBe(2);
  });

  it("take what the owners saved, keep the default where a row holds nonsense, and cache for a short while", async () => {
    store.rows = [
      { key: "requests.pmLimitCents", value: 75000 },
      { key: "requests.answersFirst", value: "marco" },
      { key: "crew.farFromJobM", value: "far" },
      { key: "requests.ownerLimitCents", value: -1 },
      { key: "something.else", value: 1 },
    ];
    expect(await readSettings(10_000)).toEqual({ "requests.pmLimitCents": 75000, "requests.ownerLimitCents": 100000, "requests.answersFirst": "marco", "crew.farFromJobM": 805 });
    store.rows[0].value = 90000;
    expect((await readSettings(20_000))["requests.pmLimitCents"]).toBe(75000); // cached
    expect((await readSettings(50_000))["requests.pmLimitCents"]).toBe(90000); // 30 s later
    expect(store.reads).toBe(2);
  });

  it("drop the cache on a write", async () => {
    store.rows = [{ key: "requests.pmLimitCents", value: 75000 }];
    await readSettings(10_000);
    store.rows[0].value = 90000;
    await writeSetting("requests.pmLimitCents", 90000, "Marco");
    expect(store.writes).toEqual([expect.objectContaining({ key: "requests.pmLimitCents", value: 90000, updated_by: "Marco" })]);
    expect((await readSettings(11_000))["requests.pmLimitCents"]).toBe(90000);
  });

  it("only take what each key allows", () => {
    expect(parseSettingValue("requests.pmLimitCents", 50000)).toBe(50000);
    expect(parseSettingValue("requests.pmLimitCents", 12.5)).toBeNull();
    expect(parseSettingValue("requests.pmLimitCents", "500")).toBeNull();
    expect(parseSettingValue("requests.answersFirst", "lando")).toBe("lando");
    expect(parseSettingValue("requests.answersFirst", "Ilene")).toBeNull();
    expect(parseSettingValue("crew.farFromJobM", 1609)).toBe(1609);
    expect(parseSettingValue("crew.farFromJobM", 10)).toBeNull();
  });
});
