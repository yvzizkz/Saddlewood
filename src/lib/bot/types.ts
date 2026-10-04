import { z } from "zod";

// The contract between three parties:
//   the app (people, portal session)      -> /api/bot/{home,messages,actions,...}
//   the Mac bridge (OPS_AGENT_TOKEN)      -> /api/bot/sync
//   Saddlewood-KB bot/app_bridge.py       builds the sections below
//
// Sections arrive from the Mac as JSON and are parsed leniently: a field the
// bridge stops sending falls back to a default instead of blanking the app.
// What people send is parsed strictly.

// ---- people ----------------------------------------------------------------

export const BOT_ROLES = ["owner", "requester"] as const;
export type BotRole = (typeof BOT_ROLES)[number];

const personSchema = z.object({
  name: z.string().min(1).max(80),
  role: z.enum(BOT_ROLES).catch("requester"),
});
export type BotPerson = z.infer<typeof personSchema>;

const peopleSchema = z.record(z.string(), personSchema);
export type BotPeople = z.infer<typeof peopleSchema>;

// ---- sections the bridge reports -------------------------------------------

const str = (max = 4000) => z.string().max(max).catch("");
const nullableStr = z.string().max(400).nullable().catch(null);

const healthSchema = z.object({
  problems: z.record(z.string(), z.string()).catch({}),
  downSince: nullableStr,
  checkedAt: nullableStr,
  mailReadAt: nullableStr,
  textsReadAt: nullableStr,
  autosend: z.object({ on: z.boolean().catch(false), note: str(200) }).catch({ on: false, note: "" }),
  holds: z.array(z.string().max(120)).catch([]),
});
export type BotHealth = z.infer<typeof healthSchema>;

const draftSchema = z.object({
  n: z.number().int(),
  subject: str(400),
  to: str(400),
  cc: z.array(z.string().max(200)).catch([]),
  attach: z.array(z.string().max(200)).catch([]),
  body: str(40000),
  thread: str(400),
  summary: str(400),
  created: str(40),
  status: z.enum(["open", "approved", "scheduled"]).catch("open"),
  sendAt: nullableStr,
  requestedBy: nullableStr,
  sendAs: str(40),
  classReason: nullableStr,
  // Unreadable means held: the app must never offer a send it is unsure about.
  held: z.boolean().catch(true),
  /** Why this draft can never be sent from the app (an internal recipient), or null. */
  blocked: nullableStr,
  approvers: z.array(z.string().max(80)).catch([]),
});
export type BotDraft = z.infer<typeof draftSchema>;

const taskSchema = z.object({
  id: z.string().min(1).max(80),
  title: str(400),
  next: str(2000),
  help: str(2000),
  owner: str(120),
  due: str(20),
  remindFrom: str(20),
  tag: str(60),
  dueLabel: str(80),
  rank: z.number().int().catch(3),
  hidden: z.boolean().catch(false),
  created: str(40),
});
export type BotTask = z.infer<typeof taskSchema>;

const ledgerSchema = z.object({
  id: z.number().int(),
  kind: str(40),
  title: str(400),
  detail: str(600),
  askedOf: str(120),
  opened: str(20),
  ageDays: z.number().int().catch(0),
  tier: z.number().int().catch(0),
});
export type BotLedgerItem = z.infer<typeof ledgerSchema>;

const paymentSchema = z.object({
  n: z.number().int(),
  client: str(200),
  invoice: str(80),
  amount: z.number().catch(0),
  date: str(20),
  evidence: str(400),
});
export type BotPayment = z.infer<typeof paymentSchema>;

const expenseSchema = z.object({
  label: z.string().min(1).max(12),
  amount: z.number().catch(0),
  recipient: str(200),
  date: str(20),
  memo: str(300),
});
export type BotExpense = z.infer<typeof expenseSchema>;

const bidSchema = z.object({
  n: z.number().int(),
  project: str(300),
  gc: str(200),
  firstSeen: str(40),
  ageDays: z.number().int().catch(0),
});
export type BotBid = z.infer<typeof bidSchema>;

const fixSchema = z.object({
  id: z.string().min(1).max(12),
  status: str(20),
  what: str(600),
  impact: str(400),
  times: z.number().int().catch(1),
});
export type BotFix = z.infer<typeof fixSchema>;

const automationSchema = z.object({
  label: z.string().min(1).max(120),
  name: str(120),
  what: str(400),
  schedule: str(120),
  state: z.enum(["ok", "failed", "off", "unknown"]).catch("unknown"),
  lastExit: z.number().int().nullable().catch(null),
  lastRun: nullableStr,
});
export type BotAutomation = z.infer<typeof automationSchema>;

