import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The crew's acts and the owners' acts, run against an in-memory stand-in for
// the crew tables. What is being tested is the rules: who may touch what, when
// a punch counts, what an answer does, and that every change to someone's
// time leaves a trail.

const ARNOLD = "arnold@example.com";
const BETO = "beto@example.com";
const KEY = "0123456789abcdef";

type Row = Record<string, unknown> & { id: number };

const { db, notify, auth, mail, geocoder } = vi.hoisted(() => {
  const db = {
    people: new Map<string, Record<string, unknown>>(),
    groups: new Map<string, Record<string, unknown>>(),
    jobs: new Map<string, Record<string, unknown>>(),
    shifts: [] as Row[],
    entries: [] as Row[],
    schedule: [] as Row[],
    tasks: [] as Row[],
    questions: [] as Row[],
    pickups: [] as Row[],
    reports: [] as Row[],
    phases: [] as Row[],
    requests: [] as Row[],
    jobPeople: [] as { jobId: string; email: string; role: string }[],
    billing: [] as { id: string; name: string; client: string; prefix: string; crewJobId: string | null }[],
    seq: 0,
  };
  return {
    db,
    notify: {
      owners: [] as { title: string; body: string }[],
      leads: [] as { title: string; body: string }[],
      crew: [] as { email: string; body: string; title?: string; url?: string }[],
      /** Raw pushes (material requests to the owners go straight to sendPush). */
      push: [] as { to: string[]; title: string; body: string }[],
    },
    auth: { users: [] as { id: string; email: string; app_metadata: Record<string, unknown>; banned?: string }[] },
    mail: { sent: [] as { to: string; subject: string; text: string }[], links: [] as string[] },
    // The geocoders, stood in for: what they answer, and what they were asked.
    geocoder: { answer: null as { lat: number; lng: number; source: "census" | "nominatim" } | null, asked: [] as string[] },
  };
});

vi.mock("../geocode", () => ({
  geocodeAddress: async (address: string) => {
    geocoder.asked.push(address);
    return geocoder.answer;
  },
}));

vi.mock("../queries", () => {
  const next = () => ++db.seq;
  const open = (email: string) => db.shifts.filter((s) => s.email === email && s.status === "ok" && !s.endedAt).at(-1) ?? null;
  return {
    getPerson: async (email: string) => db.people.get(email) ?? null,
    listPeople: async () => [...db.people.values()],
    savePerson: async (p: Record<string, unknown>) => {
      const row = { lastSeenAt: null, createdAt: "x", ...p, active: true };
      db.people.set(p.email as string, row);
      return row;
    },
    patchPerson: async (email: string, patch: Record<string, unknown>) => {
      const row = db.people.get(email);
      if (!row) return null;
      const { auth_id, group_id, ...rest } = patch;
      Object.assign(row, rest, auth_id !== undefined ? { authId: auth_id } : {}, group_id !== undefined ? { group: group_id } : {});
      return row;
    },
    getGroup: async (id: string) => db.groups.get(id) ?? null,
    insertGroup: async (g: Record<string, unknown>) => {
      if (db.groups.has(g.id as string)) return null;
      const row = { builtin: false, ...g };
      db.groups.set(g.id as string, row);
      return row;
    },
    patchGroup: async (id: string, patch: Record<string, unknown>) => {
      const row = db.groups.get(id);
      return row ? Object.assign(row, patch) : null;
    },
    deleteGroup: async (id: string) => db.groups.delete(id),
    getJob: async (id: string) => db.jobs.get(id) ?? null,
    insertJob: async (j: Record<string, unknown>) => {
      if (db.jobs.has(j.id as string)) return null;
      const row = { id: j.id, name: j.name, address: j.address, note: j.note, active: true };
      db.jobs.set(j.id as string, row);
      return row;
    },
    patchJob: async (id: string, patch: Record<string, unknown>) => {
      const row = db.jobs.get(id);
      if (!row) return null;
      Object.assign(row, patch);
      return row;
    },
    listJobPhases: async (f: { jobId?: string } = {}) => db.phases.filter((p) => !f.jobId || p.jobId === f.jobId).sort((a, b) => (a.ord as number) - (b.ord as number)),
    getJobPhase: async (id: number) => db.phases.find((p) => p.id === id) ?? null,
    insertJobPhases: async (rows: Record<string, unknown>[]) =>
      rows.map((r) => {
        const row = { id: next(), verifiedAt: null, verifiedBy: "", note: "", ...r };
        db.phases.push(row);
        return row;
      }),
    patchJobPhase: async (id: number, patch: Record<string, unknown>, only?: { verified?: boolean }) => {
      const row = db.phases.find((p) => p.id === id && (only?.verified === undefined || !!p.verifiedAt === only.verified));
      if (!row) return null;
      const map: Record<string, string> = { planned_from: "plannedFrom", planned_to: "plannedTo", verified_at: "verifiedAt", verified_by: "verifiedBy" };
      for (const [k, v] of Object.entries(patch)) row[map[k] ?? k] = v;
      return row;
    },
    replaceJobPhases: async (jobId: string, keep: { id: number; ord: number; trade: string; plannedFrom: string | null; plannedTo: string | null }[], add: Record<string, unknown>[]) => {
      db.phases = db.phases.filter((p) => p.jobId !== jobId || p.verifiedAt);
      for (const k of keep) Object.assign(db.phases.find((p) => p.id === k.id)!, { ord: k.ord, trade: k.trade, plannedFrom: k.plannedFrom, plannedTo: k.plannedTo });
      for (const a of add) db.phases.push({ id: next(), verifiedAt: null, verifiedBy: "", note: "", ...a });
      return db.phases.filter((p) => p.jobId === jobId).sort((a, b) => (a.ord as number) - (b.ord as number));
    },
    firstShiftDays: async () => ({}),
    getShift: async (id: number) => db.shifts.find((s) => s.id === id) ?? null,
    openShift: async (email: string) => open(email),
    lastShift: async (email: string) =>
      db.shifts
        .filter((s) => s.email === email && s.status === "ok")
        .sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)))
        .at(-1) ?? null,
    listShifts: async (f: { email?: string; fromDay: string; toDay?: string }) =>
      db.shifts.filter((s) => s.status === "ok" && (!f.email || s.email === f.email) && (s.day as string) >= f.fromDay && (!f.toDay || (s.day as string) <= f.toDay)),
    insertShift: async (s: Record<string, unknown>) => {
      if (!s.endedAt && open(s.email as string)) return { shift: null, conflict: true };
      const row = {
        id: next(),
        breakMin: 0,
        endedAt: null,
        startGeo: null,
        endGeo: null,
        note: "",
        review: "",
        status: "ok",
        edits: [],
        clientIn: null,
        clientOut: null,
        endSource: null,
        ...s,
      };
      db.shifts.push(row);
      return { shift: row, conflict: false };
    },
    closeShift: async (id: number, f: Record<string, unknown>) => {
      const row = db.shifts.find((s) => s.id === id && s.status === "ok" && !s.endedAt);
      if (!row) return null;
      Object.assign(row, f);
      return row;
    },
    patchShift: async (id: number, patch: Record<string, unknown>) => {
      const row = db.shifts.find((s) => s.id === id);
      if (!row) return { shift: null, conflict: false };
      if (patch.ended_at === null && db.shifts.some((s) => s.id !== id && s.email === row.email && s.status === "ok" && !s.endedAt)) {
        return { shift: null, conflict: true };
      }
      const map: Record<string, string> = { job_id: "jobId", job_name: "jobName", started_at: "startedAt", ended_at: "endedAt", break_min: "breakMin", end_source: "endSource" };
      for (const [k, v] of Object.entries(patch)) row[map[k] ?? k] = v;
      return { shift: row, conflict: false };
    },
    insertEntry: async (e: Record<string, unknown>) => {
      const prior = db.entries.find((x) => x.email === e.email && x.clientId === e.clientId);
      if (prior) return { entry: prior, existed: true };
      const row = { id: next(), status: "new", bot: {}, botAt: null, decidedBy: "", createdAt: "x", ...e };
      db.entries.push(row);
      return { entry: row, existed: false };
    },
    getEntry: async (id: number) => db.entries.find((e) => e.id === id) ?? null,
    countEntries: async (email: string, day: string) => db.entries.filter((e) => e.email === email && e.day === day).length,
    patchEntry: async (id: number, patch: Record<string, unknown>, only?: { status?: string }) => {
      const row = db.entries.find((e) => e.id === id && (!only?.status || e.status === only.status));
      if (!row) return null;
      const { decided_by, bot_at, ...rest } = patch;
      Object.assign(row, rest, decided_by !== undefined ? { decidedBy: decided_by } : {}, bot_at !== undefined ? { botAt: bot_at } : {});
      return row;
    },
    getScheduleItem: async (id: number) => db.schedule.find((s) => s.id === id) ?? null,
    listSchedule: async (f: { fromDay: string; toDay: string }) => db.schedule.filter((s) => (s.day as string) >= f.fromDay && (s.day as string) <= f.toDay),
    upsertSchedule: async (rows: Record<string, unknown>[]) =>
      rows.map((r) => {
        const prior = db.schedule.find((s) => s.day === r.day && s.email === r.email && s.jobId === r.jobId);
        if (prior) return Object.assign(prior, r);
        const row = { id: next(), ack: "", ackNote: "", ackAt: null, ...r };
        db.schedule.push(row);
        return row;
      }),
    deleteSchedule: async (id: number) => {
      const i = db.schedule.findIndex((s) => s.id === id);
      if (i >= 0) db.schedule.splice(i, 1);
      return i >= 0;
    },
    ackSchedule: async (id: number, email: string, ack: string, note: string) => {
      const row = db.schedule.find((s) => s.id === id && s.email === email);
      if (!row) return null;
      return Object.assign(row, { ack, ackNote: note });
    },
    getTask: async (id: number) => db.tasks.find((t) => t.id === id) ?? null,
    insertTasks: async (rows: Record<string, unknown>[]) =>
      rows.map((r) => {
        const row = { id: next(), status: "open", doneNote: "", files: [], closedAt: null, verifiedAt: null, verifiedBy: "", sentBack: 0, detail: "", ...r };
        db.tasks.push(row);
        return row;
      }),
    patchTask: async (id: number, patch: Record<string, unknown>, only?: { email?: string; status?: string; unverified?: boolean }) => {
      const row = db.tasks.find(
        (t) => t.id === id && (!only?.email || t.email === only.email) && (!only?.status || t.status === only.status) && (!only?.unverified || !t.verifiedAt),
      );
      if (!row) return null;
      const map: Record<string, string> = {
        done_note: "doneNote",
        closed_at: "closedAt",
        reported_at: "reportedAt",
        verified_at: "verifiedAt",
        verified_by: "verifiedBy",
        sent_back: "sentBack",
      };
      for (const [k, v] of Object.entries(patch)) row[map[k] ?? k] = v;
      return row;
    },
    listTasks: async () => db.tasks,
    listJobs: async () => [...db.jobs.values()],
    listJobPeople: async (f: { email?: string } = {}) => db.jobPeople.filter((a) => !f.email || a.email === f.email),
    setJobPeople: async (jobId: string, people: { email: string; role: string }[]) => {
      db.jobPeople = [...db.jobPeople.filter((a) => a.jobId !== jobId), ...people.map((p) => ({ jobId, ...p }))];
      return db.jobPeople.filter((a) => a.jobId === jobId);
    },
    listBillingJobs: async () => db.billing,
    linkBillingJob: async (crewJobId: string, billingJobId: string | null) => {
      const target = billingJobId ? db.billing.find((b) => b.id === billingJobId) : null;
      if (billingJobId && !target) return "missing";
      if (target?.crewJobId && target.crewJobId !== crewJobId) return "taken";
      for (const b of db.billing) if (b.crewJobId === crewJobId) b.crewJobId = null;
      if (target) target.crewJobId = crewJobId;
      return "ok";
    },
    getPickup: async (id: number) => db.pickups.find((p) => p.id === id) ?? null,
    listPickups: async () => db.pickups,
    insertPickup: async (p: Record<string, unknown>) => {
      const row = { id: next(), status: "staged", runnerNote: "", files: [], pickedBy: "", pickedAt: null, deliveredAt: null, createdAt: "x", ...p };
      db.pickups.push(row);
      return row;
    },
    patchPickup: async (id: number, patch: Record<string, unknown>, only?: { statusIn?: string[] }) => {
      const row = db.pickups.find((p) => p.id === id && (!only?.statusIn || only.statusIn.includes(p.status as string)));
      if (!row) return null;
      const map: Record<string, string> = { runner_note: "runnerNote", picked_by: "pickedBy", picked_at: "pickedAt", delivered_at: "deliveredAt" };
      for (const [k, v] of Object.entries(patch)) row[map[k] ?? k] = v;
      return row;
    },
    insertReport: async (r: Record<string, unknown>) => {
      const row = { id: next(), createdAt: "x", answer: null, ...r };
      db.reports.push(row);
      return row;
    },
    getReport: async (id: number) => {
      const row = db.reports.find((r) => r.id === id);
      return row ? { ...row, data: {} } : null;
    },
    answerReport: async (report: { id: number }, answer: Record<string, unknown>) => {
      const row = db.reports.find((r) => r.id === report.id);
      if (!row || row.answer) return null;
      row.answer = answer;
      return row;
    },
    getQuestion: async (id: number) => db.questions.find((q) => q.id === id) ?? null,
    insertQuestion: async (q: Record<string, unknown>) => {
      if (q.dedupe && db.questions.some((x) => x.dedupe === q.dedupe)) return null;
      const row = { id: next(), status: "open", answer: "", ...q };
      db.questions.push(row);
      return row;
    },
    answerQuestion: async (id: number, email: string, answer: string) => {
      const row = db.questions.find((q) => q.id === id && q.email === email && q.status === "open");
      if (!row) return null;
      return Object.assign(row, { status: "answered", answer });
    },
    closeQuestions: async (email: string, kind: string, answer: string, day?: string) => {
      const rows = db.questions.filter((q) => q.email === email && q.kind === kind && q.status === "open" && (!day || (q.ref as { day?: string }).day === day));
      rows.forEach((q) => Object.assign(q, { status: "answered", answer }));
      return rows.length;
    },
    cancelQuestion: async (id: number) => {
      const row = db.questions.find((q) => q.id === id && q.status === "open");
      if (row) row.status = "cancelled";
      return !!row;
    },
  };
});

