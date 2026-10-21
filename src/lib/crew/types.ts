import { z } from "zod";

import { fileRefSchema, listOf, stored, type BotFileRef } from "@/lib/bot/types";

import { isPhasePick } from "./phases";
import type { PurchasesToday, UnmatchedPurchase } from "./purchases";
import type { AppSettings } from "./settings";
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

/**
 * Every switch a group can have on. A seat belongs to one group; owners make
 * groups and flip these in the app. Everyone in a group is still crew-marked
 * underneath (sw_role = 'crew'). Seats and groups themselves are not a switch:
 * only owners manage them, so nobody can raise their own access.
 *
 * `own` switches shape the person's own day; `crew` switches open the Crew tab
 * and what can be done there. Any `crew` switch brings `crew.view` with it.
 * `projects` and `money` are the project manager's (0018): their own areas, so
 * they never open the Crew tab by themselves. Sending, payments, voids, new
 * recipients, pay rates, seats and groups stay with the owners whatever is on.
 */
export const CAPABILITIES = [
  { key: "clock", area: "own", label: "Clock in and out" },
  { key: "receipts", area: "own", label: "Send receipts" },
  { key: "pickups.run", area: "own", label: "Fetch pickups (runner)" },
  { key: "crew.view", area: "crew", label: "Open the Crew tab: who is on, what came in, photos, the plan" },
  { key: "updates", area: "crew", label: "Get the crew's updates: done, stuck, cannot make it" },
  { key: "schedule.edit", area: "crew", label: "Set the schedule" },
  { key: "tasks.assign", area: "crew", label: "Give and change tasks" },
  { key: "tasks.verify", area: "crew", label: "Check work: verify it or send it back" },
  { key: "questions.ask", area: "crew", label: "Ask the crew questions" },
  { key: "jobs.promise", area: "crew", label: "Keep a job's promise, address and site note" },
  { key: "jobs.manage", area: "crew", label: "Add, rename and close jobs" },
  { key: "pickups.stage", area: "crew", label: "Stage pickups for the runner" },
  { key: "plan.send", area: "crew", label: "Send the nightly plan to the owners" },
  { key: "requests.approve", area: "crew", label: "Decide material requests up to the PM limit, and place the order" },
  { key: "hours.view", area: "crew", label: "See everyone's hours" },
  { key: "hours.edit", area: "crew", label: "Fix hours, decide time fixes, payroll export" },
  { key: "projects.view", area: "projects", label: "Projects: every job's status, promises, what is stuck, the plans" },
  { key: "projects.mine", area: "projects", label: "Only the jobs they are assigned to (every list, every alert)" },
  { key: "money.view", area: "money", label: "See each job's contract, billed, paid, owed and past due, and say which job a purchase was for" },
  // Planned (APP-PERMISSIONS-PLAN phase 2) and not read by anything yet: kept so
  // a group that has them keeps them, hidden from the group editor until built.
  { key: "money.prepare", area: "money", label: "Start or revise an invoice or change order draft (never sends)", planned: true },
  { key: "money.request", area: "money", label: "Ask an owner to approve and send a prepared document", planned: true },
  { key: "estimate.view", area: "money", label: "See their jobs' estimate totals (read only)", planned: true },
  // Sales (0025): the pipeline and the estimate builder. Sending and
  // countersigning also need the owners to allow it in Sales > Settings.
  { key: "sales.view", area: "sales", label: "Sales: work the pipeline and build estimates" },
  { key: "sales.send", area: "sales", label: "Send proposals and countersign them, when Sales settings allow it" },
  // Subs and bids (0028, SOP-008): the directory, bid packages, invites and
  // leveling; awarding inside the PM limit in Company policies.
  { key: "subs.manage", area: "subs", label: "Subs and bids: the directory, bid packages, invites and the leveling sheet" },
  { key: "subs.award", area: "subs", label: "Award a bid to an approved sub inside budget, up to the PM limit in Company policies" },
] as const;
export type Capability = (typeof CAPABILITIES)[number]["key"];
export const CAPABILITY_KEYS = CAPABILITIES.map((c) => c.key) as Capability[];