export const CADENCE_TYPES = ["daily", "weekdays", "weekly", "monthly"] as const;
export type CadenceType = (typeof CADENCE_TYPES)[number];

export const cadenceSchema = z
  .object({
    type: z.enum(CADENCE_TYPES),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "time must be HH:MM"),
    weekday: z.number().int().min(0).max(6).optional(),
    monthday: z.number().int().min(1).max(28).optional(),
  })
  .refine((c) => c.type !== "weekly" || c.weekday !== undefined, { message: "weekly needs a weekday" })
  .refine((c) => c.type !== "monthly" || c.monthday !== undefined, { message: "monthly needs a day of the month" });
export type Cadence = z.infer<typeof cadenceSchema>;

const dutySchema = z.object({
  id: z.string().min(1).max(80),
  title: str(200),
  instruction: str(2000),
  owner: str(120),
  ownerName: str(80),
  cadence: z
    .object({
      type: z.enum(CADENCE_TYPES).catch("daily"),
      time: str(5),
      weekday: z.number().int().optional().catch(undefined),
      monthday: z.number().int().optional().catch(undefined),
    })
    .catch({ type: "daily", time: "07:00" }),
  cadenceText: str(120),
  status: z.enum(["active", "paused"]).catch("paused"),
  nextRun: nullableStr,
  lastRun: nullableStr,
  lastResult: nullableStr,
});
export type BotDuty = z.infer<typeof dutySchema>;

const activitySchema = z.object({
  at: str(40),
  text: str(400),
  kind: z.enum(["reply", "send", "money", "alert", "info"]).catch("info"),
});
export type BotActivity = z.infer<typeof activitySchema>;

/** Keep every element that parses; drop the ones that do not. */
export function listOf<T>(schema: z.ZodType<T>) {
  return z
    .array(z.unknown())
    .catch([])
    .transform((rows) =>
      rows.flatMap((row) => {
        const parsed = schema.safeParse(row);
        return parsed.success ? [parsed.data] : [];
      }),
    );
}

export const EMPTY_HEALTH: BotHealth = {
  problems: {},
  downSince: null,
  checkedAt: null,
  mailReadAt: null,
  textsReadAt: null,
  autosend: { on: false, note: "" },
  holds: [],
};

export const sectionSchemas = {
  people: peopleSchema.catch({}),
  health: healthSchema.catch(EMPTY_HEALTH),
  drafts: listOf(draftSchema),
  tasks: listOf(taskSchema),
  ledger: listOf(ledgerSchema),
  payments: listOf(paymentSchema),
  expenses: listOf(expenseSchema),
  bids: listOf(bidSchema),
  fixes: listOf(fixSchema),
  automations: listOf(automationSchema),
  duties: listOf(dutySchema),
  activity: listOf(activitySchema),
} as const;

export type BotSectionKey = keyof typeof sectionSchemas;
export const BOT_SECTION_KEYS = Object.keys(sectionSchemas) as BotSectionKey[];

export type BotSections = {
  people: BotPeople;
  health: BotHealth;
  drafts: BotDraft[];
  tasks: BotTask[];
  ledger: BotLedgerItem[];
  payments: BotPayment[];
  expenses: BotExpense[];
  bids: BotBid[];
  fixes: BotFix[];
  automations: BotAutomation[];
  duties: BotDuty[];
  activity: BotActivity[];
};

export function emptySections(): BotSections {
  return {
    people: {},
    health: { ...EMPTY_HEALTH, autosend: { ...EMPTY_HEALTH.autosend } },
    drafts: [],
    tasks: [],
    ledger: [],
    payments: [],
    expenses: [],
    bids: [],
    fixes: [],
    automations: [],
    duties: [],
    activity: [],
  };
}

export function parseSection<K extends BotSectionKey>(key: K, data: unknown): BotSections[K] {
  return sectionSchemas[key].parse(data) as BotSections[K];
}

// ---- files -----------------------------------------------------------------

export const BOT_BUCKET = "bot-files";
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_ATTACHMENTS = 4;

export const UPLOAD_TYPES = [
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

// Storage object paths this API issued: <who>/<thread key>/<yyyymm>/<id>-<name>.
// `who` is u (a person attached it) or b (the bot sent it back).
const FILE_PATH_RE = /^(u|b)\/[0-9a-f]{16}\/\d{6}\/[0-9a-f]{12}-[A-Za-z0-9._-]{1,120}$/;

export const fileRefSchema = z.object({
  path: z.string().regex(FILE_PATH_RE, "not a file this app issued"),
  name: z.string().trim().min(1).max(160),
  type: z.string().trim().max(120).default("application/octet-stream"),
  size: z.number().int().min(0).max(MAX_UPLOAD_BYTES).default(0),
});
export type BotFileRef = z.infer<typeof fileRefSchema>;

export const uploadRequestSchema = z.object({
  name: z.string().trim().min(1).max(160),
  type: z.enum(UPLOAD_TYPES),
  size: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
});

export function safeFileName(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[-.]+|-+$/g, "")
    .slice(-100);
  return base || "file";
}

