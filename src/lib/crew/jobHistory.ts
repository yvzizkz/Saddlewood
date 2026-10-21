import { z } from "zod";

import { isDay } from "./time";

// This year on a job, from Joist and Buildertrend (migration 0050). The Mac
// builds the summary (Saddlewood-KB bot/job_history.py) and the site only
// checks its shape, keeps it, and shows it. Pure, so the shape is tested
// without a database; jobHistoryQueries.ts reads and writes.
//
// Joist invoices are often cumulative (a master invoice restates the job to
// date), so the invoices are listed, never added up. What is added up is the
// payments, which carry their own dates: paid this year is the payments dated
// this year, a payment recorded on two restatements counted once.

export const MAX_HISTORY_JOBS = 100;
export const MAX_HISTORY_DOCS = 40;
export const MAX_HISTORY_PEOPLE = 20;

const cents = z.number().int().min(-1e12).max(1e12);
const count = z.number().int().min(0).max(100000);
const day = z.string().refine(isDay, "must be YYYY-MM-DD");
const text = (max: number) => z.string().trim().max(max);
const total = z.object({ count, cents });

export const historyDocSchema = z.object({
  kind: z.enum(["estimate", "change_order", "invoice"]),
  number: text(80),
  title: text(120).catch(""),
  date: day.nullable(),
  totalCents: cents,
  paidCents: cents.nullable(),
  status: text(20),
});

export const jobHistorySchema = z.object({
  year: z.number().int().min(2000).max(2100),
  joist: z
    .object({
      asOf: day,
      paidCents: cents,
      payments: count,
      lastPaidOn: day.nullable(),
      estimates: total,
      approved: total,
      changeOrders: total,
      invoices: count,
      docs: z.array(historyDocSchema).max(MAX_HISTORY_DOCS),
    })
    .nullable(),
  labor: z
    .object({
      source: z.enum(["buildertrend", "app"]),
      asOf: day,
      // Buildertrend's hours report has no dates: it is the job to date when it was exported.
      jobToDate: z.boolean(),
      hours: z.number().min(0).max(1e6),
      people: z.array(z.object({ name: text(80), hours: z.number().min(0).max(1e6) })).max(MAX_HISTORY_PEOPLE),
    })
    .nullable(),
  notes: z.array(text(240)).max(6).catch([]),
});

export type JobHistory = z.infer<typeof jobHistorySchema>;
export type HistoryDoc = z.infer<typeof historyDocSchema>;

export const historyPostSchema = z.object({
  crewJobId: z.string().regex(/^[A-Za-z0-9-]{1,60}$/),
  asOf: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "asOf must be a time"),
  summary: jobHistorySchema,
});
export type HistoryPost = z.infer<typeof historyPostSchema>;

/** Split a post into rows for jobs that exist and the ids that are not jobs (yet). */
export function placeHistory(posts: HistoryPost[], jobIds: Set<string>): { rows: HistoryPost[]; unknown: string[] } {
  const rows: HistoryPost[] = [];
  const unknown: string[] = [];
  for (const p of posts) {
    if (jobIds.has(p.crewJobId)) rows.push(p);
    else unknown.push(p.crewJobId);
  }
  return { rows, unknown };
}

export function missingHistory(e: unknown): boolean {
  return /does not exist|schema cache|could not find the table/i.test((e as Error)?.message ?? "");
}