/** Only switches that exist, each once; any Crew-tab switch brings the tab itself. */
export function normalizePerms(perms: readonly string[]): Capability[] {
  const set = new Set(perms.filter((p): p is Capability => (CAPABILITY_KEYS as string[]).includes(p)));
  if (CAPABILITIES.some((c) => c.area === "crew" && c.key !== "crew.view" && set.has(c.key))) set.add("crew.view");
  if (set.has("hours.edit")) set.add("hours.view");
  if (set.has("sales.send")) set.add("sales.view");
  if (set.has("subs.award")) set.add("subs.manage");
  return CAPABILITY_KEYS.filter((k) => set.has(k));
}

export type CrewGroup = {
  id: string;
  name: string;
  description: string;
  perms: Capability[];
  builtin: boolean;
};

/** The group's switches, as a seat carries them. */
export function hasPerm(p: { perms: readonly string[] }, perm: Capability): boolean {
  return p.perms.includes(perm);
}

/**
 * The priority order, highest first. The schedule fills from the top: if a
 * task does not happen today, what breaks?
 */
export const PRIORITIES = [
  { n: 1, en: "Safety or protection", es: "Seguridad o protección", short: "Safety" },
  { n: 2, en: "Promised to the client", es: "Prometido al cliente", short: "Promised" },
  { n: 3, en: "Blocks the next step", es: "Detiene el siguiente paso", short: "Blocks next" },
  { n: 4, en: "Finishes a job or a payment", es: "Termina un trabajo o un pago", short: "Closes out" },
  { n: 5, en: "Can wait", es: "Puede esperar", short: "Can wait" },
] as const;

// ---- rows ---------------------------------------------------------------------

export type CrewPerson = {
  email: string;
  name: string;
  lang: CrewLang;
  phone: string;
  trade: string;
  /** The access group's id, and its switches as they are right now. */
  group: string;
  groupName: string;
  perms: Capability[];
  /** Dollars per hour, owners' eyes only (null for anyone else, and when paid another way). */
  payRate: number | null;
  active: boolean;
  addedBy: string;
  createdAt: string;
  lastSeenAt: string | null;
};

export type CrewJob = {
  id: string;
  name: string;
  address: string;
  note: string;
  active: boolean;
  /** The date we promised the client, and what. */
  promised: string | null;
  promiseNote: string;
  /** Where the job is on the map (0021), from its address; null until placed. Punches are measured against it. */
  geo: { lat: number; lng: number } | null;
};

/** How crew_jobs.geo is stored: who placed it and when, beside the point. */
export type CrewJobGeo = { lat: number; lng: number; source: "census" | "nominatim" | "owner"; at: string };

/** One phase of a job (0024), in order under it. Verified by a person, never on a worker's word. */
export type CrewJobPhase = {
  id: number;
  jobId: string;
  /** 1-based position in the job's list. */
  ord: number;
  name: string;
  /** A slug from the shared trade list ('framing', 'plumbing', 'hvac'...), or whatever was typed. */
  trade: string;
  plannedFrom: string | null;
  plannedTo: string | null;
  verifiedBy: string;
  verifiedAt: string | null;
  /** What was said when it was verified or unverified, newest last. */
  note: string;
  createdBy: string;
};

/**
 * Where a job is, from its phases (src/lib/crew/phases.ts stageOf): the first
 * phase nobody has verified, or "complete" once every one is. null when the
 * job has no phases.
 */
export type JobStage = {
  /** The phase's id, or null for "complete". */
  id: number | null;
  name: string;
  trade: string;
  /** Position of the current phase and how many there are ("2 of 5"). */
  ord: number;
  of: number;
  /** The Phoenix day the previous phase was verified, or the job's first shift day, or null. */
  sinceDay: string | null;
  /** Days on this phase counting sinceDay as day 1; null without a sinceDay. */
  day: number | null;
  plannedFrom: string | null;
  plannedTo: string | null;
  /** Length of the plan in days when both dates are set. */
  plannedDays: number | null;
  /** planned_to has passed and the phase is not verified. */
  behind: boolean;
  complete: boolean;
};

/** A job as the owners, the project manager and the Mac read it: with its phases and stage. The worker's jobs never carry these. */
export type CrewJobStaged = CrewJob & { phases: CrewJobPhase[]; stage: JobStage | null };

/** Who is on a job, and as what (0018). Any row counts for projects.mine. */
export const JOB_ROLES = ["pm", "supervisor", "crew"] as const;
export type CrewJobRole = (typeof JOB_ROLES)[number];
export type CrewJobPerson = { jobId: string; email: string; role: CrewJobRole };

