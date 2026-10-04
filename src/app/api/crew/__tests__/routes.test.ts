import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { emptySections, type BotSections } from "@/lib/bot/types";

// The three doors on the crew side, tested at the routes:
//   a crew member (session with the crew mark AND an active seat): their own day
//   an owner (portal session with an owner's seat): the whole crew
//   the Mac (agent token): /api/bot/crew and nothing else
// None of them may use another's door.

const TOKEN = "test-token-with-enough-length-1234";
const LANDO = "lando@saddlewoodcontracting.com";
const ELI = "eli@saddlewoodcontracting.com"; // on the portal allowlist, but not an owner
const ARNOLD = "arnold@example.com";

const { session, people, spies, db } = vi.hoisted(() => ({
  db: { down: false },
  session: { user: null as { email: string; app_metadata?: Record<string, unknown> } | null },
  people: new Map<string, { email: string; name: string; lang: string; active: boolean; lastSeenAt: null }>(),
  spies: {
    runCrewAct: vi.fn(),
    runAdminAct: vi.fn(),
    applyCrewSync: vi.fn(),
    crewHome: vi.fn(),
    adminHome: vi.fn(),
    crewFeed: vi.fn(),
    signUpload: vi.fn(),
    signDownload: vi.fn(),
    readState: vi.fn(),
    listShifts: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: session.user ? { id: "u1", ...session.user } : null }, error: null }) } }),
}));

vi.mock("@/lib/crew/queries", () => ({
  getPerson: async (email: string) => {
    if (db.down) throw new Error("crew_people read failed: connection timed out");
    return people.get(email) ?? null;
  },
  listPeople: async () => [...people.values()],
  listShifts: spies.listShifts,
  touchSeen: async () => {},
}));

vi.mock("@/lib/bot/queries", async () => {
  const { createHash } = await import("crypto");
  const threadKey = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 16);
  return {
    threadKey,
    newFilePath: (who: string, email: string, name: string) => `${who}/${threadKey(email)}/202610/a1b2c3d4e5f6-${name}`,
    signUpload: spies.signUpload,
    signDownload: spies.signDownload,
    readState: spies.readState,
    savePushSubscription: vi.fn(),
    deletePushSubscription: vi.fn(),
    listPushSubscriptions: vi.fn(async () => []),
    markPushDelivered: vi.fn(),
  };
});

vi.mock("@/lib/crew/act", () => ({ runCrewAct: spies.runCrewAct }));
vi.mock("@/lib/crew/admin", () => ({ runAdminAct: spies.runAdminAct }));
vi.mock("@/lib/crew/sync", () => ({ applyCrewSync: spies.applyCrewSync }));
vi.mock("@/lib/crew/home", () => ({ crewHome: spies.crewHome, adminHome: spies.adminHome, crewFeed: spies.crewFeed }));

import { GET as getFeed, POST as postFeed } from "../../bot/crew/route";
import { POST as postAct } from "../act/route";
import { GET as getExport } from "../admin/export/route";
import { GET as getAdmin, POST as postAdmin } from "../admin/route";
import { GET as getFile } from "../files/route";
import { GET as getMe } from "../me/route";
import { POST as postPush } from "../push/route";
import { POST as postUpload } from "../uploads/route";

function req(path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as never;
}
const bearer = { Authorization: `Bearer ${TOKEN}` };
const ID = "3f6c1a2e-0000-4000-8000-000000000001";

async function keyFor(email: string) {
  const { createHash } = await import("crypto");
  return createHash("sha256").update(email).digest("hex").slice(0, 16);
}

const asCrew = (email = ARNOLD) => (session.user = { email, app_metadata: { sw_role: "crew" } });
const asStaff = (email: string) => (session.user = { email });