export function pathThreadKey(path: string): string | null {
  const m = FILE_PATH_RE.exec(path);
  return m ? path.split("/")[1] : null;
}

// ---- messages --------------------------------------------------------------

export const MESSAGE_MAX_CHARS = 4000;
export const MAX_OPEN_REQUESTS = 5;

export const newMessageSchema = z
  .object({
    body: z.string().trim().max(MESSAGE_MAX_CHARS).default(""),
    attachments: z.array(fileRefSchema).max(MAX_ATTACHMENTS).default([]),
  })
  .refine((m) => m.body.length > 0 || m.attachments.length > 0, { message: "say something or attach a file" });

export type BotMessageStatus = "queued" | "working" | "done" | "failed";

export type BotMessage = {
  id: number;
  thread: string;
  role: "user" | "bot" | "system";
  author: string;
  body: string;
  attachments: BotFileRef[];
  status: BotMessageStatus;
  replyTo: number | null;
  meta: Record<string, unknown>;
  createdAt: string;
  claimedAt: string | null;
  doneAt: string | null;
};

// ---- actions (button taps) -------------------------------------------------

const draftNumber = z.number().int().min(1).max(100000);
const taskId = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "id must be lowercase letters, digits, and dashes");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");
const reason = z.string().trim().max(300).default("");

export const actionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("draft.approve"), payload: z.object({ n: draftNumber }) }),
  z.object({
    kind: z.literal("draft.schedule"),
    payload: z.object({ n: draftNumber, at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "time must be HH:MM") }),
  }),
  z.object({ kind: z.literal("draft.cancel"), payload: z.object({ n: draftNumber }) }),
  z.object({ kind: z.literal("payment.confirm"), payload: z.object({ n: draftNumber, yes: z.boolean() }) }),
  z.object({ kind: z.literal("bid.ack"), payload: z.object({ n: draftNumber }) }),
  z.object({
    kind: z.literal("task.add"),
    payload: z.object({
      title: z.string().trim().min(3).max(160),
      next: z.string().trim().max(600).default(""),
      owner: z.string().trim().max(120).default(""),
      due: isoDate.or(z.literal("")).default(""),
      remindFrom: isoDate.or(z.literal("")).default(""),
    }),
  }),
  z.object({ kind: z.literal("task.done"), payload: z.object({ id: taskId, reason }) }),
  z.object({ kind: z.literal("task.drop"), payload: z.object({ id: taskId, reason }) }),
  z.object({ kind: z.literal("task.snooze"), payload: z.object({ id: taskId, until: isoDate }) }),
  z.object({
    kind: z.literal("ledger.close"),
    payload: z.object({ id: z.number().int().min(1), reason: z.string().trim().min(2).max(300) }),
  }),
  z.object({
    kind: z.literal("duty.add"),
    payload: z.object({
      title: z.string().trim().min(3).max(120),
      instruction: z.string().trim().min(10).max(1500),
      cadence: cadenceSchema,
    }),
  }),
  z.object({ kind: z.literal("duty.pause"), payload: z.object({ id: taskId }) }),
  z.object({ kind: z.literal("duty.resume"), payload: z.object({ id: taskId }) }),
  z.object({ kind: z.literal("duty.delete"), payload: z.object({ id: taskId }) }),
  z.object({ kind: z.literal("duty.run"), payload: z.object({ id: taskId }) }),
  // The kill switch only. Turning automatic sending back ON is not a phone tap.
  z.object({ kind: z.literal("autosend.off"), payload: z.object({}).default({}) }),
]);
export type BotActionInput = z.infer<typeof actionSchema>;
export type BotActionKind = BotActionInput["kind"];

/** Work that can run for minutes goes to the lane that is allowed to be slow. */
export function laneForAction(input: BotActionInput): "fast" | "agent" {
  if (input.kind === "payment.confirm" && input.payload.yes) return "agent"; // writes to Joist in a browser
  if (input.kind === "duty.run") return "agent"; // a full agent run
  return "fast";
}

export type BotActionStatus = "queued" | "working" | "done" | "failed" | "refused";