/** A billing job (public.jobs, 0012), as the owners' link picker shows it. Never sent to a crew seat. */
export type BillingJobRef = { id: string; name: string; client: string; prefix: string; crewJobId: string | null };

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
  trade?: string | null;
  /**
   * Meters from each punch to the job's address (src/lib/crew/geo.ts): null
   * when the punch or the job has no location, or the phone's fix was too
   * loose to trust. For the owners, the supervisor and the Mac only; the
   * worker's own screens get an OwnShift, which never carries it.
   */
  fromJobM: { in: number | null; out: number | null };
};

/** A shift as the person who worked it sees it: never how far their punch was from the job. */
export type OwnShift = Omit<CrewShift, "fromJobM">;

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
  /** 1 (safety) to 5 (can wait); null when nobody set it. */
  priority: number | null;
  ack: "" | "ok" | "cant";
  ackNote: string;
  ackAt: string | null;
  createdBy: string;
};

/**
 * open = not started, doing = started, blocked = waiting on something,
 * done = reported done (verifiedAt empty) or verified done, dropped.
 */
export type CrewTaskStatus = "open" | "doing" | "done" | "blocked" | "dropped";
export const LIVE_TASK = ["open", "doing", "blocked"] as const;

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
  priority: number | null;
  /** When the worker said it was done. */
  reportedAt: string | null;
  /** When the lead or an owner checked it. A done task without this is only reported done. */
  verifiedAt: string | null;
  verifiedBy: string;
  /** How many times it was reported done and sent back. */
  sentBack: number;
  createdBy: string;
  createdAt: string;
};

export function isReportedDone(t: Pick<CrewTask, "status" | "verifiedAt">): boolean {
  return t.status === "done" && !t.verifiedAt;
}

export type CrewPickupStatus = "staged" | "picked" | "delivered" | "problem" | "cancelled";

/** Material the lead ordered and had staged, for a runner to fetch and bring to the job. */
export type CrewPickup = {
  id: number;
  day: string;
  jobId: string;
  jobName: string;
  supplier: string;
  place: string;
  orderRef: string;
  items: string;
  note: string;
  /** Who is fetching it; "" is any runner. */
  email: string;
  status: CrewPickupStatus;
  runnerNote: string;
  files: BotFileRef[];
  pickedBy: string;
  pickedAt: string | null;
  deliveredAt: string | null;
  createdBy: string;
  createdAt: string;
};

export const REQUEST_STATUSES = ["asked", "approved", "denied", "ordered", "picked", "delivered", "cancelled"] as const;
export type CrewRequestStatus = (typeof REQUEST_STATUSES)[number];
/** A request still moving: not settled one way or the other. */
export const LIVE_REQUEST: readonly CrewRequestStatus[] = ["asked", "approved", "ordered", "picked"];

/**
 * Material the field asked for (migration 0023): from an end of day's "needs",
 * the Mac's reading of a voice memo, or a PM or owner by hand. Decided under
 * the owners' limits (src/lib/crew/settings.ts), then ordered into a will-call
 * pickup for the runner; the pickup's picked / delivered mirror back here.
 */
export type CrewRequest = {
  id: number;
  kind: "material";
  jobId: string;
  jobName: string;
  trade: string;
  items: string;
  qty: string;
  /** The estimate in cents; null until someone puts a number on it. */
  estCents: number | null;
  status: CrewRequestStatus;
  /** The seat that asked. */
  askedBy: string;
  askedAt: string;
  /** The end of day it came from (crew_entries.id), when it did. */
  entryId: number | null;
  decidedBy: string;
  decidedAt: string | null;
  decisionNote: string;
  /** "Talk to me" was answered: still asked, and the asker was told. */
  talk: boolean;
  supplier: string;
  orderRef: string;
  store: string;
  /** The will-call pickup made when it was ordered. */
  pickupId: number | null;
  createdAt: string;
  updatedAt: string;
};

/** The plan the lead sends the owners in the evening. */
export type CrewReport = {
  id: number;
  day: string;
  sentBy: string;
  sentName: string;
  body: string;
  createdAt: string;
  /** An owner's answer to what the plan asked for, once given. */
  answer: CrewReportAnswer | null;
};