beforeEach(() => {
  session.user = null;
  db.down = false;
  people.clear();
  people.set(ARNOLD, { email: ARNOLD, name: "Arnold Mujica", lang: "en", active: true, lastSeenAt: null });
  for (const fn of Object.values(spies)) fn.mockReset();
  const sections: BotSections = emptySections();
  sections.people = { [LANDO]: { name: "Lando", role: "owner" }, [ELI]: { name: "Eli", role: "requester" } };
  spies.readState.mockResolvedValue({ sections, bridge: { seenAt: null, agentSeenAt: null, reportedAt: null } });
  spies.crewHome.mockResolvedValue({ ok: true, me: { email: ARNOLD } });
  spies.adminHome.mockResolvedValue({ ok: true, people: [] });
  spies.crewFeed.mockResolvedValue({ ok: true, entries: [] });
  spies.runCrewAct.mockResolvedValue({ ok: true });
  spies.runAdminAct.mockResolvedValue({ ok: true });
  spies.applyCrewSync.mockResolvedValue({ entries: 0, questions: 0, seen: 0, shifts: 0, schedule: 0, tasks: 0, pushed: 0 });
  spies.signDownload.mockResolvedValue("https://storage.example/signed");
  spies.signUpload.mockImplementation(async (path: string) => ({ path, token: "t", signedUrl: "https://storage.example/upload" }));
  spies.listShifts.mockResolvedValue([]);
  vi.stubEnv("OPS_AGENT_TOKEN", TOKEN);
  vi.stubEnv("INTERNAL_ALLOWED_EMAILS", `${LANDO},${ELI}`);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("a crew member's door", () => {
  it("is shut to anyone who is not signed in", async () => {
    expect((await getMe()).status).toBe(401);
    expect((await postAct(req("/api/crew/act", "POST", { kind: "punch.in", jobId: "p", clientId: ID }))).status).toBe(401);
    expect((await postUpload(req("/api/crew/uploads", "POST", { name: "r.jpg", type: "image/jpeg", size: 10 }))).status).toBe(401);
    expect((await getFile(req("/api/crew/files?path=x"))).status).toBe(401);
    expect((await postPush(req("/api/crew/push", "POST", {}))).status).toBe(401);
    expect(spies.runCrewAct).not.toHaveBeenCalled();
  });

  it("opens for a person with the crew mark and an active seat", async () => {
    asCrew();
    expect((await getMe()).status).toBe(200);
    const res = await postAct(req("/api/crew/act", "POST", { kind: "punch.in", jobId: "powell", clientId: ID }));
    expect(res.status).toBe(200);
    expect(spies.runCrewAct.mock.calls[0][0]).toMatchObject({ email: ARNOLD });
    expect(spies.runCrewAct.mock.calls[0][1]).toMatchObject({ kind: "punch.in", jobId: "powell" });
  });

  it("needs both the mark and the seat, and the seat has to be active", async () => {
    session.user = { email: ARNOLD }; // a seat, no mark
    expect((await getMe()).status).toBe(401);
    asCrew("ghost@example.com"); // the mark, no seat
    expect((await getMe()).status).toBe(401);
    people.get(ARNOLD)!.active = false; // the seat was taken away
    asCrew();
    expect((await getMe()).status).toBe(401);
    expect((await postAct(req("/api/crew/act", "POST", { kind: "punch.out", clientId: ID }))).status).toBe(401);
  });

  it("is not a door for an owner, or for the agent token", async () => {
    asStaff(LANDO);
    expect((await getMe()).status).toBe(401);
    expect((await postAct(req("/api/crew/act", "POST", { kind: "punch.in", jobId: "p", clientId: ID }))).status).toBe(401);
    session.user = null;
    expect((await postAct(req("/api/crew/act", "POST", { kind: "punch.in", jobId: "p", clientId: ID }, bearer))).status).toBe(401);
    // An allowlisted address is staff even if something marked it as crew.
    people.set(LANDO, { email: LANDO, name: "Lando", lang: "en", active: true, lastSeenAt: null });
    session.user = { email: LANDO, app_metadata: { sw_role: "crew" } };
    expect((await getMe()).status).toBe(401);
    expect(spies.runCrewAct).not.toHaveBeenCalled();
  });

  it("refuses a shape it does not know, and passes a refusal through with its status", async () => {
    asCrew();
    expect((await postAct(req("/api/crew/act", "POST", { kind: "shift.edit", id: 1, end: "14:30", why: "because" }))).status).toBe(400);
    expect((await postAct(req("/api/crew/act", "POST", { kind: "punch.in" }))).status).toBe(400);
    spies.runCrewAct.mockResolvedValue({ ok: false, status: 409, error: "You are already on the clock." });
    const res = await postAct(req("/api/crew/act", "POST", { kind: "punch.in", jobId: "powell", clientId: ID }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, error: "You are already on the clock." });
  });

  it("does not leak why something broke", async () => {
    asCrew();
    spies.runCrewAct.mockRejectedValue(new Error("crew_shifts insert failed: relation does not exist"));
    const res = await postAct(req("/api/crew/act", "POST", { kind: "punch.in", jobId: "powell", clientId: ID }));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("crew_shifts");
    spies.crewHome.mockRejectedValue(new Error("crew_shifts list failed: permission denied for table crew_shifts"));
    const me = await getMe();
    expect(me.status).toBe(500);
    expect(JSON.stringify(await me.json())).not.toContain("crew_shifts");
  });

  it("answers 'try again' (503), not 'signed out' (401), when the seat cannot be looked up", async () => {
    // A 401 sends the phone to the sign-in page. A database hiccup must not do that.
    asCrew();
    db.down = true;
    expect((await getMe()).status).toBe(503);
    const res = await postAct(req("/api/crew/act", "POST", { kind: "punch.in", jobId: "powell", clientId: ID }));
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain("crew_people");
    expect(spies.runCrewAct).not.toHaveBeenCalled();
    // ...but someone who is not crew at all is still simply refused, database or no database
    asStaff(LANDO);
    expect((await getMe()).status).toBe(401);
    session.user = null;
    expect((await getMe()).status).toBe(401);
  });
});

describe("photos", () => {
  it("hands out an upload slot in the person's own folder, for photos and PDFs only", async () => {
    asCrew();
    const res = await postUpload(req("/api/crew/uploads", "POST", { name: "receipt.jpg", type: "image/jpeg", size: 300000 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.path).toBe(`u/${await keyFor(ARNOLD)}/202610/a1b2c3d4e5f6-receipt.jpg`);
    expect((await postUpload(req("/api/crew/uploads", "POST", { name: "x.html", type: "text/html", size: 10 }))).status).toBe(400);
    expect((await postUpload(req("/api/crew/uploads", "POST", { name: "big.jpg", type: "image/jpeg", size: 99_000_000 }))).status).toBe(400);
  });

  it("opens a person's own photo and nobody else's", async () => {
    asCrew();
    const mine = `u/${await keyFor(ARNOLD)}/202610/a1b2c3d4e5f6-r.jpg`;
    const res = await getFile(req(`/api/crew/files?path=${encodeURIComponent(mine)}`));
    expect(res.status).toBe(302);
    const theirs = `u/${await keyFor("beto@example.com")}/202610/a1b2c3d4e5f6-r.jpg`;
    expect((await getFile(req(`/api/crew/files?path=${encodeURIComponent(theirs)}`))).status).toBe(404);
    const botFile = `b/${await keyFor(ARNOLD)}/202610/a1b2c3d4e5f6-r.pdf`;
    expect((await getFile(req(`/api/crew/files?path=${encodeURIComponent(botFile)}`))).status).toBe(404);
    expect((await getFile(req("/api/crew/files?path=../../etc/passwd"))).status).toBe(404);
    expect(spies.signDownload).toHaveBeenCalledTimes(1);
  });
});

describe("the owners' door", () => {
  it("opens for an owner", async () => {
    asStaff(LANDO);
    expect((await getAdmin(req("/api/crew/admin?week=2026-10-05"))).status).toBe(200);
    expect(spies.adminHome).toHaveBeenCalledWith("2026-10-05");
    const res = await postAdmin(req("/api/crew/admin", "POST", { kind: "person.add", name: "Arnold Mujica", email: ARNOLD }));
    expect(res.status).toBe(200);
    expect(spies.runAdminAct.mock.calls[0][0]).toEqual({ email: LANDO, name: "Lando" });
  });

  it("is shut to crew, to staff without an owner's seat, to the agent token, and to strangers", async () => {
    const tries = async () => [
      (await getAdmin(req("/api/crew/admin"))).status,
      (await postAdmin(req("/api/crew/admin", "POST", { kind: "shift.ok", id: 1 }))).status,
      (await getExport(req("/api/crew/admin/export"))).status,
    ];
    expect(await tries()).toEqual([403, 403, 403]);
    asCrew();
    expect(await tries()).toEqual([403, 403, 403]);
    asStaff(ELI);
    expect(await tries()).toEqual([403, 403, 403]);
    session.user = null;
    expect((await getAdmin(req("/api/crew/admin", "GET", undefined, bearer))).status).toBe(403);
    expect((await postAdmin(req("/api/crew/admin", "POST", { kind: "shift.ok", id: 1 }, bearer))).status).toBe(403);
    expect(spies.runAdminAct).not.toHaveBeenCalled();
    expect(spies.adminHome).not.toHaveBeenCalled();
  });

  it("says plainly that the crew side is not switched on when its tables are not there yet", async () => {
    asStaff(LANDO);
    spies.adminHome.mockRejectedValue(new Error('crew_people list failed: relation "public.crew_people" does not exist'));
    const res = await getAdmin(req("/api/crew/admin"));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toContain("not switched on yet");
    expect(json.error).not.toContain("crew_people");
  });

  it("refuses a shape it does not know", async () => {
    asStaff(LANDO);
    expect((await postAdmin(req("/api/crew/admin", "POST", { kind: "punch.in", jobId: "p", clientId: ID }))).status).toBe(400);
    expect((await postAdmin(req("/api/crew/admin", "POST", { kind: "shift.edit", id: 1, end: "14:30" }))).status).toBe(400);
  });

  it("exports the week for payroll, and a name cannot smuggle a formula into the sheet", async () => {
    asStaff(LANDO);
    people.set("eve@example.com", { email: "eve@example.com", name: '=HYPERLINK("http://evil.example","x")', lang: "en", active: true, lastSeenAt: null });
    spies.listShifts.mockResolvedValue([
      { email: ARNOLD, day: "2026-10-05", jobName: "Powell Residence", startedAt: "2026-10-05T13:02:00Z", endedAt: "2026-10-05T21:32:00Z", breakMin: 30, source: "app", endSource: "app", review: "", note: "" },
      { email: "eve@example.com", day: "2026-10-05", jobName: "Shop, yard", startedAt: "2026-10-05T13:00:00Z", endedAt: null, breakMin: 0, source: "late", endSource: null, review: "", note: "" },
    ]);
    const res = await getExport(req("/api/crew/admin/export?from=2026-10-05&to=2026-10-11"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("saddlewood-hours-2026-10-05-to-2026-10-11.csv");
    const lines = (await res.text()).trim().split("\r\n");
    expect(lines[0]).toBe("Name,Date,Job,Clock in,Clock out,Break (min),Hours,In recorded by,Out recorded by,Needs a look,Note");
    expect(lines[1]).toBe(`"'=HYPERLINK(""http://evil.example"",""x"")",2026-10-05,"Shop, yard",6:00 AM,,,,"app, sent later",,still on the clock,`);
    expect(lines[2]).toBe("Arnold Mujica,2026-10-05,Powell Residence,6:02 AM,2:32 PM,30,8.00,app,app,,");
    expect(spies.listShifts).toHaveBeenCalledWith({ fromDay: "2026-10-05", toDay: "2026-10-11" });
  });
});

describe("the Mac's door", () => {
  it("opens for the agent token only", async () => {
    expect((await getFeed(req("/api/bot/crew"))).status).toBe(401);
    asStaff(LANDO);
    expect((await getFeed(req("/api/bot/crew"))).status).toBe(401);
    expect((await postFeed(req("/api/bot/crew", "POST", {}))).status).toBe(401);
    asCrew();
    expect((await getFeed(req("/api/bot/crew"))).status).toBe(401);
    session.user = null;
    expect((await getFeed(req("/api/bot/crew", "GET", undefined, bearer))).status).toBe(200);
    expect(spies.crewFeed).toHaveBeenCalledTimes(1);
  });

  it("tells the Mac to wait, not that the database broke, while the crew tables are not there yet", async () => {
    spies.crewFeed.mockRejectedValue(new Error("crew_people list failed: Could not find the table 'public.crew_people' in the schema cache"));
    const res = await getFeed(req("/api/bot/crew", "GET", undefined, bearer));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("migration 0011");
  });

  it("takes a report, drops what is malformed, and says how many it dropped", async () => {
    const res = await postFeed(
      req(
        "/api/bot/crew",
        "POST",
        {
          entries: [{ id: 1, status: "filed", bot: { amount: 146.61 } }, { id: "x", status: "filed" }],
          questions: [{ email: ARNOLD, body: "What was the total?", dedupe: "amount-1", kind: "amount" }, { email: ARNOLD, body: "no key" }],
          seen: [4],
        },
        bearer,
      ),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).applied.dropped).toBe(2);
    const post = spies.applyCrewSync.mock.calls[0][0];
    expect(post.entries).toHaveLength(1);
    expect(post.questions).toHaveLength(1);
    expect(post.seen).toEqual([4]);
  });
});
