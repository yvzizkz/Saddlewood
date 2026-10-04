import { z } from "zod";

import { fileRefSchema, listOf, stored, type BotFileRef } from "@/lib/bot/types";
import { isClock, isDay } from "./time";

// The crew side of the app: what a field worker sends in, what an owner does
// with it, and what the office Mac reads and writes back.
//
//   crew (session, role crew)   -> /api/crew/me, /api/crew/act, uploads, files, push
//   owners (session, owner seat) -> /api/crew/admin
//   the Mac (OPS_AGENT_TOKEN)   -> /api/bot/crew        (Saddlewood-KB bot/crew.py)
//
// What people send is parsed strictly. What the Mac sends is parsed leniently,
// item by item, the same way /api/bot/sync does.

export const CREW_LANGS = ["en", "es"] as const;
export type CrewLang = (typeof CREW_LANGS)[number];

// ---- rows ---------------------------------------------------------------------

export type CrewPerson = {
  email: string;
  name: string;
  lang: CrewLang;
  phone: string;
  trade: string;
  active: boolean;
  addedBy: string;
  createdAt: string;
  lastSeenAt: string | null;
};

export type CrewJob = { id: string; name: string; address: string; note: string; active: boolean };

export type Geo = { lat: number; lng: number; acc: number | null };

export type ShiftEdit = {
  at: string;
  by: string;
  why: string;
  was: { startedAt: string; endedAt: string | null; breakMin: number; jobName: string; status: string };
};

export type CrewShift = {
  id: number;
  email: string;
  jobId: string;
  jobName: string;
  day: string;
  startedAt: string;
  endedAt: string | null;
  breakMin: number;
  startGeo: Geo | null;
  endGeo: Geo | null;
  note: string;
  source: "app" | "late" | "office";
  endSource: "app" | "late" | "reported" | "office" | null;
  review: string;
  status: "ok" | "void";
  edits: ShiftEdit[];
};

export const ENTRY_KINDS = ["receipt", "progress", "eod", "note", "timefix"] as const;
export type CrewEntryKind = (typeof ENTRY_KINDS)[number];
export type CrewEntryStatus = "new" | "filed" | "needs" | "approved" | "denied";

export type CrewEntry = {
  id: number;
  email: string;
  kind: CrewEntryKind;
  day: string;
  jobId: string;
  jobName: string;
  body: string;
  data: Record<string, unknown>;
  files: BotFileRef[];
  status: CrewEntryStatus;
  bot: Record<string, unknown>;
  botAt: string | null;
  decidedBy: string;
  createdAt: string;
};

export type CrewScheduleItem = {
  id: number;
  day: string;
  email: string;
  jobId: string;
  jobName: string;
  startTime: string;
  note: string;
  ack: "" | "ok" | "cant";
  ackNote: string;
  ackAt: string | null;
  createdBy: string;
};

export type CrewTaskStatus = "open" | "done" | "blocked" | "dropped";

export type CrewTask = {
  id: number;
  email: string;
  title: string;
  detail: string;
  jobId: string;
  jobName: string;
  due: string | null;
  status: CrewTaskStatus;
  doneNote: string;
  files: BotFileRef[];
  closedAt: string | null;
  createdBy: string;
  createdAt: string;
};

export const QUESTION_KINDS = ["ask", "clockout", "amount", "eod", "late"] as const;
export type CrewQuestionKind = (typeof QUESTION_KINDS)[number];

export type CrewOption = { v: string; en: string; es: string };

export type CrewQuestion = {
  id: number;
  email: string;
  body: string;
  bodyEs: string;
  options: CrewOption[];
  kind: CrewQuestionKind;
  ref: Record<string, unknown>;
  askedBy: string;
  status: "open" | "answered" | "cancelled";
  answer: string;
  answeredAt: string | null;
  botSeenAt: string | null;
  createdAt: string;
};

// ---- what each screen gets ----------------------------------------------------