vi.mock("@/lib/bot/queries", () => ({ threadKey: () => KEY, readState: async () => ({ sections: { people: {} }, bridge: {} }) }));

vi.mock("@/lib/bot/push", () => ({
  sendPush: async (to: string[], n: { title: string; body: string }) => {
    notify.push.push({ to, title: n.title, body: n.body });
    return { sent: to.length };
  },
}));

// Material requests (0023) and the owners' settings, stood in for in memory like the crew tables above.
vi.mock("../requestQueries", () => ({
  listRequests: async () => db.requests,
  getRequest: async (id: number) => db.requests.find((r) => r.id === id) ?? null,
  getRequestByPickup: async (pickupId: number) => db.requests.find((r) => r.pickupId === pickupId) ?? null,
  insertRequest: async (r: Record<string, unknown>) => {
    const prior = r.entryId !== null ? db.requests.find((x) => x.entryId === r.entryId) : undefined;
    if (prior) return { request: prior, existed: true };
    const row = { id: ++db.seq, kind: "material", status: "asked", askedAt: "x", decidedBy: "", decidedAt: null, decisionNote: "", talk: false, supplier: "", orderRef: "", store: "", pickupId: null, createdAt: "x", updatedAt: "x", ...r };
    db.requests.push(row);
    return { request: row, existed: false };
  },
  patchRequest: async (id: number, patch: Record<string, unknown>, only?: { statusIn?: string[] }) => {
    const row = db.requests.find((r) => r.id === id && (!only?.statusIn || only.statusIn.includes(r.status as string)));
    if (!row) return null;
    const map: Record<string, string> = { est_cents: "estCents", decided_by: "decidedBy", decided_at: "decidedAt", decision_note: "decisionNote", order_ref: "orderRef", pickup_id: "pickupId" };
    for (const [k, v] of Object.entries(patch)) row[map[k] ?? k] = v;
    return row;
  },
}));

vi.mock("../settings", async () => {
  const rules = await import("../settingsRules");
  return {
    ...rules,
    readSettings: async () => ({ ...rules.SETTING_DEFAULTS }),
    writeSetting: async () => {},
    clearSettingsCache: () => {},
  };
});

vi.mock("../notify", () => ({
  notifyOwners: async (n: { title: string; body: string }) => void notify.owners.push(n),
  // With no lead seated these go to the owners; the tests below that seat a lead check `leads`.
  notifySupervisors: async (n: { title: string; body: string }, o?: { alsoOwners?: boolean }) => {
    const leads = [...db.people.values()].filter((p) => p.active && (p.perms as string[]).includes("updates"));
    if (!leads.length || o?.alsoOwners) notify.owners.push(n);
    if (leads.length) notify.leads.push(n);
  },
  notifyCrew: async (p: { email: string }, text: { title: { en: string }; body: { en: string } }, _tag: string, url = "/app") =>
    void notify.crew.push({ email: p.email, title: text.title.en, body: text.body.en, url }),
}));

vi.mock("@/lib/auth/magicLink", () => ({
  LINK_HOURS: 24,
  generateSignInLink: async (email: string, next: string) => {
    mail.links.push(`${email} -> ${next}`);
    return { email, link: `https://saddlewoodcontracting.com/auth/confirm?token_hash=${email}`, code: "12345678", next };
  },
  sendEmail: async (m: { to: string; subject: string; text: string }) => {
    mail.sent.push(m);
    return { id: "re_1" };
  },
  SITE_URL: "https://saddlewoodcontracting.com",
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    auth: {
      admin: {
        createUser: async (u: { email: string; app_metadata: Record<string, unknown> }) => {
          if (auth.users.some((x) => x.email === u.email)) return { data: { user: null }, error: { message: "already been registered" } };
          const user = { id: `uid-${auth.users.length + 1}`, email: u.email, app_metadata: u.app_metadata };
          auth.users.push(user);
          return { data: { user }, error: null };
        },
        listUsers: async () => ({ data: { users: auth.users }, error: null }),
        updateUserById: async (id: string, patch: { app_metadata: Record<string, unknown>; ban_duration?: string }) => {
          const user = auth.users.find((u) => u.id === id);
          if (user) {
            user.app_metadata = patch.app_metadata;
            user.banned = patch.ban_duration;
          }
          return { error: null };
        },
      },
    },
  }),
}));

import { punchTime, runCrewAct } from "../act";
import { runAdminAct } from "../admin";
import { mayRun } from "../auth";
import type { CrewPersonRow } from "../queries";
import { crewActSchema, adminActSchema, normalizePerms, type CrewActInput, type AdminActInput } from "../types";

const person = (email: string, name: string, lang: "en" | "es" = "en"): CrewPersonRow => ({
  email,
  name,
  lang,
  phone: "",
  trade: "",
  group: "crew",
  groupName: "Crew",
  perms: ["clock", "receipts"],
  payRate: null,
  active: true,
  addedBy: "Lando",
  createdAt: "x",
  lastSeenAt: null,
  authId: null,
});
const arnold = person(ARNOLD, "Arnold Mujica");
const beto = person(BETO, "Beto Ruiz", "es");
const owner = { email: "lando@saddlewoodcontracting.com", name: "Lando" };

// Monday 2026-10-05, Phoenix. 13:00Z is 6:00 AM.
const at = (hhmm: string, day = "2026-10-05") => new Date(`${day}T${hhmm}:00-07:00`);
let n = 0;
const cid = () => `client-${String(++n).padStart(6, "0")}`;
const crew = (who: CrewPersonRow, input: CrewActInput, now: Date) => runCrewAct(who, crewActSchema.parse(input), now);
const admin = (input: AdminActInput, now: Date) => runAdminAct(owner, adminActSchema.parse(input), now);
const file = (key = KEY) => ({ path: `u/${key}/202610/a1b2c3d4e5f6-r.jpg`, name: "r.jpg", type: "image/jpeg", size: 100 });

