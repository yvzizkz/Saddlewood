// A change order's timeline: what the register recorded (change_order_events,
// 0059) and what the client did with the document (its proof record,
// document_events), in one list, oldest first. Openings are the client's
// (not a mail scanner, not our staff) and one line per day, with a count.
// Pure: the store loads the rows (coEvents.ts).

import type { DocumentEvent } from "./types";

export type CoEventKind = "requested" | "updated" | "drafted" | "priced" | "sent" | "viewed" | "signed" | "rejected" | "billed" | "paid" | "void" | "note";

export type CoEvent = { kind: CoEventKind; at: string; actor: string; detail: Record<string, unknown> };

export type TimelineLine = {
  kind: CoEventKind | "delivered" | "bounced" | "downloaded";
  at: string;
  /** Plain words: "Priced at $3,000.50 by marco@…". */
  text: string;
  /** Bounces and rejections stand out. */
  tone: "plain" | "good" | "warn";
};

const dollars = (c: unknown) => (typeof c === "number" ? `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null);
const by = (actor: string) => (actor && actor !== "owner" ? ` by ${actor}` : "");
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

function registerLine(e: CoEvent, showMoney: boolean): TimelineLine | null {
  const d = e.detail;
  const money = (c: unknown) => (showMoney ? dollars(c) : null);
  const line = (text: string, tone: TimelineLine["tone"] = "plain"): TimelineLine => ({ kind: e.kind, at: e.at, text, tone });
  switch (e.kind) {
    case "requested":
      if (d.reopened) return line(`Opened again${by(e.actor)}`);
      return line(`Asked for${by(e.actor)}${str(d.subject) ? ` (email "${str(d.subject)}")` : str(d.via) ? ` (${str(d.via)})` : ""}`);
    case "drafted":
      return line(`Draft ${str(d.number) ?? ""} made${by(e.actor)}`.replace("  ", " "));
    case "updated":
      if (str(d.status) === "signed" && str(d.why)) return line(`Back to signed: ${str(d.why)}`, "warn");
      if (money(d.amountCents)) return line(`Price changed to ${money(d.amountCents)}${by(e.actor)}`);
      return line(`Updated${by(e.actor)}`);
    case "priced":
      return line(`Priced${money(d.amountCents) ? ` at ${money(d.amountCents)}` : ""}${by(e.actor)}`);
    case "sent": {
      const to = Array.isArray(d.to) ? (d.to as unknown[]).filter((x): x is string => typeof x === "string") : [];
      if (d.marked) return line(`Marked sent${by(e.actor)}`);
      return line(`Sent${to.length ? ` to ${to.join(", ")}` : ""}${by(e.actor)}`);
    }
    case "signed":
      return line(`${d.marked ? "Marked approved" : "Approved"}${str(d.signedOn) ? ` (signed ${str(d.signedOn)})` : ""}${by(e.actor)}`, "good");
    case "rejected":
      return line(`Rejected${by(e.actor)}${str(d.note) ? `: ${str(d.note)}` : ""}`, "warn");
    case "billed":
      return line(`Billed${str(d.invoice) ? ` on ${str(d.invoice)}` : ""}${by(e.actor)}`, "good");
    case "paid":
      return line("Paid", "good");
    case "void":
      return line(`Voided${by(e.actor)}`, "warn");
    case "note":
      return str(d.note) ? line(`Note${by(e.actor)}: ${str(d.note)}`) : null;
    case "viewed":
      return line("Opened by the client");
  }
}

const isPerson = (e: DocumentEvent) => !e.automatic && e.actor === "client link";

/** The document's proof record, as timeline lines: delivery, bounces, the client's openings (a line a day) and answers. */
function documentLines(events: DocumentEvent[], dayOf: (at: string) => string): TimelineLine[] {
  const out: TimelineLine[] = [];
  const opened = new Map<string, { first: string; n: number; downloads: number }>();
  for (const e of events) {
    if (e.kind === "delivered") out.push({ kind: "delivered", at: e.at, text: "Delivered to their inbox", tone: "plain" });
    else if (e.kind === "bounced") out.push({ kind: "bounced", at: e.at, text: "The email bounced: check the address", tone: "warn" });
    else if ((e.kind === "viewed" || e.kind === "downloaded") && isPerson(e)) {
      const day = dayOf(e.at);
      const o = opened.get(day) ?? { first: e.at, n: 0, downloads: 0 };
      if (e.kind === "viewed") o.n += 1;
      else o.downloads += 1;
      opened.set(day, o);
    } else if (e.kind === "accepted" || (e.kind === "signed" && str(e.detail.role) !== "company")) {
      out.push({ kind: "signed", at: e.at, text: `The client ${e.kind === "signed" ? "signed it" : "accepted it"} on the link`, tone: "good" });
    }
  }
  for (const o of opened.values()) {
    const parts = [o.n ? `Opened by the client${o.n > 1 ? ` (${o.n} times)` : ""}` : "", o.downloads ? `downloaded ${o.downloads === 1 ? "a file" : `${o.downloads} files`}` : ""].filter(Boolean);
    const text = parts.join(", ");
    out.push({ kind: o.n ? "viewed" : "downloaded", at: o.first, text: text.charAt(0).toUpperCase() + text.slice(1), tone: "plain" });
  }
  return out;
}

const phoenixDay = (at: string) => new Date(at).toLocaleDateString("en-CA", { timeZone: "America/Phoenix" });

/** `money: false` (a seat without money.view) leaves the amounts out. */
export function buildTimeline(register: CoEvent[], documentEvents: DocumentEvent[] = [], opts: { money?: boolean; dayOf?: (at: string) => string } = {}): TimelineLine[] {
  const showMoney = opts.money ?? true;
  const lines = [...register.map((e) => registerLine(e, showMoney)).filter((l): l is TimelineLine => l !== null), ...documentLines(documentEvents, opts.dayOf ?? phoenixDay)];
  return lines.sort((a, b) => a.at.localeCompare(b.at));
}

/** "Oct 30, 2:10 PM" in Phoenix time. */
export function timelineWhen(at: string): string {
  return new Date(at).toLocaleString("en-US", { timeZone: "America/Phoenix", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
