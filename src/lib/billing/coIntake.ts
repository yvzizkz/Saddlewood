// Change-order intake, the pure part: what the Mac may send when a client asks
// for a change by email (KB bot triage), read strictly, and the $0 draft each
// requested change becomes. The register rows and documents are written by
// coIntakeStore.ts; POST /api/change-orders/intake is the door.
//
// One request can ask for several changes (AFT's 10/30 email: the shear wall
// and the LVL, plus the TV niches from the day before). Each is an item with a
// key that stays the same when the request is sent again or answered in the
// thread, so the same item finds its row instead of making a second one.
//
// Prices are never part of intake: every line is $0 until an owner prices it.

import { createHash } from "node:crypto";

import { readSnapshot, type Read } from "./drafts";
import type { DocumentSnapshot } from "./types";

export type IntakeLine = { description: string; quantity?: number; unit?: string; note?: string };
export type IntakeItem = {
  /** Which change in the thread this is, stable across re-sends (e.g. "shear-wall"). */
  key: string;
  title: string;
  detail?: string;
  lines: IntakeLine[];
  /** Named on the CO but not in it: "by others", priced later. */
  notIncluded?: { description: string; note?: string }[];
  /** The drawings, sketches or markups it is priced from. */
  refs?: string;
  note?: string;
};
export type Intake = {
  /** The mail thread the request came in on. */
  sourceRef: string;
  /** The job: its billing id, crew id or page key. */
  job: string;
  /** Who asked, as the client would recognize them: "Chris Turner (AFT)". */
  requestedBy: string;
  requestedOn: string;
  subject?: string;
  terms?: string;
  items: IntakeItem[];
};

class Bad extends Error {}

const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);

function only(obj: Record<string, unknown>, keys: string[], where: string): void {
  for (const k of Object.keys(obj)) if (!keys.includes(k)) throw new Bad(`${where}.${k} is not part of a change-order request`);
}

function text(v: unknown, where: string, max: number, required = false): string | undefined {
  if (v === undefined || v === null) {
    if (required) throw new Bad(`${where} is required`);
    return undefined;
  }
  if (typeof v !== "string") throw new Bad(`${where} must be text`);
  const t = v.replace(/\r\n/g, "\n").trim();
  if (required && !t) throw new Bad(`${where} is required`);
  if (t.length > max) throw new Bad(`${where} is too long (${max} characters at most)`);
  return t || undefined;
}

function list(v: unknown, where: string, max: number, min = 0): unknown[] {
  if (!Array.isArray(v)) throw new Bad(`${where} must be a list`);
  if (v.length < min) throw new Bad(`${where} needs at least ${min}`);
  if (v.length > max) throw new Bad(`${where} has too many entries (${max} at most)`);
  return v;
}

function item(raw: unknown, where: string): IntakeItem {
  if (!isObject(raw)) throw new Bad(`${where} must be an object`);
  only(raw, ["key", "title", "detail", "lines", "notIncluded", "refs", "note"], where);
  const key = text(raw.key, `${where}.key`, 60, true)!;
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(key)) throw new Bad(`${where}.key may only use letters, digits, dots, dashes and underscores`);
  const out: IntakeItem = {
    key: key.toLowerCase(),
    title: text(raw.title, `${where}.title`, 200, true)!,
    lines: list(raw.lines, `${where}.lines`, 30, 1).map((l, i) => {
      const w = `${where}.lines[${i}]`;
      if (!isObject(l)) throw new Bad(`${w} must be an object`);
      only(l, ["description", "quantity", "unit", "note"], w);
      const line: IntakeLine = { description: text(l.description, `${w}.description`, 2000, true)! };
      if (l.quantity !== undefined && l.quantity !== null) {
        if (typeof l.quantity !== "number" || !Number.isFinite(l.quantity) || l.quantity < 0) throw new Bad(`${w}.quantity must be a number, zero or more`);
        line.quantity = l.quantity;
      }
      const unit = text(l.unit, `${w}.unit`, 20);
      if (unit) line.unit = unit;
      const note = text(l.note, `${w}.note`, 4000);
      if (note) line.note = note;
      return line;
    }),
  };
  const detail = text(raw.detail, `${where}.detail`, 2000);
  if (detail) out.detail = detail;
  if (raw.notIncluded !== undefined) {
    out.notIncluded = list(raw.notIncluded, `${where}.notIncluded`, 30).map((x, k) => {
      const w = `${where}.notIncluded[${k}]`;
      if (!isObject(x)) throw new Bad(`${w} must be an object`);
      only(x, ["description", "note"], w);
      const ni: { description: string; note?: string } = { description: text(x.description, `${w}.description`, 500, true)! };
      const note = text(x.note, `${w}.note`, 1000);
      if (note) ni.note = note;
      return ni;
    });
  }
  const refs = text(raw.refs, `${where}.refs`, 500);
  if (refs) out.refs = refs;
  const note = text(raw.note, `${where}.note`, 1000);
  if (note) out.note = note;
  return out;
}