export type CrewReportAnswer = { text: string; by: string; name: string; at: string };

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
  me: { email: string; name: string; lang: CrewLang; group: string; perms: Capability[] };
  jobs: CrewJob[];
  /** The shift this person is on right now, if any. */
  shift: OwnShift | null;
  /** This week's and last week's shifts, oldest first. */
  shifts: OwnShift[];
  schedule: CrewScheduleItem[];
  tasks: CrewTask[];
  questions: CrewQuestion[];
  entries: CrewEntry[];
  /** Pickups for this person to fetch (runners, and anyone a pickup names). */
  pickups: CrewPickup[];
  /** Their own material requests: the open ones, and what was settled in the last week. */
  requests: CrewRequest[];
  push: { available: boolean; publicKey: string | null };
};

export type CrewAdminHome = {
  ok: true;
  now: string;
  day: string;
  /** Who is looking: an owner sees everything; the lead sees the field (no hours, no seats). */
  viewer: { role: "owner" | "member"; email: string; name: string; perms: Capability[] };
  /** Every access group, for the owners' Team view. */
  groups: CrewGroup[];
  /** Monday of the week the Hours view is showing. */
  week: string;
  people: CrewPerson[];
  /** Every job with its phases and stage (0024). */
  jobs: CrewJobStaged[];
  /** Project names the expense tracker already uses that are not jobs here yet. */
  suggestedJobs: string[];
  shifts: CrewShift[];
  entries: CrewEntry[];
  schedule: CrewScheduleItem[];
  tasks: CrewTask[];
  questions: CrewQuestion[];
  pickups: CrewPickup[];
  /** Plans sent over the last 35 days, newest first. */
  reports: CrewReport[];
  /** Who is on each job shown (0018). */
  jobPeople: CrewJobPerson[];
  /** Billing jobs for the owners' link picker; empty for anyone else. */
  billingJobs: BillingJobRef[];
  /** Set when the viewer sees only the jobs they are on (projects.mine). */
  narrowed: boolean;
  /** Home Depot register names waiting for "Which job is this?" (0022); only with money.view. */
  unmatchedPurchases: UnmatchedPurchase[];
  /** Names older than the card window (UNMATCHED_RECENT_DAYS), counted, not shown; search finds them. 0 with ?all=1. */
  olderPurchaseNames?: number;
  /** Material requests on the jobs shown: open, and settled in the last week. */
  requests: CrewRequest[];
  /** The owners' settings as they stand (limits, who answers first, the far-from-job distance). */
  settings: AppSettings;
};

export type CrewFeed = {
  ok: true;
  now: string;
  day: string;
  people: CrewPerson[];
  /** With each job's phases and stage, so the brief can say "6402 E Bambi: hang, day 3 of 4, behind". */
  jobs: CrewJobStaged[];
  shifts: CrewShift[];
  /** `urls` lines up with `files`, and is only filled for entries the Mac has not filed yet. */
  entries: (CrewEntry & { urls: (string | null)[] })[];
  schedule: CrewScheduleItem[];
  tasks: CrewTask[];
  questions: CrewQuestion[];
  /** `day`'s Home Depot purchases per job, with price flags (0022). */
  purchasesToday: PurchasesToday[];
  /** Material requests of the last seven days, for the evening brief. */
  requests: CrewRequest[];
};

// ---- limits -------------------------------------------------------------------