beforeEach(() => {
  db.people.clear();
  db.jobs.clear();
  db.groups.clear();
  db.groups.set("crew", { id: "crew", name: "Crew", perms: ["clock", "receipts"], builtin: true });
  db.groups.set("lead", { id: "lead", name: "Supervisor", perms: [], builtin: true });
  for (const k of ["shifts", "entries", "schedule", "tasks", "questions", "pickups", "reports", "requests"] as const) db[k].length = 0;
  db.phases = [];
  db.jobPeople = [];
  db.billing = [];
  db.seq = 0;
  notify.owners.length = 0;
  notify.leads.length = 0;
  notify.crew.length = 0;
  notify.push.length = 0;
  auth.users.length = 0;
  mail.sent.length = 0;
  mail.links.length = 0;
  geocoder.answer = null;
  geocoder.asked.length = 0;
  db.people.set(ARNOLD, arnold);
  db.people.set(BETO, beto);
  db.jobs.set("powell", { id: "powell", name: "Powell Residence", address: "", note: "", active: true });
  db.jobs.set("north-lane", { id: "north-lane", name: "North Lane", address: "", note: "", active: true });
  db.jobs.set("old-job", { id: "old-job", name: "Old Job", address: "", note: "", active: false });
  vi.stubEnv("INTERNAL_ALLOWED_EMAILS", "lando@saddlewoodcontracting.com,marco@saddlewoodcontracting.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("when a punch happened", () => {
  const now = Date.parse("2026-10-05T13:00:00Z");
  it("is the server's clock for a tap that arrives right away", () => {
    expect(punchTime(undefined, now)).toEqual({ time: now, late: false, lateMin: 0 });
    expect(punchTime(new Date(now - 20_000).toISOString(), now)).toEqual({ time: now, late: false, lateMin: 0 });
  });
  it("never trusts a time from the future", () => {
    expect(punchTime(new Date(now + 3600_000).toISOString(), now)).toEqual({ time: now, late: false, lateMin: 0 });
    expect(punchTime("not a time", now)).toEqual({ time: now, late: false, lateMin: 0 });
  });
  it("is the phone's clock for a punch saved with no signal, and says so", () => {
    expect(punchTime(new Date(now - 14 * 60_000).toISOString(), now)).toEqual({ time: now - 14 * 60_000, late: true, lateMin: 14 });
  });
  it("refuses one too old to trust", () => {
    expect(punchTime(new Date(now - 19 * 3600_000).toISOString(), now)).toBeNull();
  });
});

describe("the clock", () => {
  it("clocks a person in on a job that is on the list, on the Phoenix day", async () => {
    // 6:30 PM Phoenix is already tomorrow in UTC.
    expect(await crew(arnold, { kind: "punch.in", jobId: "powell", clientId: cid() }, at("18:30"))).toEqual({ ok: true });
    expect(db.shifts[0]).toMatchObject({ email: ARNOLD, jobName: "Powell Residence", day: "2026-10-05", source: "app", review: "" });
  });

  it("refuses a job that is finished, and one with no name", async () => {
    expect(await crew(arnold, { kind: "punch.in", jobId: "old-job", clientId: cid() }, at("06:00"))).toMatchObject({ ok: false, status: 400 });
    expect(await crew(arnold, { kind: "punch.in", jobId: "other", jobName: "", clientId: cid() }, at("06:00"))).toMatchObject({ ok: false, status: 400 });
    expect(await crew(arnold, { kind: "punch.in", jobId: "other", jobName: "Shop on 7th St", clientId: cid() }, at("06:00"))).toEqual({ ok: true });
    expect(db.shifts[0]).toMatchObject({ jobId: "other", jobName: "Shop on 7th St" });
  });

  it("takes the same tap twice as one clock-in, and a different tap as a mistake", async () => {
    const tap = cid();
    await crew(arnold, { kind: "punch.in", jobId: "powell", clientId: tap }, at("06:00"));
    expect(await crew(arnold, { kind: "punch.in", jobId: "powell", clientId: tap }, at("06:00"))).toEqual({ ok: true });
    expect(db.shifts).toHaveLength(1);
    const again = await crew(arnold, { kind: "punch.in", jobId: "north-lane", clientId: cid() }, at("06:05"));
    expect(again).toMatchObject({ ok: false, status: 409 });
    expect(again.ok ? "" : again.error).toContain("already on the clock at Powell Residence since 6:00 AM");
    expect(db.shifts).toHaveLength(1);
  });

  it("answers a Spanish speaker in Spanish", async () => {
    await crew(beto, { kind: "punch.in", jobId: "powell", clientId: cid() }, at("06:00"));
    const again = await crew(beto, { kind: "punch.in", jobId: "powell", clientId: cid() }, at("06:05"));
    expect(again.ok ? "" : again.error).toContain("Ya marcaste entrada en Powell Residence");
  });

  it("clocks out with the break, and counts the same tap once", async () => {
    await crew(arnold, { kind: "punch.in", jobId: "powell", clientId: cid() }, at("06:00"));
    const tap = cid();
    expect(await crew(arnold, { kind: "punch.out", breakMin: 30, note: "left early", clientId: tap }, at("14:30"))).toEqual({ ok: true });
    expect(db.shifts[0]).toMatchObject({ endedAt: at("14:30").toISOString(), breakMin: 30, endSource: "app", review: "", note: "left early" });
    expect(await crew(arnold, { kind: "punch.out", breakMin: 30, clientId: tap }, at("14:31"))).toEqual({ ok: true });
    expect(await crew(arnold, { kind: "punch.out", clientId: cid() }, at("14:32"))).toMatchObject({ ok: false, status: 409 });
  });

  it("marks a punch that was saved with no signal, with the phone's time", async () => {
    await crew(arnold, { kind: "punch.in", jobId: "powell", at: at("06:02").toISOString(), clientId: cid() }, at("06:16"));
    expect(db.shifts[0]).toMatchObject({ startedAt: at("06:02").toISOString(), source: "late", review: "clock-in sent 14 min after the tap" });
    await crew(arnold, { kind: "punch.out", at: at("14:30").toISOString(), clientId: cid() }, at("15:10"));
    expect(db.shifts[0]).toMatchObject({ endedAt: at("14:30").toISOString(), endSource: "late" });
    expect(db.shifts[0].review).toBe("clock-in sent 14 min after the tap; clock-out sent 40 min after the tap");
  });

  it("will not let a saved punch reach back before the clock-in, or before the last shift ended", async () => {
    await crew(arnold, { kind: "punch.in", jobId: "powell", clientId: cid() }, at("06:00"));
    const early = await crew(arnold, { kind: "punch.out", at: at("05:00").toISOString(), clientId: cid() }, at("09:00"));
    expect(early).toMatchObject({ ok: false, status: 400 });
    await crew(arnold, { kind: "punch.out", clientId: cid() }, at("12:00"));
    await crew(arnold, { kind: "punch.in", jobId: "north-lane", at: at("11:00").toISOString(), clientId: cid() }, at("12:30"));
    expect(Date.parse(db.shifts[1].startedAt as string)).toBeGreaterThan(at("12:00").getTime());
  });

  it("flags a very long shift for an owner", async () => {
    await crew(arnold, { kind: "punch.in", jobId: "powell", clientId: cid() }, at("05:00"));
    await crew(arnold, { kind: "punch.out", clientId: cid() }, at("20:30"));
    expect(db.shifts[0].review).toBe("15 h 30 min on the clock");
  });

  it("finishes a job change whose second half never landed, when the same tap comes again", async () => {
    await crew(arnold, { kind: "punch.in", jobId: "powell", clientId: cid() }, at("06:00"));
    const tap = cid();
    // the first half only: the old shift is closed under this tap's id, and nothing was opened
    Object.assign(db.shifts[0], { endedAt: at("10:00").toISOString(), endSource: "app", clientOut: tap });
    expect(await crew(arnold, { kind: "punch.switch", jobId: "north-lane", clientId: tap }, at("10:01"))).toEqual({ ok: true });
    expect(db.shifts).toHaveLength(2);
    expect(db.shifts[1]).toMatchObject({ jobName: "North Lane", startedAt: at("10:00").toISOString(), endedAt: null });
    // a different tap with nobody on the clock is still refused
    Object.assign(db.shifts[1], { endedAt: at("11:00").toISOString(), clientOut: "someone-else" });
    expect(await crew(arnold, { kind: "punch.switch", jobId: "powell", clientId: cid() }, at("11:01"))).toMatchObject({ ok: false, status: 409 });
  });

  it("changes job in one tap: out of one, into the other, at the same moment", async () => {
    await crew(arnold, { kind: "punch.in", jobId: "powell", clientId: cid() }, at("06:00"));
    expect(await crew(arnold, { kind: "punch.switch", jobId: "powell", clientId: cid() }, at("10:00"))).toMatchObject({ ok: false, status: 400 });
    expect(await crew(arnold, { kind: "punch.switch", jobId: "north-lane", clientId: cid() }, at("10:00"))).toEqual({ ok: true });
    expect(db.shifts).toHaveLength(2);
    expect(db.shifts[0]).toMatchObject({ endedAt: at("10:00").toISOString(), breakMin: 0 });
    expect(db.shifts[1]).toMatchObject({ startedAt: at("10:00").toISOString(), jobName: "North Lane", endedAt: null });
  });

  it("keeps one person's clock apart from another's", async () => {
    await crew(arnold, { kind: "punch.in", jobId: "powell", clientId: cid() }, at("06:00"));
    expect(await crew(beto, { kind: "punch.out", clientId: cid() }, at("07:00"))).toMatchObject({ ok: false, status: 409 });
    expect(db.shifts[0].endedAt).toBeNull();
  });
});

describe("what they send in", () => {
  it("records a receipt under the job, and counts a retry once", async () => {
    const tap = cid();
    const input: CrewActInput = { kind: "receipt.add", jobId: "powell", amount: 146.61, vendor: "White Cap", paidBy: "me", files: [file()], clientId: tap };
    expect(await crew(arnold, input, at("12:40"))).toEqual({ ok: true });
    expect(await crew(arnold, input, at("12:41"))).toEqual({ ok: true });
    expect(db.entries).toHaveLength(1);
    expect(db.entries[0]).toMatchObject({ kind: "receipt", jobName: "Powell Residence", day: "2026-10-05", data: { amount: 146.61, vendor: "White Cap", paidBy: "me" } });
  });

  it("refuses a photo from someone else's folder", async () => {
    const res = await crew(arnold, { kind: "receipt.add", jobId: "powell", files: [file("ffffffffffffffff")], clientId: cid() }, at("12:40"));
    expect(res).toMatchObject({ ok: false, status: 400 });
    expect(db.entries).toHaveLength(0);
  });

  it("wants a note or a photo for progress", async () => {
    expect(await crew(arnold, { kind: "progress.add", jobId: "powell", clientId: cid() }, at("10:00"))).toMatchObject({ ok: false, status: 400 });
    expect(await crew(arnold, { kind: "progress.add", jobId: "powell", note: "West wall framed", clientId: cid() }, at("10:00"))).toEqual({ ok: true });
    expect(notify.owners).toHaveLength(0); // progress is for the brief, not a buzz
  });

  it("tells the owners at once when the end of day carries a safety report or extra work", async () => {
    await crew(arnold, { kind: "eod.add", jobId: "powell", done: "North wall framed", needs: "20 sheets of OSB", clientId: cid() }, at("14:35"));
    expect(notify.owners).toHaveLength(0);
    await crew(arnold, { kind: "eod.add", jobId: "powell", done: "Framed", asked: "Super wants furring at the soffit", clientId: cid() }, at("14:40"));
    expect(notify.owners.at(-1)).toMatchObject({ title: "Extra work asked for · Powell Residence", body: "Arnold: Super wants furring at the soffit" });
    notify.owners.length = 0;
    await crew(beto, { kind: "eod.add", jobId: "powell", done: "Framed", asked: "x", safety: "Cut on the hand, bandaged", decision: "Island outlets now or after inspection?", clientId: cid() }, at("14:45"));
    // One alert per flag, so a decision next to extra work is not swallowed.
    expect(notify.owners.map((n) => n.title)).toEqual([
      "Safety report · Powell Residence",
      "Extra work asked for · Powell Residence",
      "Needs a decision · Powell Residence",
    ]);
  });

  it("files the end of day for today or yesterday only, and closes the bot's ask for it", async () => {
    db.questions.push({ id: 90, email: ARNOLD, kind: "eod", status: "open", ref: { day: "2026-10-04" }, answer: "" });
    expect(await crew(arnold, { kind: "eod.add", jobId: "powell", done: "Framed", day: "2026-10-02", clientId: cid() }, at("08:00"))).toMatchObject({ ok: false, status: 400 });
    expect(await crew(arnold, { kind: "eod.add", jobId: "powell", done: "Framed", day: "2026-10-04", clientId: cid() }, at("08:00"))).toEqual({ ok: true });
    expect(db.entries[0].day).toBe("2026-10-04");
    expect(db.questions[0]).toMatchObject({ status: "answered", answer: "filed" });
  });

  it("takes a voice memo in place of the typed end of day, and nothing in place of both", async () => {
    expect(await crew(arnold, { kind: "eod.add", jobId: "powell", clientId: cid() }, at("14:30"))).toMatchObject({ ok: false, status: 400, error: "Say what got done today, or record a voice memo." });
    expect(await crew(arnold, { kind: "eod.add", jobId: "powell", files: [file()], clientId: cid() }, at("14:31"))).toMatchObject({ ok: false, status: 400 }); // a photo is not a memo
    const memo = { ...file(), name: "memo-2026-10-05.m4a", type: "audio/mp4", size: 48000 };
    db.questions.push({ id: 91, email: ARNOLD, kind: "eod", status: "open", ref: { day: "2026-10-05" }, answer: "" });
    expect(await crew(arnold, { kind: "eod.add", jobId: "powell", files: [file(), memo], memoSeconds: 42, clientId: cid() }, at("14:35"))).toEqual({ ok: true });
    expect(db.entries.at(-1)).toMatchObject({ kind: "eod", body: "", data: { memo: { path: memo.path, seconds: 42 } }, files: [file(), memo] });
    expect(db.questions.at(-1)).toMatchObject({ status: "answered", answer: "filed" }); // a memo counts as the end of day
    expect(notify.owners).toHaveLength(0);
  });

  it("takes a time fix as a request, never as a change", async () => {
    await crew(arnold, { kind: "punch.in", jobId: "powell", clientId: cid() }, at("06:00"));
    const before = JSON.stringify(db.shifts[0]);
    const res = await crew(
      arnold,
      { kind: "timefix.add", day: "2026-10-05", start: "05:30", end: "14:00", breakMin: 30, jobId: "powell", shiftId: db.shifts[0].id, note: "Started early, forgot to clock in", clientId: cid() },
      at("15:00"),
    );
    expect(res).toEqual({ ok: true });
    expect(JSON.stringify(db.shifts[0])).toBe(before);
    expect(db.entries[0]).toMatchObject({ kind: "timefix", status: "new", data: { start: "05:30", end: "14:00", breakMin: 30 } });
    expect(notify.owners.at(-1)?.title).toBe("Time fix from Arnold");
  });

  it("refuses a time fix for someone else's shift, a future time, or a day long gone", async () => {
    await crew(beto, { kind: "punch.in", jobId: "powell", clientId: cid() }, at("06:00"));
    const base = { kind: "timefix.add" as const, day: "2026-10-05", start: "06:00", end: "14:00", jobId: "powell", note: "forgot to clock out" };
    expect(await crew(arnold, { ...base, shiftId: db.shifts[0].id, clientId: cid() }, at("15:00"))).toMatchObject({ ok: false, status: 404 });
    expect(await crew(arnold, { ...base, end: "17:00", clientId: cid() }, at("15:00"))).toMatchObject({ ok: false, status: 400 });
    expect(await crew(arnold, { ...base, day: "2026-09-01", clientId: cid() }, at("15:00"))).toMatchObject({ ok: false, status: 400 });
    expect(await crew(arnold, { ...base, start: "14:00", end: "06:00", clientId: cid() }, at("15:00"))).toMatchObject({ ok: false, status: 400 });
  });
});

describe("answering what was asked", () => {
  it("closes a forgotten shift at the time given, flagged for an owner", async () => {
    await crew(arnold, { kind: "punch.in", jobId: "powell", clientId: cid() }, at("06:00"));
    db.questions.push({ id: 50, email: ARNOLD, kind: "clockout", status: "open", ref: { shift: db.shifts[0].id }, askedBy: "bot", body: "?", answer: "" });
    expect(await crew(arnold, { kind: "answer", id: 50, answer: "half past two" }, at("19:00"))).toMatchObject({ ok: false, status: 400 });
    expect(await crew(arnold, { kind: "answer", id: 50, answer: "21:00" }, at("19:00"))).toMatchObject({ ok: false, status: 400 }); // not yet
    expect(await crew(arnold, { kind: "answer", id: 50, answer: "14:30" }, at("19:00"))).toEqual({ ok: true });
    expect(db.shifts[0]).toMatchObject({ endedAt: at("14:30").toISOString(), endSource: "reported", review: "clock-out time given afterwards by Arnold" });
    expect(db.questions[0]).toMatchObject({ status: "answered", answer: "14:30" });
  });

  it("leaves the shift open when they are still working", async () => {
    await crew(arnold, { kind: "punch.in", jobId: "powell", clientId: cid() }, at("06:00"));
    db.questions.push({ id: 51, email: ARNOLD, kind: "clockout", status: "open", ref: { shift: db.shifts[0].id }, askedBy: "bot", body: "?", answer: "" });
    expect(await crew(arnold, { kind: "answer", id: 51, answer: "still" }, at("19:00"))).toEqual({ ok: true });
    expect(db.shifts[0].endedAt).toBeNull();
  });

  it("puts the total on a receipt, and only a real figure", async () => {
    await crew(arnold, { kind: "receipt.add", jobId: "powell", files: [file()], clientId: cid() }, at("12:00"));
    db.questions.push({ id: 52, email: ARNOLD, kind: "amount", status: "open", ref: { entry: db.entries[0].id }, askedBy: "bot", body: "?", answer: "" });
    expect(await crew(arnold, { kind: "answer", id: 52, answer: "around forty" }, at("13:00"))).toMatchObject({ ok: false, status: 400 });
    expect(await crew(arnold, { kind: "answer", id: 52, answer: "$146.61" }, at("13:00"))).toEqual({ ok: true });
    expect(db.entries[0].data).toMatchObject({ amount: 146.61 });
  });

  it("cannot answer someone else's question, or the same one twice", async () => {
    db.questions.push({ id: 53, email: BETO, kind: "ask", status: "open", ref: {}, askedBy: owner.email, body: "Did it pass?", answer: "" });
    expect(await crew(arnold, { kind: "answer", id: 53, answer: "Yes" }, at("13:00"))).toMatchObject({ ok: false, status: 409 });
    expect(await crew(beto, { kind: "answer", id: 53, answer: "Yes" }, at("13:00"))).toEqual({ ok: true });
    expect(notify.owners.at(-1)).toMatchObject({ title: "Beto answered", body: "Did it pass? → Yes" });
    expect(await crew(beto, { kind: "answer", id: 53, answer: "No" }, at("13:01"))).toMatchObject({ ok: false, status: 409 });
  });
});

describe("tasks and the schedule, from the crew's side", () => {
  it("lets a person finish or flag their own task and nobody else's", async () => {
    db.tasks.push({ id: 70, email: ARNOLD, title: "Pick up hold-downs", status: "open", files: [], doneNote: "" });
    expect(await crew(beto, { kind: "task.update", id: 70, status: "done", files: [file()] }, at("10:00"))).toMatchObject({ ok: false, status: 404 });
    expect(await crew(arnold, { kind: "task.update", id: 70, status: "blocked", note: "White Cap is out" }, at("10:00"))).toEqual({ ok: true });
    expect(notify.owners.at(-1)).toMatchObject({ title: "Arnold is waiting", body: "Pick up hold-downs: White Cap is out" });
    expect(await crew(arnold, { kind: "task.update", id: 70, status: "done", files: [file()] }, at("11:00"))).toEqual({ ok: true });
    expect(db.tasks[0]).toMatchObject({ status: "done", closedAt: at("11:00").toISOString(), reportedAt: at("11:00").toISOString(), verifiedAt: null });
  });

  it("will not take 'done' without a photo of the finished work", async () => {
    db.tasks.push({ id: 71, email: ARNOLD, title: "Sand and second coat, hall", status: "doing", files: [], doneNote: "" });
    const res = await crew(arnold, { kind: "task.update", id: 71, status: "done" }, at("15:00"));
    expect(res).toMatchObject({ ok: false, status: 400, error: expect.stringContaining("photo") });
    expect(db.tasks[0].status).toBe("doing");
  });

  it("can mark a task started", async () => {
    db.tasks.push({ id: 72, email: ARNOLD, title: "Tape the garage", status: "open", files: [], doneNote: "" });
    expect(await crew(arnold, { kind: "task.update", id: 72, status: "doing" }, at("07:00"))).toEqual({ ok: true });
    expect(db.tasks[0].status).toBe("doing");
  });

  it("tells the owners when someone cannot make it", async () => {
    db.schedule.push({ id: 80, day: "2026-10-06", email: ARNOLD, jobId: "powell", jobName: "Powell Residence", startTime: "06:00", ack: "" });
    expect(await crew(beto, { kind: "schedule.ack", id: 80, ack: "ok" }, at("18:00"))).toMatchObject({ ok: false, status: 404 });
    expect(await crew(arnold, { kind: "schedule.ack", id: 80, ack: "cant", note: "Truck is in the shop" }, at("18:00"))).toEqual({ ok: true });
    expect(notify.owners.at(-1)).toMatchObject({ title: "Arnold cannot make it", body: "Powell Residence, Tue, Oct 6: Truck is in the shop" });
  });
});

describe("what an owner can do", () => {
  it("gives someone a seat: a sign-in marked as crew, a row, and the link in their language", async () => {
    const res = await admin({ kind: "person.add", name: "Carlos Vega", email: "carlos@example.com", lang: "es" }, at("09:00"));
    expect(res.ok).toBe(true);
    expect(auth.users).toEqual([{ id: "uid-1", email: "carlos@example.com", app_metadata: { sw_role: "crew" } }]);
    expect(db.people.get("carlos@example.com")).toMatchObject({ name: "Carlos Vega", lang: "es", active: true, authId: "uid-1", addedBy: "Lando" });
    expect(mail.sent[0]).toMatchObject({ to: "carlos@example.com", subject: "Tu app de Saddlewood" });
    expect(mail.links[0]).toBe("carlos@example.com -> /app"); // a crew link only ever lands in the app
  });

  it("will not make a crew seat out of an address that has the whole portal", async () => {
    const res = await admin({ kind: "person.add", name: "Marco", email: "marco@saddlewoodcontracting.com" }, at("09:00"));
    expect(res).toMatchObject({ ok: false, status: 400 });
    expect(auth.users).toHaveLength(0);
  });

  it("takes a seat away and gives it back, and the sign-in follows", async () => {
    await admin({ kind: "person.add", name: "Carlos Vega", email: "carlos@example.com", invite: false }, at("09:00"));
    await admin({ kind: "person.update", email: "carlos@example.com", active: false }, at("09:05"));
    // Never unmarked: the estimate tables let in any session that carries no mark.
    expect(auth.users[0].app_metadata.sw_role).toBe("former");
    expect(auth.users[0].banned).toBe("876000h");
    expect(db.people.get("carlos@example.com")?.active).toBe(false);
    await admin({ kind: "person.update", email: "carlos@example.com", active: true }, at("09:10"));
    expect(auth.users[0].app_metadata.sw_role).toBe("crew");
    expect(auth.users[0].banned).toBe("none");
    expect(db.people.get("carlos@example.com")?.active).toBe(true);
  });

  it("marks an account that already existed, and lifts a ban it carried", async () => {
    auth.users.push({ id: "uid-old", email: "returning@example.com", app_metadata: { provider: "email", sw_role: "former" }, banned: "876000h" });
    await admin({ kind: "person.add", name: "Returning Hand", email: "returning@example.com", invite: false }, at("09:00"));
    expect(auth.users[0]).toMatchObject({ app_metadata: { provider: "email", sw_role: "crew" }, banned: "none" });
    expect(db.people.get("returning@example.com")).toMatchObject({ authId: "uid-old", active: true });
  });

  it("hands out a sign-in code for a crew seat only", async () => {
    const ok = await admin({ kind: "person.code", email: ARNOLD }, at("09:00"));
    expect(ok).toMatchObject({ ok: true, code: "12345678", hours: 24 });
    expect(await admin({ kind: "person.code", email: "marco@saddlewoodcontracting.com" }, at("09:00"))).toMatchObject({ ok: false, status: 404 });
    expect(await admin({ kind: "person.code", email: "nobody@example.com" }, at("09:00"))).toMatchObject({ ok: false, status: 404 });
    db.people.set("marco@saddlewoodcontracting.com", person("marco@saddlewoodcontracting.com", "Marco"));
    expect(await admin({ kind: "person.code", email: "marco@saddlewoodcontracting.com" }, at("09:00"))).toMatchObject({ ok: false, status: 404 });
  });

  it("puts people on a job and tells them when it is today or tomorrow", async () => {
    const res = await admin({ kind: "schedule.set", day: "2026-10-06", emails: [ARNOLD, BETO, "stranger@example.com"], jobId: "powell", startTime: "06:00", note: "Bring the nailer" }, at("17:00"));
    expect(res).toMatchObject({ ok: true, note: "2 people on Powell Residence." });
    expect(db.schedule).toHaveLength(2);
    expect(notify.crew.map((c) => c.email).sort()).toEqual([ARNOLD, BETO]);
    expect(notify.crew[0].body).toBe("You are on Powell Residence tomorrow at 6:00 AM.");
    notify.crew.length = 0;
    await admin({ kind: "schedule.set", day: "2026-10-09", emails: [ARNOLD], jobId: "powell" }, at("17:00"));
    expect(notify.crew).toHaveLength(0); // further out: the night-before dispatch covers it
    expect(await admin({ kind: "schedule.set", day: "2026-10-06", emails: [ARNOLD], jobId: "old-job" }, at("17:00"))).toMatchObject({ ok: false, status: 400 });
  });

  it("copies one day's crew to the next", async () => {
    await admin({ kind: "schedule.set", day: "2026-10-05", emails: [ARNOLD, BETO], jobId: "powell", startTime: "06:00" }, at("05:00"));
    expect(await admin({ kind: "schedule.copy", from: "2026-10-05", to: "2026-10-06" }, at("17:00"))).toMatchObject({ ok: true, note: "Copied 2 assignments." });
    expect(db.schedule.filter((s) => s.day === "2026-10-06")).toHaveLength(2);
    expect(await admin({ kind: "schedule.copy", from: "2026-10-01", to: "2026-10-07" }, at("17:00"))).toMatchObject({ ok: false, status: 400 });
  });

  it("changes a shift only with a reason, and keeps what it said before", async () => {
    await crew(arnold, { kind: "punch.in", jobId: "powell", clientId: cid() }, at("06:02"));
    const id = db.shifts[0].id;
    expect(await admin({ kind: "shift.edit", id, end: "14:30", breakMin: 30, why: "Forgot to clock out; foreman confirmed" }, at("19:00"))).toEqual({ ok: true });
    expect(db.shifts[0]).toMatchObject({ startedAt: at("06:02").toISOString(), endedAt: at("14:30").toISOString(), breakMin: 30, endSource: "office" });
    expect(db.shifts[0].edits).toEqual([
      { at: at("19:00").toISOString(), by: "Lando", why: "Forgot to clock out; foreman confirmed", was: { startedAt: at("06:02").toISOString(), endedAt: null, breakMin: 0, jobName: "Powell Residence", status: "ok" } },
    ]);
  });

  it("refuses a time that has not happened, a break longer than the shift, and an overlap", async () => {
    await admin({ kind: "shift.add", email: ARNOLD, jobId: "powell", day: "2026-10-05", start: "06:00", end: "10:00", why: "from the foreman's sheet" }, at("12:00"));
    const id = db.shifts[0].id;
    expect(await admin({ kind: "shift.edit", id, end: "16:00", why: "testing" }, at("12:00"))).toMatchObject({ ok: false, status: 400 });
    expect(await admin({ kind: "shift.edit", id, breakMin: 300, why: "testing" }, at("12:00"))).toMatchObject({ ok: false, status: 400 });
    const clash = await admin({ kind: "shift.add", email: ARNOLD, jobId: "north-lane", day: "2026-10-05", start: "09:00", end: "11:00", why: "second job" }, at("12:00"));
    expect(clash).toMatchObject({ ok: false, status: 409 });
    expect(db.shifts).toHaveLength(1);
    expect(db.shifts[0]).toMatchObject({ source: "office", endSource: "office", note: "Entered by Lando: from the foreman's sheet" });
  });

  it("approves a time fix by changing the shift, with the request as the reason", async () => {
    await crew(arnold, { kind: "punch.in", jobId: "powell", clientId: cid() }, at("06:00"));
    await crew(arnold, { kind: "punch.out", clientId: cid() }, at("12:00"));
    await crew(arnold, { kind: "timefix.add", day: "2026-10-05", start: "06:00", end: "14:30", breakMin: 30, jobId: "powell", shiftId: db.shifts[0].id, note: "Clocked out by mistake at lunch", clientId: cid() }, at("15:00"));
    const fix = db.entries[0].id;
    notify.crew.length = 0;
    expect(await admin({ kind: "fix.decide", id: fix, approve: true }, at("16:00"))).toEqual({ ok: true });
    expect(db.shifts[0]).toMatchObject({ endedAt: at("14:30").toISOString(), breakMin: 30 });
    expect((db.shifts[0].edits as { why: string }[])[0].why).toBe("time fix asked by Arnold Mujica: Clocked out by mistake at lunch");
    expect(db.entries[0]).toMatchObject({ status: "approved", decidedBy: "Lando" });
    expect(notify.crew[0]).toMatchObject({ email: ARNOLD, body: "Approved for Mon, Oct 5." });
    expect(await admin({ kind: "fix.decide", id: fix, approve: false }, at("16:05"))).toMatchObject({ ok: false, status: 409 });
  });

  it("turns a time fix down without touching the shift, or adds a shift when there was none", async () => {
    await crew(arnold, { kind: "timefix.add", day: "2026-10-04", start: "07:00", end: "11:00", jobId: "powell", note: "Sunday call-out, no signal", clientId: cid() }, at("09:00"));
    await crew(beto, { kind: "timefix.add", day: "2026-10-04", start: "07:00", end: "11:00", jobId: "powell", note: "Igual", clientId: cid() }, at("09:00"));
    expect(await admin({ kind: "fix.decide", id: db.entries[0].id, approve: true }, at("10:00"))).toEqual({ ok: true });
    expect(db.shifts).toHaveLength(1);
    expect(db.shifts[0]).toMatchObject({ email: ARNOLD, day: "2026-10-04", source: "office" });
    expect(await admin({ kind: "fix.decide", id: db.entries[1].id, approve: false, note: "Not on the call sheet" }, at("10:00"))).toEqual({ ok: true });
    expect(db.shifts).toHaveLength(1);
    expect(db.entries[1]).toMatchObject({ status: "denied" });
    expect(notify.crew.at(-1)).toMatchObject({ email: BETO });
  });

  it("approves a time fix filed on a job that is not on the list", async () => {
    await crew(arnold, { kind: "timefix.add", day: "2026-10-04", start: "07:00", end: "11:00", jobId: "other", jobName: "Yard on 7th St", note: "Loaded the trailer", clientId: cid() }, at("09:00"));
    expect(await admin({ kind: "fix.decide", id: db.entries[0].id, approve: true }, at("10:00"))).toEqual({ ok: true });
    expect(db.shifts[0]).toMatchObject({ jobId: "other", jobName: "Yard on 7th St", day: "2026-10-04", source: "office" });
    expect(db.entries[0]).toMatchObject({ status: "approved" });
  });

  it("hands a time fix back when it cannot be applied, so it can be decided again", async () => {
    await admin({ kind: "shift.add", email: ARNOLD, jobId: "powell", day: "2026-10-04", start: "06:00", end: "12:00", why: "from the foreman" }, at("08:00"));
    await crew(arnold, { kind: "timefix.add", day: "2026-10-04", start: "09:00", end: "13:00", jobId: "north-lane", note: "Second job that day", clientId: cid() }, at("09:00"));
    const res = await admin({ kind: "fix.decide", id: db.entries[0].id, approve: true }, at("10:00"));
    expect(res).toMatchObject({ ok: false, status: 409 }); // it overlaps the shift already there
    expect(db.entries[0]).toMatchObject({ status: "new", decidedBy: "", botAt: null });
    expect(db.shifts).toHaveLength(1);
    expect(notify.crew).toHaveLength(0); // nobody is told "approved" for something that did not happen
    expect(await admin({ kind: "fix.decide", id: db.entries[0].id, approve: false, note: "Overlaps your Powell shift" }, at("10:05"))).toEqual({ ok: true });
    expect(db.entries[0]).toMatchObject({ status: "denied" });
  });

  it("asks the crew a question, and can take it back", async () => {
    expect(await admin({ kind: "question.ask", emails: [ARNOLD], body: "Did the shear inspection pass?", options: ["Yes", "No"] }, at("12:00"))).toMatchObject({ ok: true, note: "Asked Arnold." });
    expect(db.questions[0]).toMatchObject({ email: ARNOLD, kind: "ask", askedBy: owner.email, options: [{ v: "Yes", en: "Yes", es: "Yes" }, { v: "No", en: "No", es: "No" }] });
    await admin({ kind: "question.cancel", id: db.questions[0].id }, at("12:05"));
    expect(db.questions[0].status).toBe("cancelled");
  });

  it("adds a job once, and brings a finished one back instead of doubling it", async () => {
    expect(await admin({ kind: "job.add", name: "Bellevue Heights" }, at("09:00"))).toEqual({ ok: true });
    expect(db.jobs.get("bellevue-heights")).toMatchObject({ name: "Bellevue Heights", active: true });
    expect(await admin({ kind: "job.add", name: "bellevue heights" }, at("09:00"))).toMatchObject({ ok: false, status: 409 });
    expect(await admin({ kind: "job.add", name: "Old Job" }, at("09:00"))).toMatchObject({ ok: true });
    expect(db.jobs.get("old-job")?.active).toBe(true);
  });
});

describe("where a job is on the map", () => {
  const KEIM = { lat: 33.61094, lng: -112.33481, source: "census" as const };

  it("places a new job from its address, and keeps who placed it and when", async () => {
    geocoder.answer = KEIM;
    expect(await admin({ kind: "job.add", name: "Keim Dr", address: "12729 W Keim Dr, Glendale" }, at("09:00"))).toEqual({ ok: true });
    expect(geocoder.asked).toEqual(["12729 W Keim Dr, Glendale"]);
    expect(db.jobs.get("keim-dr")?.geo).toEqual({ lat: 33.61094, lng: -112.33481, source: "census", at: at("09:00").toISOString() });
  });

  it("saves the job whether or not it could be placed, and never asks without an address", async () => {
    expect(await admin({ kind: "job.add", name: "Keim Dr", address: "12729 W Keim Dr" }, at("09:00"))).toEqual({ ok: true });
    expect(db.jobs.get("keim-dr")).toMatchObject({ name: "Keim Dr", address: "12729 W Keim Dr", geo: null });
    expect(await admin({ kind: "job.add", name: "No Address" }, at("09:00"))).toEqual({ ok: true });
    expect(geocoder.asked).toEqual(["12729 W Keim Dr"]);
  });

  it("places a job again when its address changes, and forgets the old point when it is cleared or not found", async () => {
    geocoder.answer = KEIM;
    await admin({ kind: "job.update", id: "powell", address: "12729 W Keim Dr, Glendale" }, at("09:00"));
    expect(db.jobs.get("powell")).toMatchObject({ address: "12729 W Keim Dr, Glendale", geo: { lat: 33.61094 } });
    // The same address, saved again with a new note: not asked twice.
    await admin({ kind: "job.update", id: "powell", address: "12729 W Keim Dr, Glendale", note: "Gate 4411" }, at("09:05"));
    expect(geocoder.asked).toHaveLength(1);
    // A new address the geocoders cannot find: the old point must not stand for it.
    geocoder.answer = null;
    await admin({ kind: "job.update", id: "powell", address: "1 Nowhere Ln" }, at("09:10"));
    expect(db.jobs.get("powell")).toMatchObject({ address: "1 Nowhere Ln", geo: null });
    expect(geocoder.asked).toEqual(["12729 W Keim Dr, Glendale", "1 Nowhere Ln"]);
    // Cleared: nothing to ask, and nothing left on the row.
    geocoder.answer = KEIM;
    await admin({ kind: "job.update", id: "powell", address: "" }, at("09:15"));
    expect(db.jobs.get("powell")).toMatchObject({ address: "", geo: null });
    expect(geocoder.asked).toHaveLength(2);
  });

  it("finds one job on the map on request, and says when it could not", async () => {
    db.jobs.get("powell")!.address = "4201 N 7th St, Phoenix";
    expect(await admin({ kind: "job.geocode", id: "north-lane" }, at("09:00"))).toMatchObject({ ok: false, status: 400 });
    geocoder.answer = null;
    expect(await admin({ kind: "job.geocode", id: "powell" }, at("09:00"))).toMatchObject({ ok: true, set: 0, note: "Could not find Powell Residence on the map. Check the address." });
    geocoder.answer = KEIM;
    expect(await admin({ kind: "job.geocode", id: "powell" }, at("09:00"))).toMatchObject({ ok: true, set: 1, note: "Powell Residence is on the map." });
    expect(db.jobs.get("powell")?.geo).toMatchObject({ lat: 33.61094, source: "census" });
    expect(await admin({ kind: "job.geocode", id: "gone" }, at("09:00"))).toMatchObject({ ok: false, status: 404 });
  });

  it("places every active job with an address that is not on the map yet", async () => {
    db.jobs.get("powell")!.address = "4201 N 7th St, Phoenix";
    db.jobs.get("north-lane")!.address = "1 North Ln";
    db.jobs.get("north-lane")!.geo = { lat: 1, lng: 2, source: "owner", at: "x" };
    db.jobs.get("old-job")!.address = "Old address";
    geocoder.answer = KEIM;
    expect(await admin({ kind: "job.geocode" }, at("09:00"))).toMatchObject({ ok: true, set: 1, note: "1 of 1 job on the map." });
    // Only Powell: North Lane is placed already, Old Job is finished.
    expect(geocoder.asked).toEqual(["4201 N 7th St, Phoenix"]);
    expect(await admin({ kind: "job.geocode" }, at("09:00"))).toMatchObject({ ok: true, set: 0, note: "Every job with an address is on the map already." });
  });

  it("is the jobs switch, and a narrowed manager places only their own", async () => {
    expect(mayRun({ role: "member", email: ARNOLD, name: "Arnold", perms: ["jobs.promise"] }, "job.geocode")).toBe(false);
    expect(mayRun({ role: "member", email: ARNOLD, name: "Arnold", perms: ["jobs.manage"] }, "job.geocode")).toBe(true);
    db.jobs.get("powell")!.address = "4201 N 7th St, Phoenix";
    db.jobs.get("north-lane")!.address = "1 North Ln";
    db.people.set(ARNOLD, { ...arnold, perms: ["jobs.manage", "projects.mine"] });
    db.jobPeople = [{ jobId: "north-lane", email: ARNOLD, role: "pm" }];
    const mine = { role: "member" as const, email: ARNOLD, name: "Arnold", perms: ["jobs.manage", "projects.mine"] };
    geocoder.answer = KEIM;
    expect(await runAdminAct(mine, adminActSchema.parse({ kind: "job.geocode", id: "powell" }), at("09:00"))).toMatchObject({ ok: false, status: 403 });
    expect(await runAdminAct(mine, adminActSchema.parse({ kind: "job.geocode" }), at("09:00"))).toMatchObject({ ok: true, set: 1 });
    expect(geocoder.asked).toEqual(["1 North Ln"]);
  });
});

// ---- the field supervisor ---------------------------------------------------------

const ELI = "eli@example.com";
const FELIPE = "felipe@example.com";
const LEAD_PERMS = normalizePerms(["clock", "receipts", "updates", "schedule.edit", "tasks.assign", "tasks.verify", "questions.ask", "jobs.promise", "pickups.stage", "plan.send"]);
const eli: CrewPersonRow = { ...person(ELI, "Eli Lugo"), group: "lead", groupName: "Supervisor", perms: LEAD_PERMS };
const felipe: CrewPersonRow = { ...person(FELIPE, "Felipe Soto", "es"), group: "runner", groupName: "Runner", perms: ["clock", "receipts", "pickups.run"] };
const asLead = { role: "member" as const, email: ELI, name: "Eli Lugo", perms: LEAD_PERMS };
const lead = (input: AdminActInput, now: Date) => runAdminAct(asLead, adminActSchema.parse(input), now);

describe("reported done vs verified done", () => {
  beforeEach(() => {
    db.people.set(ELI, { ...eli });
  });

  it("sends 'done' to the lead, not Marco, and waits for the check", async () => {
    db.tasks.push({ id: 90, email: ARNOLD, title: "Finish drywall, kitchen", jobName: "Powell Residence", status: "doing", files: [], doneNote: "", detail: "", sentBack: 0 });
    expect(await crew(arnold, { kind: "task.update", id: 90, status: "done", note: "all coats", files: [file()] }, at("15:30"))).toEqual({ ok: true });
    expect(notify.leads.at(-1)).toMatchObject({ title: "Arnold says done: check it" });
    expect(notify.owners).toHaveLength(0);
    expect(db.tasks[0]).toMatchObject({ status: "done", verifiedAt: null });
  });

  it("sends it back with what is left, and the worker hears why", async () => {
    db.tasks.push({ id: 91, email: ARNOLD, title: "Finish drywall, kitchen", status: "done", files: [file()], doneNote: "", detail: "", sentBack: 0, verifiedAt: null });
    expect(await lead({ kind: "task.verify", id: 91, ok: false, note: "x" }, at("16:00"))).toMatchObject({ ok: false, status: 400 });
    expect(await lead({ kind: "task.verify", id: 91, ok: false, note: "Still needs sanding by the window" }, at("16:00"))).toMatchObject({ ok: true });
    expect(db.tasks[0]).toMatchObject({ status: "open", closedAt: null, reportedAt: null, sentBack: 1 });
    expect(String(db.tasks[0].detail)).toContain("Sent back by Eli (Mon, Oct 5): Still needs sanding by the window");
    expect(notify.crew.at(-1)).toMatchObject({ email: ARNOLD, body: expect.stringContaining("Still needs sanding") });
  });

  it("verifies it once, and the worker cannot reopen checked work", async () => {
    db.tasks.push({ id: 92, email: ARNOLD, title: "Hang board, garage", status: "done", files: [file()], doneNote: "", detail: "", sentBack: 0, verifiedAt: null });
    expect(await lead({ kind: "task.verify", id: 92, ok: true }, at("16:00"))).toMatchObject({ ok: true });
    expect(db.tasks[0]).toMatchObject({ status: "done", verifiedBy: "Eli Lugo" });
    expect(await lead({ kind: "task.verify", id: 92, ok: true }, at("16:01"))).toMatchObject({ ok: false, status: 409 });
    expect(await crew(arnold, { kind: "task.update", id: 92, status: "open" }, at("16:05"))).toMatchObject({ ok: false, status: 409 });
  });

  it("counts an owner's 'mark done' as checked", async () => {
    db.tasks.push({ id: 93, email: ARNOLD, title: "Punch list, bath 2", status: "open", files: [], doneNote: "", detail: "", sentBack: 0 });
    await admin({ kind: "task.update", id: 93, status: "done" }, at("12:00"));
    expect(db.tasks[0]).toMatchObject({ status: "done", verifiedBy: "Lando" });
  });

  it("still tells the owners about a safety report", async () => {
    await crew(arnold, { kind: "eod.add", jobId: "powell", done: "Framed the north wall", safety: "Ladder slipped, nobody hurt", clientId: cid() }, at("16:00"));
    expect(notify.leads.at(-1)).toMatchObject({ title: "Safety report · Powell Residence" });
    expect(notify.owners.at(-1)).toMatchObject({ title: "Safety report · Powell Residence" });
  });
});

describe("priorities and promises", () => {
  it("keeps the priority on the schedule and when a day is copied", async () => {
    await lead({ kind: "schedule.set", day: "2026-10-06", emails: [ARNOLD], jobId: "powell", startTime: "06:00", priority: 2 }, at("17:00"));
    expect(db.schedule[0]).toMatchObject({ priority: 2, createdBy: "Eli Lugo" });
    await lead({ kind: "schedule.copy", from: "2026-10-06", to: "2026-10-07" }, at("17:05"));
    expect(db.schedule[1]).toMatchObject({ day: "2026-10-07", priority: 2 });
  });

  it("lets the lead keep the promise current but not rename or close a job", async () => {
    expect(await lead({ kind: "job.update", id: "powell", promised: "2026-10-09", promiseNote: "Drywall ready for paint" }, at("09:00"))).toMatchObject({ ok: true });
    expect(db.jobs.get("powell")).toMatchObject({ promised: "2026-10-09", promise_note: "Drywall ready for paint" });
    expect(await lead({ kind: "job.update", id: "powell", name: "Powell" }, at("09:00"))).toMatchObject({ ok: false, status: 403 });
    expect(await lead({ kind: "job.update", id: "powell", active: false }, at("09:00"))).toMatchObject({ ok: false, status: 403 });
  });
});

describe("pickups for the runner", () => {
  beforeEach(() => {
    db.people.set(ELI, { ...eli });
    db.people.set(FELIPE, { ...felipe });
  });

  it("stages a pickup and tells the runners", async () => {
    const res = await lead(
      { kind: "pickup.add", day: "2026-10-06", jobId: "powell", supplier: "Home Depot 35th Ave", orderRef: "W123", items: "Box of 5,000 1-1/4 screws" },
      at("16:00"),
    );
    expect(res).toMatchObject({ ok: true, note: "On Felipe's list." });
    expect(db.pickups[0]).toMatchObject({ status: "staged", jobName: "Powell Residence", email: "" });
    expect(notify.crew.at(-1)).toMatchObject({ email: FELIPE, body: "Home Depot 35th Ave for Powell Residence, tomorrow." });
  });

  it("lets the runner pick up and deliver, with a photo at the job", async () => {
    db.pickups.push({ id: 100, day: "2026-10-05", supplier: "White Cap", jobName: "Powell Residence", email: "", status: "staged", files: [], pickedAt: null, deliveredAt: null });
    const runner = db.people.get(FELIPE) as CrewPersonRow;
    expect(await crew(arnold, { kind: "pickup.update", id: 100, status: "picked" }, at("08:00"))).toMatchObject({ ok: false, status: 404 });
    expect(await crew(runner, { kind: "pickup.update", id: 100, status: "picked" }, at("08:00"))).toEqual({ ok: true });
    expect(await crew(runner, { kind: "pickup.update", id: 100, status: "delivered" }, at("09:00"))).toMatchObject({ ok: false, status: 400 });
    expect(await crew(runner, { kind: "pickup.update", id: 100, status: "delivered", files: [file()] }, at("09:00"))).toEqual({ ok: true });
    expect(db.pickups[0]).toMatchObject({ status: "delivered", pickedBy: FELIPE, deliveredAt: at("09:00").toISOString() });
    expect(notify.leads.at(-1)).toMatchObject({ title: "Delivered · Powell Residence" });
    expect(await crew(runner, { kind: "pickup.update", id: 100, status: "problem", note: "wrong" }, at("09:05"))).toMatchObject({ ok: false, status: 404 });
  });

  it("flags a problem to the lead", async () => {
    db.pickups.push({ id: 101, day: "2026-10-05", supplier: "Home Depot", jobName: "", email: FELIPE, status: "staged", files: [] });
    const runner = db.people.get(FELIPE) as CrewPersonRow;
    expect(await crew(runner, { kind: "pickup.update", id: 101, status: "problem", note: "Only the 35th Ave store has the 5,000 box" }, at("08:30"))).toEqual({ ok: true });
    expect(notify.leads.at(-1)).toMatchObject({ title: "Pickup problem · Home Depot" });
  });
});

describe("the nightly plan", () => {
  it("puts tomorrow in priority order and tells the owners", async () => {
    db.people.set(ELI, { ...eli });
    await lead({ kind: "schedule.set", day: "2026-10-06", emails: [BETO], jobId: "north-lane", startTime: "07:00", priority: 5 }, at("17:00"));
    await lead({ kind: "schedule.set", day: "2026-10-06", emails: [ARNOLD], jobId: "powell", startTime: "06:00", priority: 2 }, at("17:00"));
    db.tasks.push({ id: 110, email: ARNOLD, title: "Sand the hall", jobName: "Powell Residence", status: "done", verifiedAt: null, files: [], doneNote: "", sentBack: 0 });
    const res = await lead({ kind: "report.send", day: "2026-10-06", note: "Need a yes on the soffit change" }, at("17:30"));
    expect(res).toMatchObject({ ok: true, note: "Sent to Marco." });
    const body = String(db.reports[0].body);
    expect(body.indexOf("Arnold · Powell Residence")).toBeLessThan(body.indexOf("Beto · North Lane"));
    expect(body).toContain("Sand the hall · Arnold: Reported done, needs checking");
    expect(body).toContain("NEED FROM MARCO\nNeed a yes on the soffit change");
    expect(notify.owners.at(-1)).toMatchObject({ title: "Eli's plan for Tue, Oct 6" });
  });
});

describe("Marco answers the plan, and checks the supervisor's own work", () => {
  it("records one answer, tells the supervisor, and refuses a second", async () => {
    db.people.set(ELI, { ...eli });
    await lead({ kind: "report.send", day: "2026-10-06", note: "OK the $6,200 lumber order?" }, at("17:30"));
    const id = db.reports[0].id as number;
    expect(mayRun(asLead, "report.answer")).toBe(false); // the route refuses it: answering is the owners'
    expect(await admin({ kind: "report.answer", id, text: "Yes, order it" }, at("17:45"))).toMatchObject({ ok: true, note: "Sent to Eli." });
    expect(db.reports[0].answer).toMatchObject({ text: "Yes, order it", name: "Lando", by: "lando@saddlewoodcontracting.com" });
    expect(notify.crew.at(-1)).toMatchObject({ email: ELI, title: "Lando answered your plan", body: "Yes, order it", url: "/app/crew?view=plan&day=2026-10-06" });
    expect(await admin({ kind: "report.answer", id, text: "No" }, at("17:50"))).toMatchObject({ ok: false, status: 409 });
    expect(await admin({ kind: "report.answer", id: 9999, text: "No" }, at("17:50"))).toMatchObject({ ok: false, status: 404 });
  });

  it("lets nobody check off their own task: an owner does", async () => {
    db.people.set(ELI, { ...eli });
    db.tasks.push({ id: 120, email: ELI, title: "Give Keim a date", status: "done", files: [file()], doneNote: "", detail: "", sentBack: 0, verifiedAt: null, createdBy: "Marco" });
    expect(await lead({ kind: "task.verify", id: 120, ok: true }, at("16:00"))).toMatchObject({ ok: false, status: 403 });
    db.tasks.push({ id: 121, email: ELI, title: "Call the inspector", status: "open", files: [], doneNote: "", detail: "", sentBack: 0 });
    expect(await lead({ kind: "task.update", id: 121, status: "done" }, at("16:00"))).toMatchObject({ ok: false, status: 403 });
    expect(await admin({ kind: "task.verify", id: 120, ok: true }, at("16:05"))).toMatchObject({ ok: true });
    expect(db.tasks.find((t) => t.id === 120)).toMatchObject({ verifiedBy: "Lando" });
  });
});

describe("groups and their switches", () => {
  it("lets an owner make a group, flip its switches, and only delete an empty one", async () => {
    const made = await admin({ kind: "group.save", name: "Foreman", perms: ["clock", "schedule.edit", "made-up"] }, at("09:00"));
    expect(made).toMatchObject({ ok: true });
    // Unknown switches drop out; any Crew-tab switch brings the tab itself.
    expect(db.groups.get("foreman")).toMatchObject({ name: "Foreman", perms: ["clock", "crew.view", "schedule.edit"] });
    await admin({ kind: "person.update", email: ARNOLD, group: "foreman" }, at("09:01"));
    expect(db.people.get(ARNOLD)).toMatchObject({ group: "foreman" });
    expect(await admin({ kind: "group.delete", id: "foreman" }, at("09:02"))).toMatchObject({ ok: false, status: 409 });
    expect(await admin({ kind: "group.delete", id: "crew" }, at("09:02"))).toMatchObject({ ok: false, status: 400 });
    expect(await admin({ kind: "person.update", email: ARNOLD, group: "nope" }, at("09:03"))).toMatchObject({ ok: false, status: 400 });
  });

  it("keeps the clock and receipts behind their switches, but never traps someone on the clock", async () => {
    const noClock: CrewPersonRow = { ...arnold, perms: [] };
    expect(await crew(noClock, { kind: "punch.in", jobId: "powell", clientId: cid() }, at("06:00"))).toMatchObject({ ok: false, status: 403 });
    expect(await crew(noClock, { kind: "receipt.add", jobId: "powell", files: [file()], clientId: cid() }, at("06:00"))).toMatchObject({ ok: false, status: 403 });
    await crew(arnold, { kind: "punch.in", jobId: "powell", clientId: cid() }, at("06:00"));
    expect(await crew(noClock, { kind: "punch.out", clientId: cid() }, at("14:00"))).toEqual({ ok: true });
  });

  it("lets a member keep a job's promise but not rename it without the jobs switch", async () => {
    expect(await lead({ kind: "job.update", id: "powell", name: "Powell" }, at("09:00"))).toMatchObject({ ok: false, status: 403 });
    const manager = { ...asLead, perms: normalizePerms([...LEAD_PERMS, "jobs.manage"]) };
    expect(await runAdminAct(manager, adminActSchema.parse({ kind: "job.update", id: "powell", name: "Powell" }), at("09:00"))).toMatchObject({ ok: true });
  });
});

describe("seats with no real email", () => {
  it("never emails a placeholder address, and says to use a code", async () => {
    const res = await admin({ kind: "person.add", name: "Filiberto Villegas", email: "filiberto.v@crew.saddlewoodcontracting.com", lang: "es" }, at("09:00"));
    expect(res).toMatchObject({ ok: true, note: expect.stringContaining("Get a code") });
    expect(await admin({ kind: "person.invite", email: "filiberto.v@crew.saddlewoodcontracting.com" }, at("09:01"))).toMatchObject({ ok: false, status: 400 });
    expect(mail.sent).toHaveLength(0);
    expect(await admin({ kind: "person.code", email: "filiberto.v@crew.saddlewoodcontracting.com" }, at("09:02"))).toMatchObject({ ok: true, code: "12345678" });
  });
});

describe("pay rates", () => {
  it("keeps a rate on the seat, and clears it with null", async () => {
    await admin({ kind: "person.update", email: ARNOLD, payRate: 21 }, at("09:00"));
    expect(db.people.get(ARNOLD)).toMatchObject({ pay_rate: 21 });
    await admin({ kind: "person.update", email: ARNOLD, payRate: null }, at("09:01"));
    expect(db.people.get(ARNOLD)).toMatchObject({ pay_rate: null });
    expect(adminActSchema.safeParse({ kind: "person.update", email: ARNOLD, payRate: -1 }).success).toBe(false);
  });
});

// ---- the project manager (0018): only the jobs they are on --------------------------------

describe("a project manager with projects.mine", () => {
  const PM_PERMS = normalizePerms([...LEAD_PERMS, "projects.view", "projects.mine", "money.view"]);
  const asPm = { role: "member" as const, email: ELI, name: "Eli Lugo", perms: PM_PERMS };
  const pm = (input: AdminActInput, now: Date) => runAdminAct(asPm, adminActSchema.parse(input), now);

  beforeEach(() => {
    db.people.set(ELI, { ...eli, perms: PM_PERMS });
    db.people.set(ARNOLD, person(ARNOLD, "Arnold Mujica", "es"));
    db.jobPeople = [{ jobId: "powell", email: ELI, role: "pm" }];
  });

  it("acts on the jobs they are on, and is refused the others", async () => {
    expect(await pm({ kind: "task.add", emails: [ARNOLD], title: "Hang the ceiling", jobId: "powell" }, at("09:00"))).toMatchObject({ ok: true });
    expect(await pm({ kind: "task.add", emails: [ARNOLD], title: "Frame the wall", jobId: "north-lane" }, at("09:00"))).toMatchObject({ ok: false, status: 403 });
    expect(await pm({ kind: "schedule.set", day: "2026-10-06", emails: [ARNOLD], jobId: "north-lane" }, at("09:00"))).toMatchObject({ ok: false, status: 403 });
    // A task with no job is not about a job they are kept off.
    expect(await pm({ kind: "task.add", emails: [ARNOLD], title: "Get the van washed" }, at("09:00"))).toMatchObject({ ok: true });
    // Rows another job owns, named by id.
    db.tasks.push({ id: 900, email: ARNOLD, title: "Other job work", jobId: "north-lane", jobName: "North Lane", status: "done", verifiedAt: null, files: [], sentBack: 0 });
    expect(await pm({ kind: "task.verify", id: 900, ok: true, note: "" }, at("09:05"))).toMatchObject({ ok: false, status: 403 });
  });

  it("copies only their own jobs' schedule", async () => {
    db.schedule.push(
      { id: 801, day: "2026-10-05", email: ARNOLD, jobId: "powell", jobName: "Powell Residence", startTime: "07:00", note: "", priority: null, ack: "", ackNote: "", ackAt: null },
      { id: 802, day: "2026-10-05", email: ARNOLD, jobId: "north-lane", jobName: "North Lane", startTime: "07:00", note: "", priority: null, ack: "", ackNote: "", ackAt: null },
    );
    expect(await pm({ kind: "schedule.copy", from: "2026-10-05", to: "2026-10-06" }, at("09:00"))).toMatchObject({ ok: true });
    expect(db.schedule.filter((r) => r.day === "2026-10-06").map((r) => r.jobId)).toEqual(["powell"]);
  });

  it("is never the one who assigns people or links billing", async () => {
    const { mayRun } = await import("../auth");
    expect(mayRun({ ...asPm }, "job.people")).toBe(false);
    expect(mayRun({ ...asPm }, "job.link")).toBe(false);
  });

  it("is put on a job they add", async () => {
    const asManager = { ...asPm, perms: normalizePerms([...PM_PERMS, "jobs.manage"]) };
    expect(await runAdminAct(asManager, adminActSchema.parse({ kind: "job.add", name: "Keim Dr" }), at("09:00"))).toMatchObject({ ok: true });
    expect(db.jobPeople).toContainEqual({ jobId: "keim-dr", email: ELI, role: "pm" });
  });
});

describe("owners: who is on a job, and its billing job", () => {
  beforeEach(() => {
    db.people.set(ELI, { ...eli });
    db.billing = [
      { id: "11111111-1111-4111-8111-111111111111", name: "Powell", client: "AFT", prefix: "8009", crewJobId: null },
      { id: "22222222-2222-4222-8222-222222222222", name: "North", client: "SB", prefix: "", crewJobId: "north-lane" },
    ];
  });

  it("sets who is on a job, only people with a seat", async () => {
    expect(await admin({ kind: "job.people", id: "powell", people: [{ email: ELI, role: "pm" }] }, at("09:00"))).toMatchObject({ ok: true });
    expect(db.jobPeople).toEqual([{ jobId: "powell", email: ELI, role: "pm" }]);
    expect(await admin({ kind: "job.people", id: "powell", people: [{ email: "nobody@example.com", role: "crew" }] }, at("09:00"))).toMatchObject({ ok: false, status: 400 });
    expect(await admin({ kind: "job.people", id: "powell", people: [] }, at("09:01"))).toMatchObject({ ok: true });
    expect(db.jobPeople).toEqual([]);
  });

  it("links a field job to its billing job, one each way", async () => {
    expect(await admin({ kind: "job.link", id: "powell", billingJobId: "11111111-1111-4111-8111-111111111111" }, at("09:00"))).toMatchObject({ ok: true });
    expect(db.billing[0].crewJobId).toBe("powell");
    expect(await admin({ kind: "job.link", id: "powell", billingJobId: "22222222-2222-4222-8222-222222222222" }, at("09:01"))).toMatchObject({ ok: false, status: 409 });
    expect(await admin({ kind: "job.link", id: "powell", billingJobId: "" }, at("09:02"))).toMatchObject({ ok: true });
    expect(db.billing[0].crewJobId).toBeNull();
  });
});

// ---- the stage of a job (0024) ------------------------------------------------------

describe("a job's phases and its stage", () => {
  const names = (jobId = "powell") =>
    db.phases
      .filter((p) => p.jobId === jobId)
      .sort((a, b) => (a.ord as number) - (b.ord as number))
      .map((p) => `${p.ord}:${p.name}${p.verifiedAt ? "*" : ""}`);

  it("starts a job from a template, after whatever it had", async () => {
    expect(await admin({ kind: "job.phases.template", jobId: "powell", template: "framing" }, at("09:00"))).toMatchObject({ ok: true, note: "5 framing phases on Powell Residence." });
    expect(names()).toEqual(["1:layout", "2:walls", "3:roof and ceiling", "4:backing", "5:inspection"]);
    expect(db.phases[0]).toMatchObject({ trade: "framing", createdBy: "Lando", plannedFrom: null, plannedTo: null });
    expect(await admin({ kind: "job.phases.template", jobId: "powell", template: "drywall" }, at("09:01"))).toMatchObject({ ok: true, note: "4 drywall phases on Powell Residence, after the ones it had." });
    expect(names()).toEqual(["1:layout", "2:walls", "3:roof and ceiling", "4:backing", "5:inspection", "6:hang", "7:tape", "8:texture", "9:punch"]);
    expect(await admin({ kind: "job.phases.template", jobId: "nope", template: "both" }, at("09:02"))).toMatchObject({ ok: false, status: 404 });
    expect(names("north-lane")).toEqual([]);
  });

  it("sets the list, keeping a verified phase where it is and never dropping it", async () => {
    await admin({ kind: "job.phases.template", jobId: "powell", template: "drywall" }, at("09:00"));
    const hang = db.phases.find((p) => p.name === "hang")!;
    expect(await admin({ kind: "phase.verify", id: hang.id, note: "Looked at it with Eli" }, at("16:00"))).toMatchObject({ ok: true, note: "hang: verified." });
    expect(hang).toMatchObject({ verifiedBy: "Lando", verifiedAt: at("16:00").toISOString() });
    expect(hang.note).toContain("Verified by Lando");
    expect(hang.note).toContain("Looked at it with Eli");
    // Tape goes, sand comes in with a plan, hang stays as it was checked.
    const set = { kind: "job.phases.set" as const, jobId: "powell" };
    expect(
      await admin({ ...set, phases: [{ name: "hang" }, { name: "sand", plannedFrom: "2026-10-06", plannedTo: "2026-10-07" }, { name: "texture" }, { name: "punch" }] }, at("16:01")),
    ).toMatchObject({ ok: true, note: "4 phases on Powell Residence." });
    expect(names()).toEqual(["1:hang*", "2:sand", "3:texture", "4:punch"]);
    expect(db.phases.find((p) => p.name === "hang")).toBe(hang);
    expect(db.phases.find((p) => p.name === "sand")).toMatchObject({ plannedFrom: "2026-10-06", plannedTo: "2026-10-07", createdBy: "Lando" });
    // Without hang: refused, and nothing changes.
    expect(await admin({ ...set, phases: [{ name: "sand" }] }, at("16:02"))).toMatchObject({
      ok: false,
      status: 409,
      error: '"hang" is verified and cannot be dropped. Unverify it first, or keep it on the list.',
    });
    expect(names()).toEqual(["1:hang*", "2:sand", "3:texture", "4:punch"]);
    // A plan that ends before it starts.
    expect(await admin({ ...set, phases: [{ name: "hang" }, { name: "sand", plannedFrom: "2026-10-08", plannedTo: "2026-10-07" }] }, at("16:03"))).toMatchObject({ ok: false, status: 400 });
    // Written by hand, with trades.
    expect(await admin({ ...set, phases: [{ name: "hang" }, { name: "demo", trade: "demo" }] }, at("16:04"))).toMatchObject({ ok: true, note: "2 phases on Powell Residence." });
    expect(names()).toEqual(["1:hang*", "2:demo"]);
    expect(await admin({ ...set, phases: [] }, at("16:05"))).toMatchObject({ ok: false, status: 409 });
    expect(await admin({ kind: "job.phases.set", jobId: "nope", phases: [] }, at("16:06"))).toMatchObject({ ok: false, status: 404 });
  });

  it("verifies once, unverifies only with a reason, and plans dates", async () => {
    await admin({ kind: "job.phases.template", jobId: "powell", template: "drywall" }, at("09:00"));
    const tape = db.phases.find((p) => p.name === "tape")!;
    expect(await admin({ kind: "phase.verify", id: tape.id }, at("16:00"))).toMatchObject({ ok: true });
    expect(await admin({ kind: "phase.verify", id: tape.id }, at("16:01"))).toMatchObject({ ok: false, status: 409, error: "Lando already verified it." });
    expect(() => adminActSchema.parse({ kind: "phase.unverify", id: tape.id, note: "" })).toThrow();
    expect(await admin({ kind: "phase.unverify", id: tape.id, note: "Cracks at the corners" }, at("16:02"))).toMatchObject({ ok: true, note: "tape is open again." });
    expect(tape).toMatchObject({ verifiedAt: null, verifiedBy: "" });
    expect(tape.note).toContain("Unverified by Lando");
    expect(tape.note).toContain("Cracks at the corners");
    expect(await admin({ kind: "phase.unverify", id: tape.id, note: "again" }, at("16:03"))).toMatchObject({ ok: false, status: 409 });
    expect(await admin({ kind: "phase.plan", id: tape.id, plannedFrom: "2026-10-07", plannedTo: "2026-10-06" }, at("16:04"))).toMatchObject({ ok: false, status: 400 });
    expect(await admin({ kind: "phase.plan", id: tape.id, plannedFrom: "2026-10-06", plannedTo: "2026-10-07" }, at("16:04"))).toMatchObject({ ok: true });
    expect(tape).toMatchObject({ plannedFrom: "2026-10-06", plannedTo: "2026-10-07" });
    expect(await admin({ kind: "phase.plan", id: tape.id, plannedFrom: "", plannedTo: "" }, at("16:05"))).toMatchObject({ ok: true });
    expect(tape).toMatchObject({ plannedFrom: null, plannedTo: null });
    expect(await admin({ kind: "phase.verify", id: 999 }, at("16:06"))).toMatchObject({ ok: false, status: 404 });
    expect(await admin({ kind: "phase.plan", id: 999, plannedFrom: "", plannedTo: "" }, at("16:06"))).toMatchObject({ ok: false, status: 404 });
  });

  it("is the jobs switch or a project manager on their own jobs; checking one off is the check-work switch", () => {
    const m = (perms: string[]) => ({ role: "member" as const, email: ELI, name: "Eli Lugo", perms: normalizePerms(perms) });
    expect(mayRun(m(["jobs.manage"]), "job.phases.set")).toBe(true);
    expect(mayRun(m(["projects.mine"]), "job.phases.set")).toBe(true);
    expect(mayRun(m(["projects.mine"]), "job.phases.template")).toBe(true);
    expect(mayRun(m(["jobs.promise"]), "job.phases.set")).toBe(false);
    expect(mayRun(m(["tasks.verify"]), "phase.verify")).toBe(true);
    expect(mayRun(m(["tasks.verify"]), "phase.unverify")).toBe(true);
    expect(mayRun(m(["projects.mine", "jobs.manage"]), "phase.verify")).toBe(false);
    expect(mayRun(m(["jobs.promise"]), "phase.plan")).toBe(true);
    expect(mayRun(m(["projects.mine"]), "phase.plan")).toBe(true);
    expect(mayRun(m(["tasks.verify"]), "phase.plan")).toBe(false);
    expect(mayRun({ ...m([]), role: "owner" }, "phase.verify")).toBe(true);
    expect(mayRun({ ...m([]), role: "owner" }, "job.phases.set")).toBe(true);
  });

  it("keeps a project manager to the jobs they are on, by job and by phase", async () => {
    const PM = normalizePerms([...LEAD_PERMS, "projects.view", "projects.mine"]);
    db.people.set(ELI, { ...eli, perms: PM });
    db.jobPeople = [{ jobId: "powell", email: ELI, role: "pm" }];
    const pm = (input: AdminActInput, now: Date) => runAdminAct({ role: "member", email: ELI, name: "Eli Lugo", perms: PM }, adminActSchema.parse(input), now);
    expect(await pm({ kind: "job.phases.template", jobId: "powell", template: "drywall" }, at("09:00"))).toMatchObject({ ok: true });
    expect(await pm({ kind: "job.phases.template", jobId: "north-lane", template: "drywall" }, at("09:00"))).toMatchObject({ ok: false, status: 403 });
    expect(await pm({ kind: "job.phases.set", jobId: "north-lane", phases: [{ name: "hang" }] }, at("09:00"))).toMatchObject({ ok: false, status: 403 });
    expect(names("north-lane")).toEqual([]);
    // A phase named by id on a job they are not on.
    await admin({ kind: "job.phases.template", jobId: "north-lane", template: "framing" }, at("09:01"));
    const theirs = db.phases.find((p) => p.jobId === "north-lane")!;
    const mine = db.phases.find((p) => p.jobId === "powell")!;
    expect(await pm({ kind: "phase.verify", id: theirs.id }, at("16:00"))).toMatchObject({ ok: false, status: 403 });
    expect(await pm({ kind: "phase.unverify", id: theirs.id, note: "not yet" }, at("16:00"))).toMatchObject({ ok: false, status: 403 });
    expect(await pm({ kind: "phase.plan", id: theirs.id, plannedFrom: "2026-10-06", plannedTo: "2026-10-07" }, at("16:00"))).toMatchObject({ ok: false, status: 403 });
    expect(theirs).toMatchObject({ verifiedAt: null, plannedFrom: null });
    expect(await pm({ kind: "phase.verify", id: mine.id, note: "" }, at("16:00"))).toMatchObject({ ok: true });
    expect(mine).toMatchObject({ verifiedBy: "Eli Lugo" });
    expect(await pm({ kind: "phase.unverify", id: mine.id, note: "not yet" }, at("16:01"))).toMatchObject({ ok: true });
    expect(await pm({ kind: "phase.plan", id: mine.id, plannedFrom: "2026-10-06", plannedTo: "2026-10-07" }, at("16:02"))).toMatchObject({ ok: true });
  });
});