export type BotAction = {
  id: number;
  actor: string;
  kind: string;
  payload: Record<string, unknown>;
  status: BotActionStatus;
  result: string;
  createdAt: string;
  doneAt: string | null;
};

// ---- what the Mac posts back -----------------------------------------------

// Text the Mac sends is stored, not judged: trim it to what a row may hold
// and drop NUL bytes (Postgres text cannot store them) instead of refusing it.
export const stored = (max: number) => z.string().transform((v) => v.replace(/\u0000/g, "").slice(0, max));

const syncActionSchema = z.object({
  id: z.number().int(),
  status: z.enum(["done", "failed", "refused"]),
  result: stored(4000).default(""),
});

const syncMessageSchema = z.object({
  id: z.number().int(),
  outcome: z.enum(["reply", "route_agent", "failed"]),
  body: stored(60000).default(""),
  files: z.array(fileRefSchema).max(8).catch([]),
  meta: z.record(z.string(), z.unknown()).catch({}),
});

// A message nobody asked for in this cycle: the result of a recurring duty.
const syncPostItemSchema = z.object({
  thread: z.string().trim().toLowerCase().email(),
  body: stored(60000).refine((v) => v.length > 0),
  files: z.array(fileRefSchema).max(8).catch([]),
  meta: z.record(z.string(), z.unknown()).catch({}),
});

const syncNotifySchema = z.object({
  to: z.union([z.literal("owners"), z.array(z.string().trim().toLowerCase().email()).max(20)]),
  title: stored(80).refine((v) => v.trim().length > 0),
  body: stored(240).default(""),
  // Only ever a screen of the app: a notification must not be able to open
  // anything else.
  url: z
    .string()
    .regex(/^\/app(\/[a-z-]*)?(\?[A-Za-z0-9=&_-]*)?$/, "url must be an /app path")
    .default("/app"),
  tag: stored(60).default(""),
});

// Each list keeps the items that parse and drops the rest (the route reports
// how many it dropped). One bad item must not make the Mac resend the whole
// report forever, which would freeze every tap behind it.
export const syncPostSchema = z.object({
  lane: z.enum(["fast", "agent"]),
  actions: listOf(syncActionSchema),
  messages: listOf(syncMessageSchema),
  posts: listOf(syncPostItemSchema),
  state: z.record(z.string(), z.unknown()).catch({}),
  notify: listOf(syncNotifySchema),
});
export type SyncPost = z.infer<typeof syncPostSchema>;

// The bot may send back whatever it built (a waiver PDF, a workbook, audio).
export const botUploadRequestSchema = z.object({
  thread: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1).max(160),
  type: z.string().trim().max(120).default("application/octet-stream"),
  size: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
});

// ---- push ------------------------------------------------------------------

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(300), auth: z.string().min(8).max(120) }),
});

// ---- what the Home screen gets ---------------------------------------------

/** The fast lane checks in every 20 seconds; three misses and it is offline. */
export const ONLINE_WITHIN_MS = 75_000;

export type BridgeSeen = { seenAt: string | null; agentSeenAt: string | null; reportedAt: string | null };

export type BotMe = { email: string; name: string | null; role: BotRole | null };

export type BotInFlight = {
  id: number;
  who: string;
  preview: string;
  status: "queued" | "working";
  createdAt: string;
  mine: boolean;
};

export type BotHome = {
  ok: true;
  now: string;
  me: BotMe;
  bridge: { seenAt: string | null; online: boolean; reportedAt: string | null };
  sections: Omit<BotSections, "people">;
  /** One seat per person (info@ and lando@ are both Lando): who a to-do or an invite can go to. */
  team: { email: string; name: string }[];
  /** Every address with a seat -> the person's name, for showing who owns what. */
  names: Record<string, string>;
  inFlight: BotInFlight[];
  actions: (BotAction & { who: string })[];
  push: { available: boolean; publicKey: string | null };
  /** The field crew at a glance. Owners only; null when there is nothing to show or it could not be read. */
  crew: { people: number; onClock: number; needs: number } | null;
};

// ---- small shared helpers --------------------------------------------------

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function clock12(hhmm: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${suffix}`;
}

export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

export function describeCadence(c: { type: CadenceType; time: string; weekday?: number; monthday?: number }): string {
  const at = clock12(c.time);
  switch (c.type) {
    case "daily":
      return `Every day at ${at}`;
    case "weekdays":
      return `Weekdays at ${at}`;
    case "weekly":
      return `Every ${WEEKDAYS[c.weekday ?? 1] ?? "Monday"} at ${at}`;
    case "monthly":
      return `The ${ordinal(c.monthday ?? 1)} of each month at ${at}`;
  }
}
