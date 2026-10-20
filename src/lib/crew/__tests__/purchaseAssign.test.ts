import { beforeEach, describe, expect, it, vi } from "vitest";

// "Which job is this?" as an act (purchase.assign, 0022): who may answer, what
// an answer does (the alias is kept, every line with that name is re-pointed),
// and that "ignore" stays with the owners. The purchase tables are stood in
// for; the rest of the crew tables are not touched by this act.

const ELI = "eli@example.com";

const { db } = vi.hoisted(() => ({
  db: {
    jobs: new Map<string, { id: string; name: string; active: boolean }>(),
    jobPeople: [] as { jobId: string; email: string; role: string }[],
    aliases: new Map<string, { jobId: string | null; by: string }>(),
    relinked: [] as { key: string; jobId: string | null }[],
  },
}));

vi.mock("../queries", () => ({
  getJob: async (id: string) => db.jobs.get(id) ?? null,
  listJobs: async () => [...db.jobs.values()],
  listJobPeople: async (f: { email?: string } = {}) => db.jobPeople.filter((a) => !f.email || a.email === f.email),
}));

vi.mock("../purchaseQueries", () => ({
  upsertAlias: async (alias: string, jobId: string | null, by: string) => void db.aliases.set(alias, { jobId, by }),
  relinkPurchases: async (key: string, jobId: string | null) => {
    db.relinked.push({ key, jobId });
    return key === "pt loma" ? 41 : 1;
  },
}));

vi.mock("../notify", () => ({ notifyOwners: async () => {}, notifySupervisors: async () => {}, notifyCrew: async () => {} }));
vi.mock("../geocode", () => ({ geocodeAddress: async () => null }));
vi.mock("@/lib/bot/queries", () => ({ threadKey: () => "0123456789abcdef" }));
vi.mock("@/lib/auth/magicLink", () => ({ LINK_HOURS: 24, generateSignInLink: async () => ({}), sendEmail: async () => ({}), SITE_URL: "https://saddlewoodcontracting.com" }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({}) }));

import { runAdminAct } from "../admin";
import { ACT_NEEDS, mayRun } from "../auth";
import { adminActSchema, type AdminActInput } from "../types";

const OWNER = { role: "owner" as const, email: "lando@saddlewoodcontracting.com", name: "Lando", perms: [] as string[] };
const PM = { role: "member" as const, email: ELI, name: "Eli Lugo", perms: ["crew.view", "projects.view", "projects.mine", "money.view"] };
const NOW = new Date("2026-10-19T16:00:00Z");

const act = (who: typeof OWNER | typeof PM, input: AdminActInput) => runAdminAct(who, adminActSchema.parse(input), NOW);

beforeEach(() => {
  db.jobs.clear();
  db.jobs.set("point-loma", { id: "point-loma", name: "Point Loma", active: true });
  db.jobs.set("gainey", { id: "gainey", name: "7425 E Gainey Ranch", active: true });
  db.jobPeople = [{ jobId: "point-loma", email: ELI, role: "pm" }];
  db.aliases.clear();
  db.relinked = [];
});

describe("purchase.assign", () => {
  it("is money.view: owners, and a member whose group sees money", () => {
    expect(ACT_NEEDS["purchase.assign"]).toBe("money.view");
    expect(mayRun({ role: "owner", email: OWNER.email, name: "Lando", perms: [] }, "purchase.assign")).toBe(true);
    expect(mayRun({ ...PM, perms: ["crew.view", "money.view"] }, "purchase.assign")).toBe(true);
    expect(mayRun({ ...PM, perms: ["crew.view", "projects.view"] }, "purchase.assign")).toBe(false);
  });

  it("keeps the alias and re-points every line typed under that name", async () => {
    const res = await act(OWNER, { kind: "purchase.assign", alias: "pt loma", jobId: "point-loma" });
    expect(res).toMatchObject({ ok: true, linked: 41, note: '"pt loma" is Point Loma: 41 lines filed.' });
    expect(db.aliases.get("pt loma")).toEqual({ jobId: "point-loma", by: "Lando" });
    expect(db.relinked).toEqual([{ key: "pt loma", jobId: "point-loma" }]);
  });

  it("normalizes a raw name to the same key, and refuses an empty one or a job not on the list", async () => {
    await act(OWNER, { kind: "purchase.assign", alias: "  PT   LOMA, ", jobId: "point-loma" });
    expect(db.relinked).toEqual([{ key: "pt loma", jobId: "point-loma" }]);
    expect(await act(OWNER, { kind: "purchase.assign", alias: "---", jobId: "point-loma" })).toMatchObject({ ok: false, status: 400 });
    expect(await act(OWNER, { kind: "purchase.assign", alias: "pt loma", jobId: "nope" })).toMatchObject({ ok: false, status: 404 });
    expect(db.aliases.size).toBe(1);
  });

  it("lets an owner set a name aside: no job, every line marked ignored", async () => {
    const res = await act(OWNER, { kind: "purchase.assign", alias: "jury steel studs quote 1900982", jobId: null });
    expect(res).toMatchObject({ ok: true, linked: 1, note: '"jury steel studs quote 1900982" set aside: 1 line ignored.' });
    expect(db.aliases.get("jury steel studs quote 1900982")).toEqual({ jobId: null, by: "Lando" });
    expect(db.relinked).toEqual([{ key: "jury steel studs quote 1900982", jobId: null }]);
  });

  it("lets the project manager answer for a job of his, never another's, and never set a name aside", async () => {
    expect(await act(PM, { kind: "purchase.assign", alias: "pt loma", jobId: "point-loma" })).toMatchObject({ ok: true, linked: 41 });
    expect(db.aliases.get("pt loma")).toEqual({ jobId: "point-loma", by: "Eli Lugo" });
    expect(await act(PM, { kind: "purchase.assign", alias: "gainey 45", jobId: "gainey" })).toMatchObject({ ok: false, status: 403 });
    expect(await act(PM, { kind: "purchase.assign", alias: "jury steel studs quote 1900982", jobId: null })).toMatchObject({ ok: false, status: 403 });
    expect(db.relinked).toEqual([{ key: "pt loma", jobId: "point-loma" }]);
  });
});
