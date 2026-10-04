import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The crew's acts and the owners' acts, run against an in-memory stand-in for
// the crew tables. What is being tested is the rules: who may touch what, when
// a punch counts, what an answer does, and that every change to someone's
// time leaves a trail.

const ARNOLD = "arnold@example.com";
const BETO = "beto@example.com";
const KEY = "0123456789abcdef";

type Row = Record<string, unknown> & { id: number };

const { db, notify, auth, mail } = vi.hoisted(() => {
  const db = {
    people: new Map<string, Record<string, unknown>>(),
    jobs: new Map<string, Record<string, unknown>>(),
    shifts: [] as Row[],
    entries: [] as Row[],
    schedule: [] as Row[],
    tasks: [] as Row[],
    questions: [] as Row[],
    seq: 0,
  };
  return {
    db,
    notify: { owners: [] as { title: string; body: string }[], crew: [] as { email: string; body: string }[] },
    auth: { users: [] as { id: string; email: string; app_metadata: Record<string, unknown>; banned?: string }[] },
    mail: { sent: [] as { to: string; subject: string; text: string }[], links: [] as string[] },
  };
});

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
      const { auth_id, ...rest } = patch;
      Object.assign(row, rest, auth_id !== undefined ? { authId: auth_id } : {});
      return row;
    },
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
        const row = { id: next(), status: "open", doneNote: "", files: [], closedAt: null, ...r };
        db.tasks.push(row);
        return row;
      }),
    patchTask: async (id: number, patch: Record<string, unknown>, only?: { email?: string }) => {
      const row = db.tasks.find((t) => t.id === id && (!only?.email || t.email === only.email));
      if (!row) return null;
      const { done_note, closed_at, ...rest } = patch;
      Object.assign(row, rest, done_note !== undefined ? { doneNote: done_note } : {}, closed_at !== undefined ? { closedAt: closed_at } : {});
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

vi.mock("@/lib/bot/queries", () => ({ threadKey: () => KEY }));

vi.mock("../notify", () => ({
  notifyOwners: async (n: { title: string; body: string }) => void notify.owners.push(n),
  notifyCrew: async (p: { email: string }, text: { body: { en: string } }) => void notify.crew.push({ email: p.email, body: text.body.en }),
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
import type { CrewPersonRow } from "../queries";
import { crewActSchema, adminActSchema, type CrewActInput, type AdminActInput } from "../types";

const person = (email: string, name: string, lang: "en" | "es" = "en"): CrewPersonRow => ({
  email,
  name,
  lang,
  phone: "",
  trade: "",
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
  for (const k of ["shifts", "entries", "schedule", "tasks", "questions"] as const) db[k].length = 0;
  db.seq = 0;
  notify.owners.length = 0;
  notify.crew.length = 0;
  auth.users.length = 0;
  mail.sent.length = 0;
  mail.links.length = 0;
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
    await crew(beto, { kind: "eod.add", jobId: "powell", done: "Framed", asked: "x", safety: "Cut on the hand, bandaged", clientId: cid() }, at("14:45"));
    expect(notify.owners.at(-1)?.title).toBe("Safety report · Powell Residence");
  });

  it("files the end of day for today or yesterday only, and closes the bot's ask for it", async () => {
    db.questions.push({ id: 90, email: ARNOLD, kind: "eod", status: "open", ref: { day: "2026-10-04" }, answer: "" });
    expect(await crew(arnold, { kind: "eod.add", jobId: "powell", done: "Framed", day: "2026-10-02", clientId: cid() }, at("08:00"))).toMatchObject({ ok: false, status: 400 });
    expect(await crew(arnold, { kind: "eod.add", jobId: "powell", done: "Framed", day: "2026-10-04", clientId: cid() }, at("08:00"))).toEqual({ ok: true });
    expect(db.entries[0].day).toBe("2026-10-04");
    expect(db.questions[0]).toMatchObject({ status: "answered", answer: "filed" });
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
    expect(await crew(beto, { kind: "task.update", id: 70, status: "done" }, at("10:00"))).toMatchObject({ ok: false, status: 404 });
    expect(await crew(arnold, { kind: "task.update", id: 70, status: "blocked", note: "White Cap is out" }, at("10:00"))).toEqual({ ok: true });
    expect(notify.owners.at(-1)).toMatchObject({ title: "Arnold is blocked", body: "Pick up hold-downs: White Cap is out" });
    expect(await crew(arnold, { kind: "task.update", id: 70, status: "done" }, at("11:00"))).toEqual({ ok: true });
    expect(db.tasks[0]).toMatchObject({ status: "done", closedAt: at("11:00").toISOString() });
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
