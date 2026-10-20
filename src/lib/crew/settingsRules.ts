// The owners' settings (app_settings, migration 0023): the keys, their
// defaults, their labels and what each one takes. Pure and client-safe: the
// Settings card, "Waiting on you" and the 7 AM push read these; the server
// reads and writes the rows in settings.ts.

export const ANSWERS_FIRST = ["marco", "lando", "either"] as const;
export type AnswersFirst = (typeof ANSWERS_FIRST)[number];

export const SETTING_DEFAULTS = {
  /** A project manager may approve a material request up to this much ($500). */
  "requests.pmLimitCents": 50000,
  /** Above this ($1,000) both owners are told and one decides. */
  "requests.ownerLimitCents": 100000,
  /** Who the owners' first push goes to. */
  "requests.answersFirst": "either" as AnswersFirst,
  /** A punch further than this from the job (meters) shows red to the owners. */
  "crew.farFromJobM": 805,
  /** The supervisor's nightly plan is due by this time (24-hour, Phoenix): Waiting on you, the 7 AM push, the on-time record. */
  "crew.planDue": "18:00",
};
export type AppSettings = { [K in keyof typeof SETTING_DEFAULTS]: (typeof SETTING_DEFAULTS)[K] };
export type SettingKey = keyof AppSettings;
export const SETTING_KEYS = Object.keys(SETTING_DEFAULTS) as SettingKey[];

export const SETTING_LABELS: Record<SettingKey, { label: string; hint: string }> = {
  "requests.pmLimitCents": { label: "Project manager approves up to", hint: "A material request at or under this amount is the PM's call." },
  "requests.ownerLimitCents": { label: "Both owners are told above", hint: "Over this, both owners get the request; one of them decides." },
  "requests.answersFirst": { label: "Requests go first to", hint: "Whose phone a request for the owners buzzes first." },
  "crew.farFromJobM": { label: "Far from the job (meters)", hint: "A punch further than this from the job shows red. 805 m is half a mile." },
  "crew.planDue": { label: "The nightly plan is due by", hint: "The evening before. Later than this, it shows in Waiting on you and the 7 AM push." },
};

/** A value as the whitelist allows it, or null when it is not a value this key takes. */
export function parseSettingValue<K extends SettingKey>(key: K, value: unknown): AppSettings[K] | null {
  switch (key) {
    case "requests.pmLimitCents":
    case "requests.ownerLimitCents":
      return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100_000_000 ? (value as AppSettings[K]) : null;
    case "requests.answersFirst":
      return typeof value === "string" && (ANSWERS_FIRST as readonly string[]).includes(value) ? (value as AppSettings[K]) : null;
    case "crew.farFromJobM":
      return typeof value === "number" && Number.isInteger(value) && value >= 50 && value <= 50_000 ? (value as AppSettings[K]) : null;
    case "crew.planDue":
      return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? (value as AppSettings[K]) : null;
    default:
      return null;
  }
}

/** "18:00" as people say it: "6 PM", "5:30 PM" (crew.planDue). */
export function planDueLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const hr = ((h + 11) % 12) + 1;
  return `${hr}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

export function isSettingKey(key: string): key is SettingKey {
  return (SETTING_KEYS as string[]).includes(key);
}
