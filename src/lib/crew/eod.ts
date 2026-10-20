import type { CrewEntry } from "./types";

// What an end-of-day check-in says, typed or said. A voice memo leaves `body`
// and the typed fields empty; once the Mac has listened it writes
// `bot.transcript` and `bot.fields = {done, stuck, needs, asked}` (strings,
// may be empty) beside it. Typed words win; the memo's words fill what was
// left blank.

export const EOD_SAID_KEYS = ["done", "stuck", "needs", "asked"] as const;
export type EodSaidKey = (typeof EOD_SAID_KEYS)[number];

type EodLike = Pick<CrewEntry, "body" | "data" | "bot">;

function said(entry: Pick<CrewEntry, "bot">, key: string): string {
  const fields = entry.bot.fields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return "";
  const v = (fields as Record<string, unknown>)[key];
  return typeof v === "string" ? v.trim() : "";
}

/** What got done: typed in `body`, or said in the memo. */
export function eodDone(entry: Pick<CrewEntry, "body" | "bot">): string {
  return entry.body || said(entry, "done");
}

/** One of the other fields (stuck, needs, asked, deliveries, ...): typed, or said when the memo covered it. */
export function eodField(entry: EodLike, key: string): string {
  const typed = entry.data[key];
  if (typeof typed === "string" && typed.trim()) return typed;
  return (EOD_SAID_KEYS as readonly string[]).includes(key) ? said(entry, key) : "";
}