export type CrewHome = {
  ok: true;
  now: string;
  /** The Phoenix calendar day right now. */
  day: string;
  me: { email: string; name: string; lang: CrewLang };
  jobs: CrewJob[];
  /** The shift this person is on right now, if any. */
  shift: CrewShift | null;
  /** This week's and last week's shifts, oldest first. */
  shifts: CrewShift[];
  schedule: CrewScheduleItem[];
  tasks: CrewTask[];
  questions: CrewQuestion[];
  entries: CrewEntry[];
  push: { available: boolean; publicKey: string | null };
};

export type CrewAdminHome = {
  ok: true;
  now: string;
  day: string;
  /** Monday of the week the Hours view is showing. */
  week: string;
  people: CrewPerson[];
  jobs: CrewJob[];
  /** Project names the expense tracker already uses that are not jobs here yet. */
  suggestedJobs: string[];
  shifts: CrewShift[];
  entries: CrewEntry[];
  schedule: CrewScheduleItem[];
  tasks: CrewTask[];
  questions: CrewQuestion[];
};

export type CrewFeed = {
  ok: true;
  now: string;
  day: string;
  people: CrewPerson[];
  jobs: CrewJob[];
  shifts: CrewShift[];
  /** `urls` lines up with `files`, and is only filled for entries the Mac has not filed yet. */
  entries: (CrewEntry & { urls: (string | null)[] })[];
  schedule: CrewScheduleItem[];
  tasks: CrewTask[];
  questions: CrewQuestion[];
};

// ---- limits -------------------------------------------------------------------

export const MAX_ENTRY_FILES = 8;
export const MAX_ENTRIES_PER_DAY = 80;
/** A punch saved on the phone with no signal still counts if it arrives within this long. */
export const LATE_PUNCH_MAX_MS = 18 * 3600_000;
/** A punch that arrives this soon after the tap is just a slow network, not a late punch. */
export const LATE_PUNCH_GRACE_MS = 90_000;
export const LONG_SHIFT_MIN = 14 * 60;
export const OTHER_JOB = "other";

// ---- shared pieces ------------------------------------------------------------

const text = (max: number) => z.string().trim().max(max).default("");
const day = z.string().refine(isDay, "day must be YYYY-MM-DD");
const clock = z.string().refine(isClock, "time must be HH:MM");
const email = z.string().trim().toLowerCase().email().max(200);
const id = z.number().int().min(1);
const geo = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    acc: z.number().min(0).max(1_000_000).nullable().default(null),
  })
  .nullable()
  .default(null);
const clientId = z.string().regex(/^[A-Za-z0-9-]{8,64}$/, "bad client id");
const at = z.string().datetime({ offset: true }).optional();
const jobId = z.string().trim().min(1).max(60);
const optionalJobId = z.string().trim().max(60).default("");
const files = z.array(fileRefSchema).max(MAX_ENTRY_FILES).default([]);
const breakMin = z.number().int().min(0).max(240).default(0);

// ---- what a crew member sends -------------------------------------------------