/** A request from the Mac, read strictly: an unknown field is refused by name. */
export function readIntake(raw: unknown): Read<Intake> {
  try {
    if (!isObject(raw)) throw new Bad("the body must be an object");
    only(raw, ["sourceRef", "job", "requestedBy", "requestedOn", "subject", "terms", "items"], "body");
    const requestedOn = text(raw.requestedOn, "requestedOn", 10, true)!;
    const d = new Date(`${requestedOn}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedOn) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== requestedOn) {
      throw new Bad("requestedOn must be a date like 2026-10-30");
    }
    const items = list(raw.items, "items", 10, 1).map((x, i) => item(x, `items[${i}]`));
    const keys = new Set(items.map((x) => x.key));
    if (keys.size !== items.length) throw new Bad("each item needs its own key");
    const out: Intake = {
      sourceRef: text(raw.sourceRef, "sourceRef", 300, true)!,
      job: text(raw.job, "job", 200, true)!,
      requestedBy: text(raw.requestedBy, "requestedBy", 200, true)!,
      requestedOn,
      items,
    };
    const subject = text(raw.subject, "subject", 300);
    if (subject) out.subject = subject;
    const terms = text(raw.terms, "terms", 4000);
    if (terms) out.terms = terms;
    return { ok: true, value: out };
  } catch (err) {
    if (err instanceof Bad) return { ok: false, error: err.message };
    throw err;
  }
}

function longDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export type DraftContext = { jobName: string; jobAddress?: string; client?: string; requestedBy: string; requestedOn: string; subject?: string; terms?: string };

/** The draft a requested change becomes: every line at $0, the request and drawings named under them. */
export function snapshotFor(it: IntakeItem, ctx: DraftContext): DocumentSnapshot {
  const asked = `Requested by ${ctx.requestedBy}${ctx.subject ? `, email "${ctx.subject}"` : ""}, ${longDay(ctx.requestedOn)}.`;
  const raw = {
    ...(ctx.client ? { billTo: { name: ctx.client, attention: ctx.requestedBy } } : {}),
    job: { name: ctx.jobName, ...(ctx.jobAddress ? { address: ctx.jobAddress } : {}) },
    date: ctx.requestedOn,
    lines: it.lines.map((l) => ({ ...l, amountCents: 0 })),
    ...(it.notIncluded?.length ? { notIncluded: it.notIncluded } : {}),
    ...(ctx.terms ? { terms: ctx.terms } : {}),
    note: [asked, it.refs ? `Per ${it.refs}.` : "", it.note ?? ""].filter(Boolean).join(" "),
  };
  // The same strict read every draft gets, so what intake writes is what the Bill screen could.
  const read = readSnapshot(raw);
  if (!read.ok) throw new Error(`change-order draft: ${read.error}`);
  return read.value;
}

/** JSON with its keys in order, so a snapshot read back from jsonb hashes the same as the one written. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (isObject(v)) {
    return `{${Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(v[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

/** What a draft says, as one value: intake rewrites a draft only while it still says what intake wrote. */
export function draftHash(title: string, snapshot: DocumentSnapshot): string {
  return createHash("sha256").update(stable({ title, snapshot })).digest("hex");
}
