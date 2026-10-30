import type { DraftChanges } from "./documents";
import type { DocumentKind, DocumentLine, DocumentSnapshot } from "./types";

// What a caller may put on a draft, read strictly: the bot (billing.py) and
// the Bill screen both write drafts through POST /api/billing/documents and
// PATCH /api/billing/documents/<id>, and the client sees exactly what is
// stored. A field the page does not know is refused by name rather than kept,
// so a typo cannot quietly drop a line of the invoice.

export type Read<T> = { ok: true; value: T } | { ok: false; error: string };

const KINDS: DocumentKind[] = ["estimate", "change_order", "invoice", "statement", "notice"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A hundred million dollars, in cents: anything bigger is a typo. */
const MAX_CENTS = 10_000_000_000;

class Bad extends Error {}

function isObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function only(obj: Record<string, unknown>, keys: string[], where: string): void {
  for (const k of Object.keys(obj)) {
    if (!keys.includes(k)) throw new Bad(`${where}.${k} is not something a document has`);
  }
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
  return t;
}

function cents(v: unknown, where: string): number {
  if (typeof v !== "number" || !Number.isInteger(v)) throw new Bad(`${where} must be whole cents`);
  if (Math.abs(v) > MAX_CENTS) throw new Bad(`${where} is too large`);
  return v;
}

function day(v: unknown, where: string): string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Bad(`${where} must be a date like 2026-10-16`);
  const d = new Date(`${v}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw new Bad(`${where} is not a real date`);
  return v;
}

function list(v: unknown, where: string, max: number): unknown[] {
  if (!Array.isArray(v)) throw new Bad(`${where} must be a list`);
  if (v.length > max) throw new Bad(`${where} has too many entries (${max} at most)`);
  return v;
}

function line(raw: unknown, where: string): DocumentLine {
  if (!isObject(raw)) throw new Bad(`${where} must be an object`);
  only(raw, ["description", "amountCents", "quantity", "unit", "note", "noCharge", "parts"], where);
  const out: DocumentLine = {
    description: text(raw.description, `${where}.description`, 2000, true)!,
    amountCents: cents(raw.amountCents, `${where}.amountCents`),
  };
  if (raw.quantity !== undefined) {
    if (typeof raw.quantity !== "number" || !Number.isFinite(raw.quantity)) throw new Bad(`${where}.quantity must be a number`);
    out.quantity = raw.quantity;
  }
  const unit = text(raw.unit, `${where}.unit`, 20);
  if (unit) out.unit = unit;
  const note = text(raw.note, `${where}.note`, 4000);
  if (note) out.note = note;
  if (raw.noCharge !== undefined) {
    if (typeof raw.noCharge !== "boolean") throw new Bad(`${where}.noCharge must be true or false`);
    if (raw.noCharge && out.amountCents !== 0) throw new Bad(`${where} is marked no charge but has a price`);
    if (raw.noCharge) out.noCharge = true;
  }
  if (raw.parts !== undefined) {
    out.parts = list(raw.parts, `${where}.parts`, 50).map((p, j) => {
      const w = `${where}.parts[${j}]`;
      if (!isObject(p)) throw new Bad(`${w} must be an object`);
      only(p, ["description", "amountCents", "label"], w);
      const part: { description: string; amountCents: number; label?: string } = {
        description: text(p.description, `${w}.description`, 500, true)!,
        amountCents: cents(p.amountCents, `${w}.amountCents`),
      };
      const label = text(p.label, `${w}.label`, 30);
      if (label) part.label = label;
      return part;
    });
  }
  return out;
}

export function readSnapshot(raw: unknown): Read<DocumentSnapshot> {
  try {
    if (!isObject(raw)) throw new Bad("snapshot must be an object");
    only(raw, ["billTo", "job", "date", "lines", "notIncluded", "terms", "note"], "snapshot");
    const s: DocumentSnapshot = {};
    if (raw.billTo !== undefined) {
      const b = raw.billTo;
      if (!isObject(b)) throw new Bad("snapshot.billTo must be an object");
      only(b, ["name", "attention", "address"], "snapshot.billTo");
      s.billTo = { name: text(b.name, "snapshot.billTo.name", 200, true)! };
      const attention = text(b.attention, "snapshot.billTo.attention", 200);
      if (attention) s.billTo.attention = attention;
      const address = text(b.address, "snapshot.billTo.address", 500);
      if (address) s.billTo.address = address;
    }
    if (raw.job !== undefined) {
      const j = raw.job;
      if (!isObject(j)) throw new Bad("snapshot.job must be an object");
      only(j, ["name", "address"], "snapshot.job");
      s.job = { name: text(j.name, "snapshot.job.name", 200, true)! };
      const address = text(j.address, "snapshot.job.address", 500);
      if (address) s.job.address = address;
    }
    if (raw.date !== undefined) s.date = day(raw.date, "snapshot.date");
    if (raw.lines !== undefined) s.lines = list(raw.lines, "snapshot.lines", 100).map((l, i) => line(l, `snapshot.lines[${i}]`));
    if (raw.notIncluded !== undefined) {
      s.notIncluded = list(raw.notIncluded, "snapshot.notIncluded", 50).map((x, k) => {
        const w = `snapshot.notIncluded[${k}]`;
        if (!isObject(x)) throw new Bad(`${w} must be an object`);
        only(x, ["description", "note"], w);
        const item: { description: string; note?: string } = { description: text(x.description, `${w}.description`, 500, true)! };
        const note = text(x.note, `${w}.note`, 1000);
        if (note) item.note = note;
        return item;
      });
    }
    const terms = text(raw.terms, "snapshot.terms", 4000);
    if (terms) s.terms = terms;
    const note = text(raw.note, "snapshot.note", 4000);
    if (note) s.note = note;
    return { ok: true, value: s };
  } catch (err) {
    if (err instanceof Bad) return { ok: false, error: err.message };
    throw err;
  }
}

function link(v: unknown, where: string): string | null {
  if (v === null) return null;
  if (typeof v !== "string" || !UUID.test(v)) throw new Bad(`${where} must be an id`);
  return v.toLowerCase();
}

const FIELDS = ["kind", "number", "title", "snapshot", "dueDate", "jobId", "clientId", "sendGroupId"];

/**
 * A draft's fields from a request body. For a new draft, kind and number are
 * required (and "supersedes" may name the document it corrects); for a change,
 * every field is optional and only what is given is changed.
 */
export function readDraft(raw: unknown, mode: "create"): Read<DraftChanges & { kind: DocumentKind; number: string; supersedes?: string }>;
export function readDraft(raw: unknown, mode: "change"): Read<DraftChanges>;
export function readDraft(raw: unknown, mode: "create" | "change"): Read<DraftChanges & { supersedes?: string }> {
  try {
    if (!isObject(raw)) throw new Bad("the body must be an object");
    only(raw, mode === "create" ? [...FIELDS, "supersedes"] : FIELDS, "body");
    const out: DraftChanges & { supersedes?: string } = {};
    if (raw.kind !== undefined || mode === "create") {
      if (typeof raw.kind !== "string" || !KINDS.includes(raw.kind as DocumentKind)) throw new Bad(`kind must be one of ${KINDS.join(", ")}`);
      out.kind = raw.kind as DocumentKind;
    }
    if (raw.number !== undefined || mode === "create") {
      const n = text(raw.number, "number", 40, true)!;
      if (!/^[#A-Za-z0-9 ._-]+$/.test(n)) throw new Bad("number may only use letters, digits, spaces, dots, dashes and underscores");
      out.number = n;
    }
    if (raw.title !== undefined) out.title = text(raw.title, "title", 200) ?? "";
    if (raw.snapshot !== undefined) {
      const s = readSnapshot(raw.snapshot);
      if (!s.ok) throw new Bad(s.error);
      out.snapshot = s.value;
    } else if (mode === "create") {
      out.snapshot = {};
    }
    if (raw.dueDate !== undefined) out.dueDate = raw.dueDate === null ? null : day(raw.dueDate, "dueDate");
    if (raw.jobId !== undefined) out.jobId = link(raw.jobId, "jobId");
    if (raw.clientId !== undefined) out.clientId = link(raw.clientId, "clientId");
    if (raw.sendGroupId !== undefined) out.sendGroupId = link(raw.sendGroupId, "sendGroupId");
    if (mode === "create" && raw.supersedes !== undefined && raw.supersedes !== null) {
      out.supersedes = link(raw.supersedes, "supersedes") ?? undefined;
    }
    if (mode === "change" && Object.keys(out).length === 0) throw new Bad("nothing to change");
    return { ok: true, value: out };
  } catch (err) {
    if (err instanceof Bad) return { ok: false, error: err.message };
    throw err;
  }
}