export const crewActSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("punch.in"), jobId, jobName: text(80), geo, note: text(300), at, clientId }),
  z.object({ kind: z.literal("punch.out"), breakMin, geo, note: text(300), at, clientId }),
  z.object({ kind: z.literal("punch.switch"), jobId, jobName: text(80), geo, at, clientId }),
  z.object({
    kind: z.literal("receipt.add"),
    jobId,
    jobName: text(80),
    amount: z.number().min(0).max(100_000).nullable().default(null),
    vendor: text(80),
    /** company: the company's card or account. me: out of the person's own pocket, so they are owed it. */
    paidBy: z.enum(["company", "me"]).default("company"),
    note: text(600),
    files: z.array(fileRefSchema).min(1, "a receipt needs a photo").max(MAX_ENTRY_FILES),
    clientId,
  }),
  z.object({ kind: z.literal("progress.add"), jobId, jobName: text(80), note: text(2000), files, clientId }),
  z.object({
    kind: z.literal("eod.add"),
    jobId,
    jobName: text(80),
    /** Today, or yesterday for someone who files it the next morning. */
    day: day.optional(),
    done: z.string().trim().min(2, "say what got done").max(2000),
    stuck: text(1500),
    needs: text(1500),
    asked: text(1500),
    deliveries: text(1500),
    visits: text(1500),
    safety: text(1500),
    decision: text(1500),
    files,
    clientId,
  }),
  z.object({
    kind: z.literal("note.add"),
    jobId: optionalJobId,
    jobName: text(80),
    note: z.string().trim().min(2, "write the note").max(2000),
    files,
    clientId,
  }),
  z.object({
    kind: z.literal("timefix.add"),
    day,
    start: clock,
    end: clock,
    breakMin,
    jobId,
    jobName: text(80),
    shiftId: id.nullable().default(null),
    note: z.string().trim().min(3, "say what happened").max(600),
    clientId,
  }),
  z.object({ kind: z.literal("answer"), id, answer: z.string().trim().min(1).max(1000) }),
  z.object({
    kind: z.literal("task.update"),
    id,
    status: z.enum(["done", "blocked", "open"]),
    note: text(600),
    files,
  }),
  z.object({ kind: z.literal("schedule.ack"), id, ack: z.enum(["ok", "cant"]), note: text(300) }),
  z.object({ kind: z.literal("prefs"), lang: z.enum(CREW_LANGS) }),
]);
export type CrewAct = z.infer<typeof crewActSchema>;
/** What a screen passes in: the same thing, before defaults are filled. */
export type CrewActInput = z.input<typeof crewActSchema>;
export type CrewActKind = CrewAct["kind"];

// ---- what an owner sends ------------------------------------------------------

const emails = z.array(email).min(1).max(40);

export const adminActSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("person.add"),
    name: z.string().trim().min(2).max(80),
    email,
    lang: z.enum(CREW_LANGS).default("en"),
    trade: text(60),
    phone: text(30),
    /** Email them the sign-in link now. */
    invite: z.boolean().default(true),
  }),
  z.object({
    kind: z.literal("person.update"),
    email,
    name: z.string().trim().min(2).max(80).optional(),
    lang: z.enum(CREW_LANGS).optional(),
    trade: z.string().trim().max(60).optional(),
    phone: z.string().trim().max(30).optional(),
    active: z.boolean().optional(),
  }),
  z.object({ kind: z.literal("person.invite"), email }),
  /** A one-time code and link for an owner to hand a crew member in person or by text. */
  z.object({ kind: z.literal("person.code"), email }),
  z.object({ kind: z.literal("job.add"), name: z.string().trim().min(2).max(80), address: text(200), note: text(300) }),
  z.object({
    kind: z.literal("job.update"),
    id: jobId,
    name: z.string().trim().min(2).max(80).optional(),
    address: z.string().trim().max(200).optional(),
    note: z.string().trim().max(300).optional(),
    active: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("schedule.set"),
    day,
    emails,
    jobId,
    startTime: clock.or(z.literal("")).default(""),
    note: text(300),
  }),
  z.object({ kind: z.literal("schedule.remove"), id }),
  z.object({ kind: z.literal("schedule.copy"), from: day, to: day }),
  z.object({
    kind: z.literal("task.add"),
    emails,
    title: z.string().trim().min(3).max(160),
    detail: text(1500),
    jobId: optionalJobId,
    due: day.or(z.literal("")).default(""),
  }),
  z.object({
    kind: z.literal("task.update"),
    id,
    status: z.enum(["open", "done", "dropped"]).optional(),
    title: z.string().trim().min(3).max(160).optional(),
    detail: z.string().trim().max(1500).optional(),
    due: day.or(z.literal("")).optional(),
  }),
  z.object({
    kind: z.literal("shift.edit"),
    id,
    day: day.optional(),
    start: clock.optional(),
    /** "" reopens the shift (puts the person back on the clock). */
    end: clock.or(z.literal("")).optional(),
    breakMin: z.number().int().min(0).max(480).optional(),
    jobId: jobId.optional(),
    why: z.string().trim().min(3, "say why").max(300),
  }),
  z.object({
    kind: z.literal("shift.add"),
    email,
    jobId,
    day,
    start: clock,
    end: clock,
    breakMin: z.number().int().min(0).max(480).default(0),
    why: z.string().trim().min(3, "say why").max(300),
  }),
  z.object({ kind: z.literal("shift.void"), id, why: z.string().trim().min(3, "say why").max(300) }),
  /** Looked at it, it is fine: clears the review note. */
  z.object({ kind: z.literal("shift.ok"), id }),
  z.object({ kind: z.literal("fix.decide"), id, approve: z.boolean(), note: text(300) }),
  z.object({
    kind: z.literal("question.ask"),
    emails,
    body: z.string().trim().min(3).max(600),
    options: z.array(z.string().trim().min(1).max(60)).max(4).default([]),
  }),
  z.object({ kind: z.literal("question.cancel"), id }),
]);
export type AdminAct = z.infer<typeof adminActSchema>;
export type AdminActInput = z.input<typeof adminActSchema>;
export type AdminActKind = AdminAct["kind"];