export const MAX_ENTRY_FILES = 8;
export const MAX_ENTRIES_PER_DAY = 80;
/** A voice memo on the end-of-day check-in runs this long at most. */
export const MEMO_MAX_SECONDS = 180;
/** What a phone records: AAC in MP4 on an iPhone, Opus in WebM elsewhere. */
export const AUDIO_TYPES = ["audio/mp4", "audio/webm", "audio/mpeg", "audio/wav", "audio/x-m4a"] as const;
/** What a crew member may upload: photos and PDFs, and a voice memo for the end of day. */
export const CREW_UPLOAD_TYPES = ["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp", "application/pdf", ...AUDIO_TYPES] as const;
export function isAudioRef(f: { type?: string }): boolean {
  return (f.type ?? "").toLowerCase().startsWith("audio/");
}
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
const priority = z.number().int().min(1).max(5).nullable().default(null);
const payRate = z.number().min(0).max(500).nullable().default(null);
const groupId = z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,39}$/, "bad group");
/** A material estimate in whole cents; null is "no number yet". */
const estCents = z.number().int().min(0).max(100_000_000).nullable();

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
    trade: text(40),
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
    /** What got done, typed. May be empty when a voice memo (an audio file in `files`) says it; the act refuses both empty. */
    done: text(2000),
    stuck: text(1500),
    needs: text(1500),
    asked: text(1500),
    deliveries: text(1500),
    visits: text(1500),
    safety: text(1500),
    decision: text(1500),
    weather: text(120),
    crewCount: z.number().int().min(0).max(100).nullable().default(null),
    tradesOnSite: text(200),
    inspections: text(1500),
    files,
    /** How long the voice memo runs, when there is one. */
    memoSeconds: z.number().int().min(1).max(MEMO_MAX_SECONDS).optional(),
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
    status: z.enum(["done", "blocked", "open", "doing"]),
    note: text(600),
    files,
  }),
  z.object({
    kind: z.literal("pickup.update"),
    id,
    status: z.enum(["picked", "delivered", "problem"]),
    note: text(600),
    files,
  }),
  z.object({ kind: z.literal("schedule.ack"), id, ack: z.enum(["ok", "cant"]), note: text(300) }),
  /** Take back a material request of their own that is still asked. */
  z.object({ kind: z.literal("request.cancel"), id, note: text(300) }),
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
    group: groupId.default("crew"),
    payRate,
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
    group: groupId.optional(),
    payRate: payRate.optional(),
    active: z.boolean().optional(),
  }),
  z.object({ kind: z.literal("person.invite"), email }),
  /** A one-time code and link for an owner to hand a crew member in person or by text. */
  z.object({ kind: z.literal("person.code"), email }),
  z.object({
    kind: z.literal("job.add"),
    name: z.string().trim().min(2).max(80),
    address: text(200),
    note: text(300),
    promised: day.or(z.literal("")).default(""),
    promiseNote: text(200),
  }),
  z.object({
    kind: z.literal("job.update"),
    id: jobId,
    name: z.string().trim().min(2).max(80).optional(),
    address: z.string().trim().max(200).optional(),
    note: z.string().trim().max(300).optional(),
    active: z.boolean().optional(),
    promised: day.or(z.literal("")).optional(),
    promiseNote: z.string().trim().max(200).optional(),
  }),
  /** Place a job on the map from its address, or every active job not placed yet when no id is given. */
  z.object({ kind: z.literal("job.geocode"), id: jobId.optional() }),
  /** Who is on a job (0018): the whole list, replaced. Owners only. */
  z.object({
    kind: z.literal("job.people"),
    id: jobId,
    people: z.array(z.object({ email, role: z.enum(JOB_ROLES).default("pm") })).max(40),
  }),
  /** The billing job (public.jobs) this field job is, or "" for none. Owners only. */
  z.object({ kind: z.literal("job.link"), id: jobId, billingJobId: z.string().uuid().or(z.literal("")) }),
  /**
   * The job's phases (0024), the whole list in order. Unverified phases are
   * replaced by it; verified ones stay where they are and must all still be
   * on it (matched by name), or nothing changes. jobs.manage, or projects.mine
   * on that job.
   */
  z.object({
    kind: z.literal("job.phases.set"),
    jobId,
    phases: z
      .array(
        z.object({
          name: z.string().trim().min(1, "name the phase").max(60),
          trade: text(20),
          plannedFrom: day.or(z.literal("")).default(""),
          plannedTo: day.or(z.literal("")).default(""),
        }),
      )
      .max(40),
  }),
  /** Append a template's phases after whatever the job already has. */
  z.object({ kind: z.literal("job.phases.template"), jobId, template: z.string().max(120).refine(isPhasePick, "Which trades?") }),
  /** Checked it: the phase is done. tasks.verify on that job, owners anywhere. */
  z.object({ kind: z.literal("phase.verify"), id, note: text(300) }),
  /** Take a check back, with why. */
  z.object({ kind: z.literal("phase.unverify"), id, note: z.string().trim().min(3, "say why").max(300) }),
  /** When the phase is expected to run; "" clears a date. */
  z.object({ kind: z.literal("phase.plan"), id, plannedFrom: day.or(z.literal("")).default(""), plannedTo: day.or(z.literal("")).default("") }),
  z.object({
    kind: z.literal("schedule.set"),
    day,
    emails,
    jobId,
    startTime: clock.or(z.literal("")).default(""),
    note: text(300),
    priority,
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
    priority,
  }),
  z.object({
    kind: z.literal("task.update"),
    id,
    status: z.enum(["open", "done", "dropped"]).optional(),
    title: z.string().trim().min(3).max(160).optional(),
    detail: z.string().trim().max(1500).optional(),
    due: day.or(z.literal("")).optional(),
    priority: priority.optional(),
  }),
  /** Checked it: verified done, or not done and sent back with what is left. */
  z.object({
    kind: z.literal("task.verify"),
    id,
    ok: z.boolean(),
    note: text(600),
  }),
  z.object({
    kind: z.literal("pickup.add"),
    day,
    jobId: optionalJobId,
    supplier: z.string().trim().min(2, "say where it is").max(80),
    place: text(200),
    orderRef: text(80),
    items: z.string().trim().min(2, "say what to pick up").max(1500),
    note: text(300),
    email: email.or(z.literal("")).default(""),
  }),
  z.object({
    kind: z.literal("pickup.update"),
    id,
    status: z.enum(["staged", "picked", "delivered", "cancelled"]).optional(),
    email: email.or(z.literal("")).optional(),
    note: z.string().trim().max(300).optional(),
    day: day.optional(),
  }),
  /** Make a group, or change its name and switches. Owners only. */
  z.object({
    kind: z.literal("group.save"),
    id: groupId.optional(),
    name: z.string().trim().min(2, "name the group").max(40),
    description: text(200),
    perms: z.array(z.string().max(40)).max(40),
  }),
  z.object({ kind: z.literal("group.delete"), id: groupId }),
  /** Send the owners the plan for `day` (normally tomorrow). */
  z.object({ kind: z.literal("report.send"), day, note: text(1000) }),
  /** An owner answers what a plan asked for. Once; the supervisor's phone is told. */
  z.object({ kind: z.literal("report.answer"), id, text: z.string().trim().min(1, "write the answer").max(1000) }),
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
  /**
   * Which job a Home Depot register name is (0022): the alias is kept and every
   * line with that name is filed. jobId null = not a job, set it aside (owners only).
   */
  z.object({ kind: z.literal("purchase.assign"), alias: z.string().trim().min(1, "which name?").max(120), jobId: jobId.nullable() }),
  // ---- material requests (0023) ----
  /** A PM or an owner asks for material by hand. */
  z.object({
    kind: z.literal("request.add"),
    jobId,
    items: z.string().trim().min(2, "say what is needed").max(1500),
    qty: text(120),
    trade: text(60),
    estCents: estCents.optional(),
  }),
  /** Approve, deny (with a note) or "talk to me" (keeps it open). An estimate may be put on it at the same time. */
  z.object({
    kind: z.literal("request.decide"),
    id,
    decision: z.enum(["approve", "deny", "talk"]),
    note: text(600),
    estCents: estCents.optional(),
  }),
  /** The order is placed and staged for will-call: makes the runner's pickup. */
  z.object({
    kind: z.literal("request.order"),
    id,
    supplier: z.string().trim().min(2, "say where it is").max(80),
    store: text(200),
    orderRef: text(80),
    /** The day to fetch it; tomorrow when not given. */
    day: day.optional(),
  }),
  z.object({ kind: z.literal("request.cancel"), id, note: z.string().trim().min(2, "say why").max(300) }),
  /** An owner changes a setting (src/lib/crew/settings.ts holds the whitelist). */
  z.object({ kind: z.literal("settings.set"), key: z.string().trim().min(1).max(60), value: z.union([z.number(), z.string().trim().max(40)]) }),
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

/** A material need the Mac read out of an end of day (a voice memo, usually). One request per entry, however often it is sent. */
const syncRequestSchema = z.object({
  entryId: z.number().int().min(1),
  jobId: optionalJobId,
  jobName: stored(80).default(""),
  items: stored(1500).refine((v) => v.trim().length >= 2),
  trade: stored(60).default(""),
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
  /** Material requests read out of end-of-day memos. Settings are never the Mac's to send: owners only. */
  requests: listOf(syncRequestSchema),
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

/**
 * Seats for people with no email of their own sign in on a placeholder under
 * this domain (omar.p@crew.saddlewoodcontracting.com). It has no mailbox: an
 * owner hands them a code ("Get a code"), and nothing is ever emailed there.
 */
export const PLACEHOLDER_EMAIL_DOMAIN = "crew.saddlewoodcontracting.com";

export function isPlaceholderEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);
}

export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}
