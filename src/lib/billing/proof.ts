import type { DocumentEvent } from "./types";

// Reading the proof record: what we can honestly say happened to a document
// we issued. No database here, so it can be tested on its own.

// Company mail systems open the links in a message to scan them before a
// person ever sees it. Counting those as "the client viewed it" would be the
// kind of claim that falls apart when challenged, so a view is marked
// automatic when it looks like a machine:
//   - it names itself as a scanner, crawler or script, or sends no agent at all
//   - it was not a normal page load (HEAD, or a prefetch)
//   - it came within seconds of the message being sent or delivered
// A marked view is still kept. It is only left out of what we show a client.

const MACHINE_AGENTS =
  /bot\b|crawler|spider|scanner|preview|prefetch|proofpoint|mimecast|barracuda|safelinks|urldefense|symantec|fireeye|trendmicro|forcepoint|sophos|googleimageproxy|google-safety|bingpreview|slackbot|whatsapp|facebookexternalhit|skypeuripreview|curl\/|wget\/|python-|okhttp|go-http-client|java\/|axios|node-fetch|headlesschrome/i;

/** Seconds after a send or delivery inside which an opening is taken to be a scanner. */
export const SCANNER_WINDOW_SECONDS = 20;

export type ViewSignal = {
  userAgent: string | null;
  method?: string | null;
  /** Value of the Purpose / Sec-Purpose header, when the browser sent one. */
  purpose?: string | null;
  at: Date;
  /** When this document was last sent or reported delivered, if it was. */
  lastSentOrDeliveredAt?: Date | null;
};

export function looksAutomatic(v: ViewSignal): boolean {
  const ua = (v.userAgent ?? "").trim();
  if (!ua) return true;
  if (MACHINE_AGENTS.test(ua)) return true;
  if (v.method && v.method.toUpperCase() !== "GET") return true;
  if (v.purpose && /prefetch|preview/i.test(v.purpose)) return true;
  if (v.lastSentOrDeliveredAt) {
    const seconds = (v.at.getTime() - v.lastSentOrDeliveredAt.getTime()) / 1000;
    if (seconds >= 0 && seconds < SCANNER_WINDOW_SECONDS) return true;
  }
  return false;
}

/** A short, stable description of a device, for the history shown to a client. */
export function describeDevice(userAgent: string | null): string {
  const ua = userAgent ?? "";
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS X|Macintosh/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : /Linux/.test(ua)
              ? "Linux"
              : "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /CriOS|Chrome\//.test(ua)
      ? "Chrome"
      : /FxiOS|Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "";
  return [browser, os].filter(Boolean).join(" on ") || "unknown device";
}

export type ProofSummary = {
  firstSentAt: string | null;
  lastSentAt: string | null;
  sentTo: string[];
  deliveredAt: string | null;
  bouncedAt: string | null;
  portalSubmittedAt: string | null;
  /** Openings by a person, oldest first. */
  views: { at: string; device: string }[];
  firstViewedAt: string | null;
  lastViewedAt: string | null;
  viewCount: number;
  /** Openings we set aside as a mail scanner. */
  automaticViewCount: number;
  /** In one line, where the document stands. */
  state: "not_sent" | "sent" | "delivered" | "bounced" | "viewed";
};

/** Summarize a document's events. Order of the input does not matter. */
export function summarizeProof(events: DocumentEvent[]): ProofSummary {
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at) || a.id - b.id);
  const sent = sorted.filter((e) => e.kind === "sent");
  const delivered = sorted.filter((e) => e.kind === "delivered");
  const bounced = sorted.filter((e) => e.kind === "bounced");
  const portal = sorted.filter((e) => e.kind === "portal_submitted");
  // A viewing that turned out to be our own people (a staff copy opened
  // before the uncounted links existed) cannot be deleted; a later note names
  // it in detail.excludeViews and it stops counting.
  const excluded = new Set<number>();
  for (const e of sorted) {
    if (e.kind !== "note" || !Array.isArray(e.detail.excludeViews)) continue;
    for (const id of e.detail.excludeViews) if (typeof id === "number") excluded.add(id);
  }
  const opened = sorted.filter((e) => (e.kind === "viewed" || e.kind === "downloaded") && !excluded.has(e.id));
  const human = opened.filter((e) => !e.automatic);

  const sentTo = new Set<string>();
  for (const e of sent) {
    const to = e.detail.to;
    for (const a of Array.isArray(to) ? to : typeof to === "string" ? [to] : []) {
      if (typeof a === "string" && a) sentTo.add(a.toLowerCase());
    }
  }

  const lastBounce = bounced.at(-1)?.at ?? null;
  const lastDelivery = delivered.at(-1)?.at ?? null;
  const reached = sent.length > 0 || portal.length > 0;
  const state: ProofSummary["state"] =
    human.length > 0
      ? "viewed"
      : lastBounce && (!lastDelivery || lastBounce > lastDelivery)
        ? "bounced"
        : lastDelivery || portal.length > 0
          ? "delivered"
          : reached
            ? "sent"
            : "not_sent";

  return {
    firstSentAt: sent[0]?.at ?? null,
    lastSentAt: sent.at(-1)?.at ?? null,
    sentTo: [...sentTo].sort(),
    deliveredAt: delivered[0]?.at ?? null,
    bouncedAt: lastBounce,
    portalSubmittedAt: portal[0]?.at ?? null,
    views: human.map((e) => ({
      at: e.at,
      device: describeDevice(typeof e.detail.ua === "string" ? e.detail.ua : null),
    })),
    firstViewedAt: human[0]?.at ?? null,
    lastViewedAt: human.at(-1)?.at ?? null,
    viewCount: human.length,
    automaticViewCount: opened.length - human.length,
    state,
  };
}