// ---- what the Mac posts back --------------------------------------------------

const nonEmpty = (v: string) => v.trim().length > 0;

const optionSchema = z.object({ v: stored(40).refine(nonEmpty), en: stored(60).refine(nonEmpty), es: stored(60).default("") });

const syncEntrySchema = z.object({
  id: z.number().int(),
  status: z.enum(["filed", "needs"]),
  bot: z.record(z.string(), z.unknown()).catch({}),
});

const syncQuestionSchema = z.object({
  email,
  body: stored(600).refine(nonEmpty),
  bodyEs: stored(600).default(""),
  options: z.array(optionSchema).max(5).catch([]),
  kind: z.enum(QUESTION_KINDS).catch("ask"),
  ref: z.record(z.string(), z.unknown()).catch({}),
  /** Required: the Mac re-derives its questions every pass, and this is what keeps each one single. */
  dedupe: stored(160).refine(nonEmpty),
});

const syncShiftSchema = z.object({ id: z.number().int(), review: stored(300).refine(nonEmpty) });

const syncScheduleSchema = z.object({
  day,
  email,
  jobId,
  startTime: clock.or(z.literal("")).default(""),
  note: stored(300).default(""),
  by: stored(80).default("bot"),
});

const syncTaskSchema = z.object({
  email,
  title: stored(160).refine((v) => v.trim().length >= 3),
  detail: stored(1500).default(""),
  jobId: optionalJobId,
  due: day.or(z.literal("")).default(""),
  by: stored(80).default("bot"),
  dedupe: stored(160).default(""),
});

const syncNotifySchema = z.object({
  to: z.union([z.literal("owners"), z.array(email).max(40)]),
  title: stored(80).refine(nonEmpty),
  body: stored(240).default(""),
  url: z
    .string()
    .regex(/^\/app(\/[a-z-]*)?(\?[A-Za-z0-9=&_-]*)?$/, "url must be an /app path")
    .default("/app"),
  tag: stored(60).default(""),
});

export const crewSyncSchema = z.object({
  entries: listOf(syncEntrySchema),
  questions: listOf(syncQuestionSchema),
  /** Answered questions the Mac has read and acted on. */
  seen: z.array(z.number().int()).max(500).catch([]),
  shifts: listOf(syncShiftSchema),
  schedule: listOf(syncScheduleSchema),
  tasks: listOf(syncTaskSchema),
  notify: listOf(syncNotifySchema),
});
export type CrewSync = z.infer<typeof crewSyncSchema>;

// ---- small shared helpers -----------------------------------------------------

/** "Powell Residence" -> "powell-residence". */
export function jobSlug(name: string): string {
  const base = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base && base !== OTHER_JOB ? base : `job-${base || "x"}`;
}

/** A dollar figure a person typed: "$1,204.50", "146.61", "31". */
export function parseAmount(raw: string): number | null {
  const m = /^\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*$/.exec(raw.trim());
  if (!m) return null;
  const n = Number(`${m[1].replace(/,/g, "")}.${m[2] ?? "0"}`);
  return Number.isFinite(n) && n > 0 && n <= 100_000 ? Math.round(n * 100) / 100 : null;
}

export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}
