import { beforeEach, describe, expect, it, vi } from "vitest";

// Material requests (migration 0023): where they come from (an end of day,
// the Mac's reading of a memo, a PM by hand), who may decide them under the
// owners' limits, how an order becomes the runner's pickup and mirrors back,
// the owners' settings, and what lands on "Waiting on you" and the 7 AM push.
// Run against in-memory stand-ins for the tables, like act.test.ts.

const OMAR = "omar@example.com";
const ELI = "eli@example.com";
const RUNNER = "rico@example.com";
const MARCO = "marco@saddlewoodcontracting.com";
const LANDO = "lando@saddlewoodcontracting.com";
const KEY = "0123456789abcdef";

type Row = Record<string, unknown> & { id: number };

const { db, notify, settings } = vi.hoisted(() => ({
  db: {
    people: new Map<string, Record<string, unknown>>(),
    jobs: new Map<string, Record<string, unknown>>(),
    jobPeople: [] as { jobId: string; email: string; role: "pm" | "supervisor" | "crew" }[],
    entries: [] as Row[],
    pickups: [] as Row[],
    requests: [] as Row[],
    seq: 0,
  },
  notify: {
    crew: [] as { email: string; title: string; body: string; url: string }[],
    push: [] as { to: string[]; title: string; body: string }[],
    leads: [] as { title: string }[],
  },
  settings: {
    current: { "requests.pmLimitCents": 50000, "requests.ownerLimitCents": 100000, "requests.answersFirst": "either", "crew.farFromJobM": 805 } as Record<string, unknown>,
    written: [] as { key: string; value: unknown; by: string }[],
  },
}));

