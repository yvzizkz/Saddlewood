// Joist sync, the pure half (docs/JOIST-SYNC.md): what the Mac is handed to
// write a change order into Joist, and the Mac's report read strictly. The
// store (joistSyncStore.ts) keeps the queue.

import type { DocumentSnapshot } from "./types";

/** A job claimed more than this long ago and never reported is claimable again. */
export const CLAIM_MINUTES = 15;
/** Failed writes are retried this many times in all, then flagged on the change order. */
export const MAX_ATTEMPTS = 3;
/** Claimed at once, at most. */
export const MAX_CLAIM = 10;

export type JoistReason = "drafted" | "priced" | "signed" | "retry";

/** What the Mac gets for one job: the change order as it is now, not as it was when queued. */
export type JoistPayload = {
  jobId: number;
  changeOrderId: number;
  reason: JoistReason;
  attempt: number;
  /** Update this Joist estimate; null = make one (duplicate a document on the same client). */
  joistId: number | null;
  /** Our number. Joist pre-fills its own: always overwrite it with this. */
  number: string;
  title: string;
  status: string;
  client: { name: string; attention: string };
  job: { name: string; address: string };
  lines: { description: string; quantity: number | null; unit: string; note: string; amountCents: number; noCharge: boolean }[];
  notIncluded: { description: string; note: string }[];
  note: string;
  totalCents: number;
  /** Files and links to attach, each fetchable by the Mac. */
  attachments: { label: string; url: string }[];
};

export function joistPayload(input: {
  jobId: number;
  changeOrderId: number;
  reason: JoistReason;
  attempt: number;
  joistId: number | null;
  number: string;
  title: string;
  status: string;
  snapshot: DocumentSnapshot;
  attachments: { label: string; url: string }[];
}): JoistPayload {
  const s = input.snapshot;
  const lines = (s.lines ?? []).map((l) => ({
    description: l.description,
    quantity: typeof l.quantity === "number" ? l.quantity : null,
    unit: l.unit ?? "",
    note: l.note ?? "",
    amountCents: l.noCharge ? 0 : l.amountCents,
    noCharge: !!l.noCharge,
  }));
  return {
    jobId: input.jobId,
    changeOrderId: input.changeOrderId,
    reason: input.reason,
    attempt: input.attempt,
    joistId: input.joistId,
    number: input.number,
    title: input.title,
    status: input.status,
    client: { name: s.billTo?.name ?? "", attention: s.billTo?.attention ?? "" },
    job: { name: s.job?.name ?? "", address: s.job?.address ?? "" },
    lines,
    notIncluded: (s.notIncluded ?? []).map((n) => ({ description: n.description, note: n.note ?? "" })),
    note: s.note ?? "",
    totalCents: lines.reduce((t, l) => t + l.amountCents, 0),
    attachments: input.attachments,
  };
}

export type JoistReport = { ok: true; joistId: number; joistUrl: string } | { ok: false; error: string };

const JOIST_HOST = /^https:\/\/([a-z0-9-]+\.)*joistapp\.com\//i;

/** The Mac's report on one job, read strictly. */
export function readJoistReport(raw: unknown): { ok: true; value: JoistReport } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "the body must be an object" };
  const r = raw as Record<string, unknown>;
  if (r.ok === true) {
    const id = typeof r.joistId === "string" && /^\d+$/.test(r.joistId) ? Number(r.joistId) : r.joistId;
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) return { ok: false, error: "joistId must be Joist's numeric id" };
    const url = typeof r.joistUrl === "string" ? r.joistUrl.trim() : "";
    if (url && (!JOIST_HOST.test(url) || url.length > 500)) return { ok: false, error: "joistUrl must be a joistapp.com link" };
    return { ok: true, value: { ok: true, joistId: id, joistUrl: url } };
  }
  if (r.ok === false) {
    const error = typeof r.error === "string" ? r.error.trim().slice(0, 500) : "";
    if (!error) return { ok: false, error: "say what went wrong" };
    return { ok: true, value: { ok: false, error } };
  }
  return { ok: false, error: "ok must be true or false" };
}
