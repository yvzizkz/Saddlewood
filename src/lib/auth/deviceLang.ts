// The language the crew sign-in shows on this device (Lando, 2026-10-15: one
// language at a time). The login page reads it; the crew app writes the seat's
// own language here (CrewProvider), so the next sign-in on that phone matches.

export const LANG_KEY = "saddlewood_lang";
export type DeviceLang = "en" | "es";

export function keepDeviceLang(lang: DeviceLang): void {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // localStorage may fail in private mode
  }
}

/** A ?lang= in the link wins, then this device's last choice, then the phone's own language. */
export function readDeviceLang(param: string | null): DeviceLang {
  if (param === "es" || param === "en") return param;
  try {
    const kept = localStorage.getItem(LANG_KEY);
    if (kept === "es" || kept === "en") return kept;
  } catch {
    // localStorage may fail in private mode
  }
  return typeof navigator !== "undefined" && /^es\b/i.test(navigator.language || "") ? "es" : "en";
}