vi.mock("../queries", () => ({
  getJob: async (id: string) => db.jobs.get(id) ?? null,
  getPerson: async (email: string) => db.people.get(email) ?? null,
  listPeople: async () => [...db.people.values()],
  listJobPeople: async (f: { email?: string } = {}) => db.jobPeople.filter((a) => !f.email || a.email === f.email),
  getEntry: async (id: number) => db.entries.find((e) => e.id === id) ?? null,
  countEntries: async () => 0,
  insertEntry: async (e: Record<string, unknown>) => {
    const prior = db.entries.find((x) => x.email === e.email && x.clientId === e.clientId);
    if (prior) return { entry: prior, existed: true };
    const row = { id: ++db.seq, status: "new", bot: {}, botAt: null, decidedBy: "", createdAt: "x", ...e };
    db.entries.push(row);
    return { entry: row, existed: false };
  },
  closeQuestions: async () => 0,
  getPickup: async (id: number) => db.pickups.find((p) => p.id === id) ?? null,
  insertPickup: async (p: Record<string, unknown>) => {
    const row = { id: ++db.seq, status: "staged", runnerNote: "", files: [], pickedBy: "", pickedAt: null, deliveredAt: null, createdAt: "x", ...p };
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
}));

vi.mock("../requestQueries", async (orig) => ({
  requestFromPickup: (await orig<typeof import("../requestQueries")>()).requestFromPickup,
  listRequests: async () => db.requests,
  getRequest: async (id: number) => db.requests.find((r) => r.id === id) ?? null,
  syncRequestToPickup: async (pickupId: number, pickup: string) => {
    const { requestFromPickup } = await orig<typeof import("../requestQueries")>();
    const next = requestFromPickup("ordered", pickup as never);
    let n = 0;
    for (const r of db.requests) {
      if (r.pickupId === pickupId && ["ordered", "picked", "delivered", "cancelled"].includes(r.status as string) && r.status !== next) {
        r.status = next;
        n++;
      }
    }
    return n;
  },
  insertRequest: async (r: Record<string, unknown>) => {
    const prior = r.entryId !== null ? db.requests.find((x) => x.entryId === r.entryId) : undefined;
    if (prior) return { request: prior, existed: true };
    const row = { id: ++db.seq, kind: "material", status: "asked", askedAt: "2026-10-05T21:35:00Z", decidedBy: "", decidedAt: null, decisionNote: "", talk: false, supplier: "", orderRef: "", store: "", pickupId: null, createdAt: "x", updatedAt: "x", ...r };
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
    readSettings: async () => ({ ...settings.current }),
    writeSetting: async (key: string, value: unknown, by: string) => {
      settings.current[key] = value;
      settings.written.push({ key, value, by });
    },
    clearSettingsCache: () => {},
  };
});

vi.mock("../notify", () => ({
  notifyCrew: async (p: { email: string }, text: { title: { en: string }; body: { en: string } }, _tag: string, url = "/app") =>
    void notify.crew.push({ email: p.email, title: text.title.en, body: text.body.en, url }),
  notifyOwners: async () => {},
  notifySupervisors: async (n: { title: string }) => void notify.leads.push(n),
}));

vi.mock("@/lib/bot/push", () => ({
  sendPush: async (to: string[], n: { title: string; body: string }) => {
    notify.push.push({ to, title: n.title, body: n.body });
    return { sent: to.length };
  },
}));

vi.mock("@/lib/bot/queries", () => ({
  threadKey: () => KEY,
  readState: async () => ({
    sections: { people: { [MARCO]: { name: "Marco", role: "owner" }, [LANDO]: { name: "Lando", role: "owner" } } },
    bridge: {},
  }),
}));

import { runCrewAct } from "../act";
import type { CrewPersonRow } from "../queries";
import { applyMacRequests, mirrorPickupToRequest, runRequestAct } from "../requests";
import { decideRule, ownersDecide, ownersFirst, pmDecides, requestDetail, requestTitle } from "../requestRules";
import { adminActSchema, crewActSchema, crewSyncSchema, type AdminActInput, type CrewActInput, type CrewRequest } from "../types";
import { buildMorning } from "@/lib/owner/morning";
import { buildWaiting } from "@/lib/owner/waiting";

const person = (email: string, name: string, perms: string[], lang: "en" | "es" = "en"): CrewPersonRow =>
  ({ email, name, lang, phone: "", trade: "", group: "crew", groupName: "Crew", perms, payRate: null, active: true, addedBy: "Lando", createdAt: "x", lastSeenAt: null, authId: null }) as CrewPersonRow;
const omar = person(OMAR, "Omar Perez", ["clock", "receipts"], "es");
const eli = person(ELI, "Eli Garcia", ["clock", "crew.view", "updates", "tasks.verify", "pickups.stage", "requests.approve", "projects.mine"]);
const rico = person(RUNNER, "Rico Alvarez", ["clock", "pickups.run"]);
const marco = { email: MARCO, name: "Marco", role: "owner" as const, perms: [] as string[] };
const asEli = { email: ELI, name: "Eli Garcia", role: "member" as const, perms: eli.perms };

// Monday 2026-10-05, Phoenix.
const at = (hhmm: string, day = "2026-10-05") => new Date(`${day}T${hhmm}:00-07:00`);
let n = 0;
const cid = () => `client-${String(++n).padStart(6, "0")}`;
const crew = (who: CrewPersonRow, input: CrewActInput, now = at("14:35")) => runCrewAct(who, crewActSchema.parse(input), now);
const admin = (who: typeof marco | typeof asEli, input: AdminActInput, now = at("15:00")) =>
  runRequestAct(who, adminActSchema.parse(input) as Parameters<typeof runRequestAct>[1], now);
const photo = () => ({ path: `u/${KEY}/202610/a1b2c3d4e5f6-r.jpg`, name: "r.jpg", type: "image/jpeg", size: 100 });

async function eodWithNeeds(needs = "20 hojas de OSB 5/8", clientId = cid()) {
  return crew(omar, { kind: "eod.add", jobId: "bambi", done: "Framed the north wall", needs, clientId });
}

function request(over: Partial<CrewRequest> = {}): CrewRequest {
  return {
    id: 1,
    kind: "material",
    jobId: "bambi",
    jobName: "6402 E Bambi",
    trade: "",
    items: "20 hojas de OSB 5/8",
    qty: "",
    estCents: null,
    status: "asked",
    askedBy: OMAR,
    askedAt: "2026-10-05T21:35:00Z",
    entryId: 7,
    decidedBy: "",
    decidedAt: null,
    decisionNote: "",
    talk: false,
    supplier: "",
    orderRef: "",
    store: "",
    pickupId: null,
    createdAt: "x",
    updatedAt: "x",
    ...over,
  };
}

beforeEach(() => {
  db.people.clear();
  db.jobs.clear();
  for (const k of ["entries", "pickups", "requests"] as const) db[k].length = 0;
  db.jobPeople = [{ jobId: "bambi", email: ELI, role: "pm" }];
  db.seq = 0;
  notify.crew.length = 0;
  notify.push.length = 0;
  notify.leads.length = 0;
  settings.current = { "requests.pmLimitCents": 50000, "requests.ownerLimitCents": 100000, "requests.answersFirst": "either", "crew.farFromJobM": 805 };
  settings.written.length = 0;
  db.people.set(OMAR, omar);
  db.people.set(ELI, eli);
  db.people.set(RUNNER, rico);
  db.jobs.set("bambi", { id: "bambi", name: "6402 E Bambi", address: "", note: "", active: true });
  db.jobs.set("keim", { id: "keim", name: "12729 W Keim Dr", address: "", note: "", active: true });
});

describe("the limit rules", () => {
  const eliDecides = { role: "member" as const, email: ELI, perms: eli.perms };
  const owner = { role: "owner" as const, email: MARCO, perms: [] };

  it("lets an owner decide anything, but a yes needs a number", () => {
    expect(decideRule(owner, request({ estCents: 900_000 }), "approve", undefined, 50000)).toEqual({ ok: true, overLimit: false });
    expect(decideRule(owner, request(), "approve", undefined, 50000)).toMatchObject({ ok: false, status: 400 });
    expect(decideRule(owner, request(), "talk", undefined, 50000)).toEqual({ ok: true, overLimit: false });
  });

  it("needs the switch, and never the asker's own request", () => {
    expect(decideRule({ ...eliDecides, perms: ["crew.view"] }, request(), "talk", undefined, 50000)).toMatchObject({ ok: false, status: 403 });
    expect(decideRule(eliDecides, request({ askedBy: ELI, estCents: 100 }), "approve", undefined, 50000)).toMatchObject({ ok: false, status: 403 });
  });

  it("approves up to the PM limit, hands a yes above it up, and refuses a no above it", () => {
    expect(decideRule(eliDecides, request({ estCents: 41200 }), "approve", undefined, 50000)).toEqual({ ok: true, overLimit: false });
    expect(decideRule(eliDecides, request({ estCents: 50000 }), "approve", undefined, 50000)).toEqual({ ok: true, overLimit: false });
    expect(decideRule(eliDecides, request(), "approve", 75000, 50000)).toEqual({ ok: true, overLimit: true });
    expect(decideRule(eliDecides, request(), "approve", undefined, 50000)).toMatchObject({ ok: false, status: 400 });
    expect(decideRule(eliDecides, request({ estCents: 75000 }), "deny", undefined, 50000)).toMatchObject({ ok: false, status: 403 });
    expect(decideRule(eliDecides, request({ estCents: 75000 }), "talk", undefined, 50000)).toEqual({ ok: true, overLimit: false });
    expect(decideRule(eliDecides, request({ status: "approved" }), "approve", 100, 50000)).toMatchObject({ ok: false, status: 409 });
  });

  it("says whose list a request lands on", () => {
    const pm = db.jobPeople;
    expect(ownersDecide(request(), pm, 50000)).toBe(false); // the PM's, no number yet
    expect(ownersDecide(request({ estCents: 75000 }), pm, 50000)).toBe(true);
    expect(ownersDecide(request({ jobId: "keim" }), pm, 50000)).toBe(true); // nobody else can
    expect(ownersDecide(request({ askedBy: ELI }), pm, 50000)).toBe(true); // the PM's own
    expect(pmDecides(request(), ELI, 50000)).toBe(true);
    expect(pmDecides(request({ estCents: 75000 }), ELI, 50000)).toBe(false);
    expect(pmDecides(request({ askedBy: ELI }), ELI, 50000)).toBe(false);
  });

  it("picks whose phone the owners' push goes to", () => {
    const people = { [MARCO]: { name: "Marco", role: "owner" as const }, [LANDO]: { name: "Lando", role: "owner" as const }, "x@y.com": { name: "Eli", role: "requester" as const } };
    expect(ownersFirst(people, "either")).toEqual([LANDO, MARCO]);
    expect(ownersFirst(people, "marco")).toEqual([MARCO]);
    expect(ownersFirst({ [LANDO]: people[LANDO] }, "marco")).toEqual([LANDO]); // no Marco seat: everyone
  });

  it("reads like the card", () => {
    expect(requestTitle(request(), "Omar")).toBe("Material request · Omar · 6402 E Bambi");
    expect(requestDetail(request({ estCents: 41200 }))).toBe("20 hojas de OSB 5/8 · est $412");
    expect(requestDetail(request({ qty: "20", estCents: 41250 }))).toBe("20 hojas de OSB 5/8 (20) · est $412.50");
  });
});

describe("where a request comes from", () => {
  it("makes one from the end of day's needs, once, and tells the PM on the job", async () => {
    const clientId = cid();
    expect(await eodWithNeeds("20 hojas de OSB 5/8", clientId)).toEqual({ ok: true });
    expect(db.requests).toHaveLength(1);
    expect(db.requests[0]).toMatchObject({ status: "asked", askedBy: OMAR, jobId: "bambi", jobName: "6402 E Bambi", items: "20 hojas de OSB 5/8", entryId: db.entries[0].id, estCents: null });
    expect(notify.crew).toEqual([{ email: ELI, title: "Material request", body: "Omar · 6402 E Bambi: 20 hojas de OSB 5/8", url: "/app/crew" }]);
    expect(notify.push).toEqual([]);
    // The same form again (a retry) is the same request.
    await eodWithNeeds("20 hojas de OSB 5/8", clientId);
    expect(db.requests).toHaveLength(1);
  });

  it("makes none when nothing is needed", async () => {
    await crew(omar, { kind: "eod.add", jobId: "bambi", done: "Framed the north wall", clientId: cid() });
    expect(db.requests).toEqual([]);
  });

  it("goes to the owners when the job has no PM, and to both of them over the owners' limit", async () => {
    db.jobPeople = [];
    await eodWithNeeds();
    expect(notify.crew).toEqual([]);
    expect(notify.push).toEqual([{ to: [LANDO, MARCO], title: "Material request · Omar · 6402 E Bambi", body: "20 hojas de OSB 5/8" }]);
    notify.push.length = 0;
    settings.current["requests.answersFirst"] = "marco";
    await crew(omar, { kind: "eod.add", jobId: "bambi", done: "Set block", needs: "A pallet of block", clientId: cid() });
    expect(notify.push).toEqual([expect.objectContaining({ to: [MARCO] })]);
  });

  it("takes the Mac's reading of a memo, once per entry, and only from an end of day", async () => {
    await crew(omar, { kind: "eod.add", jobId: "bambi", done: "Framed the north wall", clientId: cid() });
    await crew(omar, { kind: "receipt.add", jobId: "bambi", amount: 10, files: [photo()], clientId: cid() });
    const [eod, receipt] = db.entries;
    const post = crewSyncSchema.parse({
      requests: [
        { entryId: eod.id, jobId: "", jobName: "", items: "4 bags of concrete", trade: "Framing" },
        { entryId: receipt.id, items: "not from an end of day" },
        { entryId: 999, items: "no such entry" },
        { entryId: eod.id, items: "" }, // dropped by the schema
      ],
    });
    expect(post.requests).toHaveLength(3);
    const active = new Map([[OMAR, omar]]);
    expect(await applyMacRequests(post.requests, active)).toBe(1);
    expect(db.requests).toEqual([expect.objectContaining({ askedBy: OMAR, items: "4 bags of concrete", trade: "Framing", jobName: "6402 E Bambi", entryId: eod.id })]);
    expect(await applyMacRequests(post.requests, active)).toBe(0);
    expect(db.requests).toHaveLength(1);
  });

  it("lets a PM ask by hand on their job, and it is then the owners' to decide", async () => {
    expect(await admin(asEli, { kind: "request.add", jobId: "bambi", items: "A pallet of block", qty: "1 pallet", estCents: 32000 })).toMatchObject({ ok: true });
    expect(db.requests[0]).toMatchObject({ askedBy: ELI, items: "A pallet of block", qty: "1 pallet", estCents: 32000, status: "asked" });
    expect(notify.push).toEqual([expect.objectContaining({ to: [LANDO, MARCO], body: "A pallet of block (1 pallet) · est $320" })]);
    expect(await admin(asEli, { kind: "request.decide", id: db.requests[0].id, decision: "approve" })).toMatchObject({ ok: false, status: 403 });
  });
});

describe("deciding", () => {
  beforeEach(async () => {
    await eodWithNeeds();
    notify.crew.length = 0;
  });

  it("approves under the PM limit, with the number the PM put on it, and tells the asker in Spanish", async () => {
    expect(await admin(asEli, { kind: "request.decide", id: 2, decision: "approve", estCents: 41200 })).toMatchObject({ ok: true });
    expect(db.requests[0]).toMatchObject({ status: "approved", estCents: 41200, decidedBy: "Eli Garcia", decidedAt: at("15:00").toISOString() });
    expect(notify.crew).toEqual([{ email: OMAR, title: "Material approved", body: "Eli approved: 20 hojas de OSB 5/8", url: "/app" }]);
  });

  it("needs a number for a yes", async () => {
    expect(await admin(asEli, { kind: "request.decide", id: 2, decision: "approve" })).toMatchObject({ ok: false, status: 400 });
    expect(db.requests[0].status).toBe("asked");
  });

  it("hands a yes over the PM limit up to the owners, keeping the number and the request open", async () => {
    const res = await admin(asEli, { kind: "request.decide", id: 2, decision: "approve", estCents: 75000 });
    expect(res).toMatchObject({ ok: true, note: expect.stringContaining("Over your limit ($500)") });
    expect(db.requests[0]).toMatchObject({ status: "asked", estCents: 75000 });
    expect(notify.push).toEqual([{ to: [LANDO, MARCO], title: "Material request · Omar · 6402 E Bambi · over Eli's limit", body: "20 hojas de OSB 5/8 · est $750 · Eli says yes" }]);
    expect(notify.crew).toEqual([]);
    // Marco can say yes to anything.
    expect(await admin(marco, { kind: "request.decide", id: 2, decision: "approve" })).toMatchObject({ ok: true });
    expect(db.requests[0]).toMatchObject({ status: "approved", decidedBy: "Marco" });
    // The PM on the job is told to place the order.
    expect(notify.crew).toEqual([
      { email: OMAR, title: "Material approved", body: "Marco approved: 20 hojas de OSB 5/8", url: "/app" },
      { email: ELI, title: "Approved: place the order", body: "Omar's request: 20 hojas de OSB 5/8", url: "/app/crew" },
    ]);
  });

  it("needs a reason for a no, and tells the asker", async () => {
    expect(await admin(asEli, { kind: "request.decide", id: 2, decision: "deny" })).toMatchObject({ ok: false, status: 400 });
    expect(await admin(asEli, { kind: "request.decide", id: 2, decision: "deny", note: "We have 12 sheets in the trailer" })).toMatchObject({ ok: true });
    expect(db.requests[0]).toMatchObject({ status: "denied", decisionNote: "We have 12 sheets in the trailer" });
    expect(notify.crew[0]).toMatchObject({ email: OMAR, title: "Material not approved", body: "Eli did not approve: 20 hojas de OSB 5/8 — We have 12 sheets in the trailer" });
  });

  it("keeps it open on Talk to me, and the asker hears who wants to talk", async () => {
    expect(await admin(marco, { kind: "request.decide", id: 2, decision: "talk", note: "Which thickness?" })).toMatchObject({ ok: true });
    expect(db.requests[0]).toMatchObject({ status: "asked", talk: true, decidedBy: "Marco", decisionNote: "Which thickness?" });
    expect(notify.crew).toEqual([{ email: OMAR, title: "Marco wants to talk about your request", body: "20 hojas de OSB 5/8 — Which thickness?", url: "/app" }]);
    expect(await admin(asEli, { kind: "request.decide", id: 2, decision: "approve", estCents: 100 })).toMatchObject({ ok: true });
  });

  it("is decided once", async () => {
    await admin(asEli, { kind: "request.decide", id: 2, decision: "approve", estCents: 100 });
    expect(await admin(marco, { kind: "request.decide", id: 2, decision: "deny", note: "no" })).toMatchObject({ ok: false, status: 409 });
  });

  it("can be taken back by the asker while it is still asked, and cancelled by the PM with a reason", async () => {
    expect(await crew(omar, { kind: "request.cancel", id: 2, note: "found some" })).toEqual({ ok: true });
    expect(db.requests[0]).toMatchObject({ status: "cancelled", decidedBy: "Omar Perez" });
    expect(await crew(omar, { kind: "request.cancel", id: 2, note: "again" })).toMatchObject({ ok: false, status: 404 });
    await eodWithNeeds("A pallet of block");
    expect(await admin(asEli, { kind: "request.cancel", id: 4, note: "Marco is bringing it" })).toMatchObject({ ok: true });
    expect(notify.crew.at(-1)).toMatchObject({ email: OMAR, title: "Request cancelled", body: "Eli cancelled: A pallet of block — Marco is bringing it" });
  });
});

describe("ordering, and the pickup that comes of it", () => {
  beforeEach(async () => {
    await eodWithNeeds();
    await admin(asEli, { kind: "request.decide", id: 2, decision: "approve", estCents: 41200 });
    notify.crew.length = 0;
  });

  it("marks it ordered and stages the runner's pickup for tomorrow", async () => {
    const res = await admin(asEli, { kind: "request.order", id: 2, supplier: "Home Depot, 35th Ave", store: "3535 W Bell Rd", orderRef: "WC-1184" });
    expect(res).toMatchObject({ ok: true, note: expect.stringContaining("Rico's list for tomorrow") });
    expect(db.pickups).toEqual([
      expect.objectContaining({
        day: "2026-10-06",
        jobId: "bambi",
        jobName: "6402 E Bambi",
        supplier: "Home Depot, 35th Ave",
        place: "3535 W Bell Rd",
        orderRef: "WC-1184",
        items: "20 hojas de OSB 5/8",
        note: "request #2",
        email: "",
        createdBy: "Eli Garcia",
        status: "staged",
      }),
    ]);
    expect(db.requests[0]).toMatchObject({ status: "ordered", supplier: "Home Depot, 35th Ave", store: "3535 W Bell Rd", orderRef: "WC-1184", pickupId: db.pickups[0].id });
    expect(notify.crew).toEqual([
      { email: RUNNER, title: "Pickup", body: "Home Depot, 35th Ave for 6402 E Bambi, tomorrow.", url: "/app" },
      { email: OMAR, title: "Material ordered", body: "20 hojas de OSB 5/8 · Home Depot, 35th Ave, pickup tomorrow.", url: "/app" },
    ]);
  });

  it("takes a day, never one that has passed, and only orders once", async () => {
    expect(await admin(asEli, { kind: "request.order", id: 2, supplier: "Lowe's", day: "2026-10-04" })).toMatchObject({ ok: false, status: 400 });
    expect(await admin(asEli, { kind: "request.order", id: 2, supplier: "Lowe's", day: "2026-10-07" })).toMatchObject({ ok: true });
    expect(db.pickups[0].day).toBe("2026-10-07");
    expect(await admin(asEli, { kind: "request.order", id: 2, supplier: "Lowe's" })).toMatchObject({ ok: false, status: 409 });
  });

  it("an owner's order on an asked request is its approval; a PM's needs the approval first", async () => {
    await eodWithNeeds("A pallet of block");
    expect(await admin(asEli, { kind: "request.order", id: 4, supplier: "Lowe's" })).toMatchObject({ ok: false, status: 409, error: "Approve it first." });
    expect(await admin(marco, { kind: "request.order", id: 4, supplier: "Lowe's" })).toMatchObject({ ok: true });
    expect(db.requests[1]).toMatchObject({ status: "ordered", decidedBy: "Marco" });
  });

  it("follows the pickup: picked up, then delivered", async () => {
    await admin(asEli, { kind: "request.order", id: 2, supplier: "Home Depot" });
    const pickupId = db.pickups[0].id as number;
    expect(await crew(rico, { kind: "pickup.update", id: pickupId, status: "picked" }, at("08:10", "2026-10-06"))).toEqual({ ok: true });
    expect(db.requests[0].status).toBe("picked");
    expect(await crew(rico, { kind: "pickup.update", id: pickupId, status: "delivered", files: [photo()] }, at("09:00", "2026-10-06"))).toEqual({ ok: true });
    expect(db.requests[0].status).toBe("delivered");
  });

  it("is cancelled with its pickup, and ordered again if the pickup is staged again", async () => {
    await admin(asEli, { kind: "request.order", id: 2, supplier: "Home Depot" });
    const pickupId = db.pickups[0].id as number;
    // The office cancels the pickup (Crew admin's pickup.update, which carries it back).
    await mirrorPickupToRequest(pickupId, "cancelled");
    expect(db.requests[0].status).toBe("cancelled");
    await mirrorPickupToRequest(pickupId, "staged");
    expect(db.requests[0].status).toBe("ordered");
  });
});

describe("a request reads where it stands from its pickup", () => {
  it("once ordered, is the pickup's status; before that, its own", async () => {
    const { requestFromPickup } = await vi.importActual<typeof import("../requestQueries")>("../requestQueries");
    expect(requestFromPickup("ordered", "picked")).toBe("picked");
    expect(requestFromPickup("ordered", "delivered")).toBe("delivered");
    expect(requestFromPickup("picked", "cancelled")).toBe("cancelled");
    expect(requestFromPickup("delivered", "staged")).toBe("ordered");
    // A pickup in trouble is still on order; the line says so (pickupStatus).
    expect(requestFromPickup("picked", "problem")).toBe("ordered");
    // The column says ordered but the copy-back was missed: the pickup wins.
    expect(requestFromPickup("ordered", "delivered")).toBe("delivered");
    // Never ordered, or no pickup: the request's own status.
    expect(requestFromPickup("approved", "delivered")).toBe("approved");
    expect(requestFromPickup("denied", "staged")).toBe("denied");
    expect(requestFromPickup("ordered", null)).toBe("ordered");
  });
});

describe("the owners' settings", () => {
  it("are the owners' alone, by key, within what each one takes", async () => {
    expect(await admin(asEli, { kind: "settings.set", key: "requests.pmLimitCents", value: 100 })).toMatchObject({ ok: false, status: 403 });
    expect(await admin(marco, { kind: "settings.set", key: "requests.secret", value: 1 })).toMatchObject({ ok: false, status: 400 });
    expect(await admin(marco, { kind: "settings.set", key: "requests.answersFirst", value: "ilene" })).toMatchObject({ ok: false, status: 400 });
    expect(await admin(marco, { kind: "settings.set", key: "requests.pmLimitCents", value: 200_000 })).toMatchObject({ ok: false, status: 400 }); // above the owners' limit
    expect(await admin(marco, { kind: "settings.set", key: "requests.pmLimitCents", value: 75_000 })).toMatchObject({ ok: true });
    expect(await admin(marco, { kind: "settings.set", key: "requests.answersFirst", value: "lando" })).toMatchObject({ ok: true });
    expect(await admin(marco, { kind: "settings.set", key: "crew.farFromJobM", value: 1200 })).toMatchObject({ ok: true });
    expect(settings.written).toEqual([
      { key: "requests.pmLimitCents", value: 75_000, by: "Marco" },
      { key: "requests.answersFirst", value: "lando", by: "Marco" },
      { key: "crew.farFromJobM", value: 1200, by: "Marco" },
    ]);
  });

  it("move the limit for the next decision", async () => {
    await eodWithNeeds();
    settings.current["requests.pmLimitCents"] = 75_000;
    expect(await admin(asEli, { kind: "request.decide", id: 2, decision: "approve", estCents: 60_000 })).toMatchObject({ ok: true });
    expect(db.requests[0].status).toBe("approved");
  });
});

describe("Waiting on you, and the 7 AM push", () => {
  const NOW = new Date("2026-10-06T02:00:00Z"); // Mon Oct 5, 7 PM Phoenix
  const people = [{ email: ELI, name: "Eli Garcia", active: true, perms: eli.perms }];
  const base = { now: NOW, people, reports: [], tasks: [], jobs: [], timefixes: 0, reviews: 0, money: null, owners: ["Marco", "Lando"], jobPeople: db.jobPeople, pmLimitCents: 50000 };

  it("shows the owners only what is theirs: over the limit, or with nobody else to ask", () => {
    const jobPeople = [{ jobId: "bambi", email: ELI, role: "pm" as const }];
    expect(buildWaiting({ ...base, jobPeople, requests: [request()] })).toEqual([]);
    const over = buildWaiting({ ...base, jobPeople, requests: [request({ estCents: 75000, talk: true, decidedBy: "Eli Garcia" })] });
    expect(over).toEqual([
      expect.objectContaining({
        key: "request-1",
        lane: "decisions",
        kind: "decision",
        title: "Material request · omar · 6402 E Bambi",
        detail: "20 hojas de OSB 5/8 · est $750 · Eli asked to talk",
        href: "/app/crew",
        at: "2026-10-05T21:35:00Z",
        request: { id: 1, estCents: 75000, talk: true },
      }),
    ]);
    expect(over[0].who).toBeUndefined();
    const noPm = buildWaiting({ ...base, jobPeople, requests: [request({ jobId: "keim", jobName: "12729 W Keim Dr" })], answersFirst: "lando" });
    expect(noPm[0]).toMatchObject({ who: "Lando", request: { id: 1, estCents: null, talk: false } });
    expect(buildWaiting({ ...base, jobPeople, requests: [request({ status: "approved", estCents: 75000 })] })).toEqual([]);
  });

  it("counts the PM's open requests in their morning line, within their limit and on their jobs", () => {
    const notes = buildMorning({
      day: "2026-10-06",
      owners: { [MARCO]: { name: "Marco", role: "owner" } },
      people: [{ email: ELI, name: "Eli Garcia", lang: "en", active: true, perms: eli.perms }],
      schedule: [],
      tasks: [],
      reports: [],
      waiting: [],
      bids: 0,
      jobPeople: [{ jobId: "bambi", email: ELI, role: "pm" }],
      requests: [request(), request({ id: 2, estCents: 75000 }), request({ id: 3, jobId: "keim" }), request({ id: 4, askedBy: ELI })],
      pmLimitCents: 50000,
    });
    expect(notes.find((x) => x.email === ELI)?.body).toBe("Nobody is on the schedule today. · 1 material request waiting");
  });
});
