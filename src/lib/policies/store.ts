import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isSettingKey, parseSettingValue, readSettings as readFieldSettings, writeSetting } from "@/lib/crew/settings";
import { OWN_KEYS, POLICY_DEFS, parsePolicyValue, readPolicies, type Policies } from "./rules";

// Company policies in the database. The "policy.*" keys are rows of
// app_settings (0023) this module reads and writes itself; the purchase limits
// and the plan deadline are field settings (requests.*, crew.*), read and
// written through src/lib/crew/settings.ts so the Crew tab, material requests
// and the 7 AM push see the same values. Reading never fails a screen: a
// missing or bad value is the recommended one.

export type PolicyChange = { by: string; at: string };

export async function loadPolicies(): Promise<{ values: Policies; changed: Record<string, PolicyChange> }> {
  const stored: Record<string, unknown> = {};
  const changed: Record<string, PolicyChange> = {};
  try {
    const db = getSupabaseAdmin();
    const keys = POLICY_DEFS.map((p) => p.key);
    const { data, error } = await db.from("app_settings").select("key, value, updated_by, updated_at").in("key", keys);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as { key: string; value: unknown; updated_by: string; updated_at: string }[]) {
      if (OWN_KEYS.includes(r.key)) stored[r.key] = r.value;
      if (r.updated_by && r.updated_by !== "setup") changed[r.key] = { by: r.updated_by, at: r.updated_at };
    }
  } catch (e) {
    console.error("[policies] read:", (e as Error).message);
  }
  // The field settings come from their own reader (defaults included).
  const field = await readFieldSettings();
  for (const p of POLICY_DEFS) {
    if (!p.key.startsWith("policy.") && isSettingKey(p.key)) stored[p.key] = field[p.key];
  }
  return { values: readPolicies(stored), changed };
}

export class PolicyError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404,
  ) {
    super(message);
  }
}

/** An owner's change to one policy. Validated by its control; field settings keep their own rules. */
export async function savePolicy(key: string, value: unknown, by: string): Promise<void> {
  if (key.startsWith("policy.")) {
    const v = parsePolicyValue(key, value);
    if (v === null) throw new PolicyError(POLICY_DEFS.some((p) => p.key === key) ? "That value does not fit this policy." : "That is not a policy.", 400);
    const db = getSupabaseAdmin();
    const { error } = await db.from("app_settings").upsert({ key, value: v, updated_by: by, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw new Error(`app_settings write failed: ${error.message}`);
    return;
  }
  if (!POLICY_DEFS.some((p) => p.key === key) || !isSettingKey(key)) throw new PolicyError("That is not a policy.", 400);
  const v = parseSettingValue(key, value);
  if (v === null) throw new PolicyError("That value does not fit this setting.", 400);
  const current = await readFieldSettings();
  const pm = key === "requests.pmLimitCents" ? (v as number) : current["requests.pmLimitCents"];
  const own = key === "requests.ownerLimitCents" ? (v as number) : current["requests.ownerLimitCents"];
  if (pm > own) throw new PolicyError("The PM limit cannot be above the owners' limit.", 400);
  await writeSetting(key, v as never, by);
}
