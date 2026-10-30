// "Price it": what an owner may change on a change-order draft before it goes
// out, what must be true before it can be sent, and the email that carries
// it. Pure and client-safe: the screen shows the same blockers the server
// enforces (coPriceStore.ts).

import type { DocumentLine, DocumentSnapshot } from "./types";

export type LineEdit = { description: string; note?: string; amountCents: number; noCharge?: boolean };
export type PriceEdit = { title: string; lines: LineEdit[]; note?: string; terms?: string };

/** A blank left for a person to fill: "Approximately ______ sq ft". */
export const BLANK = /_{3,}/;

/** The draft with the owner's prices and words; everything else (who, where, what is not included) stays. */
export function applyPrices(snapshot: DocumentSnapshot, edit: PriceEdit): DocumentSnapshot {
  const old = snapshot.lines ?? [];
  const lines: DocumentLine[] = edit.lines.map((l, i) => {
    const was = old[i] ?? { description: l.description, amountCents: 0 };
    const next: DocumentLine = { ...was, description: l.description, amountCents: l.noCharge ? 0 : l.amountCents };
    if (l.note) next.note = l.note;
    else delete next.note;
    if (l.noCharge) next.noCharge = true;
    else delete next.noCharge;
    return next;
  });
  const out: DocumentSnapshot = { ...snapshot, lines };
  if (edit.note !== undefined) {
    if (edit.note) out.note = edit.note;
    else delete out.note;
  }
  if (edit.terms !== undefined) {
    if (edit.terms) out.terms = edit.terms;
    else delete out.terms;
  }
  return out;
}

/** Why a change order cannot go to the client yet; empty when it can. */
export function sendBlockers(title: string, snapshot: DocumentSnapshot): string[] {
  const out: string[] = [];
  const lines = snapshot.lines ?? [];
  if (!lines.length) out.push("It has no lines.");
  if (BLANK.test(title)) out.push("Fill the blank in the title.");
  lines.forEach((l, i) => {
    const n = `Line ${i + 1}`;
    if (l.amountCents === 0 && !l.noCharge) out.push(`${n} has no price. Price it, or mark it no charge.`);
    if (l.amountCents < 0) out.push(`${n} is a credit; a change order adds work.`);
    if (BLANK.test(l.description) || BLANK.test(l.note ?? "")) out.push(`${n} still has a blank to fill.`);
  });
  if (BLANK.test(snapshot.note ?? "") || BLANK.test(snapshot.terms ?? "")) out.push("The note still has a blank to fill.");
  return out;
}

export type Contact = { name: string; email: string; role: string };

/** Who it goes to: the person who asked, when they are a contact on file; else the first contact. */
export function defaultTo(contacts: Contact[], requestedBy: string): string[] {
  const who = requestedBy.replace(/\s*\(.*\)\s*$/, "").trim().toLowerCase();
  const asked = who ? contacts.find((c) => c.name.trim().toLowerCase() === who) : undefined;
  const pick = asked ?? contacts[0];
  return pick ? [pick.email] : [];
}

function usd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** The email, short: what it is, what it comes to, where to see it. The link is added under it when it is sent. */
export function coEmail(input: { number: string; title: string; job: string; totalCents: number; to: Contact | null }): { subject: string; body: string } {
  const first = input.to?.name.trim().split(/\s+/)[0] ?? "";
  return {
    subject: `Change order ${input.number}: ${input.title} (${input.job})`,
    body: [
      `${first ? `Hi ${first},` : "Hello,"}`,
      "",
      `Here is change order ${input.number} for ${input.title} at ${input.job}, ${usd(input.totalCents)}. The details and drawings are at the link below. Please reply to approve it, or with any questions.`,
      "",
      "Thank you,",
      "Saddlewood Contracting",
    ].join("\n"),
  };
}

const MAX_CENTS = 10_000_000_000;
const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const words = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim().length <= max ? v.replace(/\r\n/g, "\n").trim() : null);

/** The screen's Save, read strictly: the title, each line's words and price, the note and terms. */
export function readPriceEdit(raw: unknown): { ok: true; value: PriceEdit } | { ok: false; error: string } {
  if (!isObject(raw)) return { ok: false, error: "the body must be an object" };
  for (const k of Object.keys(raw)) if (!["title", "lines", "note", "terms"].includes(k)) return { ok: false, error: `${k} is not something a change order has` };
  const title = words(raw.title, 200);
  if (!title) return { ok: false, error: "Give it a title." };
  if (!Array.isArray(raw.lines) || raw.lines.length === 0 || raw.lines.length > 100) return { ok: false, error: "lines must be a list of 1 to 100" };
  const lines: LineEdit[] = [];
  for (const [i, l] of raw.lines.entries()) {
    if (!isObject(l)) return { ok: false, error: `line ${i + 1} must be an object` };
    for (const k of Object.keys(l)) if (!["description", "note", "amountCents", "noCharge"].includes(k)) return { ok: false, error: `line ${i + 1}: ${k} is not part of a line` };
    const description = words(l.description, 2000);
    if (!description) return { ok: false, error: `Line ${i + 1} needs a description.` };
    const note = l.note === undefined ? "" : words(l.note, 4000);
    if (note === null) return { ok: false, error: `Line ${i + 1}: the note is too long.` };
    if (typeof l.amountCents !== "number" || !Number.isInteger(l.amountCents) || l.amountCents < 0 || l.amountCents > MAX_CENTS) return { ok: false, error: `Line ${i + 1}: the price is whole cents, zero or more.` };
    if (l.noCharge !== undefined && typeof l.noCharge !== "boolean") return { ok: false, error: `Line ${i + 1}: no charge is true or false.` };
    lines.push({ description, ...(note ? { note } : {}), amountCents: l.noCharge ? 0 : l.amountCents, ...(l.noCharge ? { noCharge: true } : {}) });
  }
  const edit: PriceEdit = { title, lines };
  for (const k of ["note", "terms"] as const) {
    if (raw[k] === undefined) continue;
    const v = words(raw[k], 4000);
    if (v === null) return { ok: false, error: `The ${k} is too long.` };
    edit[k] = v;
  }
  return { ok: true, value: edit };
}

/** "$1,250.50" or "1250.5" as cents; null when it is not a price. */
export function parseDollars(input: string): number | null {
  const t = input.replace(/[$,\s]/g, "");
  if (!t) return 0;
  if (!/^\d+(\.\d{0,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}
