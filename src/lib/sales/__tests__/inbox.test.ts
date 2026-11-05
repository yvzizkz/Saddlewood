import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LeadItem } from "@/lib/leads/types";
import type { Submission } from "@/lib/webforms/store";

// The inbox's call list is the old /internal/leads list: fresh callers, then
// the backlog; called/texted callers stay with their mark; dismissed drop out.

const { leads, bids, web } = vi.hoisted(() => ({
  web: { list: [] as Submission[] },
  leads: { fresh: [] as LeadItem[], backlog: [] as LeadItem[], generated: "2026-10-21T08:00:00-07:00" },
  bids: { list: [] as { project: string; gc: string; ageDays: number }[] },
}));

vi.mock("@/lib/leads/store", () => ({
  getLeadsState: async () => ({
    state: { generated: leads.generated, fresh_list: leads.fresh, backlog_list: leads.backlog },
    syncedAt: "2026-10-21T15:00:05Z",
  }),
}));
vi.mock("@/lib/webforms/store", () => ({ listSubmissions: async () => web.list }));
vi.mock("@/lib/bot/queries", () => ({ readState: async () => ({ sections: { bids: bids.list } }) }));

import { INBOX_MAX, loadInbox, phoneRef } from "../inbox";

function lead(phone: string, age: number, status?: LeadItem["callback_status"]): LeadItem {
  return {
    phone, display: phone, named: true, name: `Caller ${phone}`, unread: 1, last: "", last_ts: null, age_days: age,
    tags: [], opps: 0, fanout: false, tollfree: false, score: 0, snippet: "", kb: null, dial_url: "", suggested_sms: "", sms_url: "",
    callback_status: status,
  };
}

function sub(id: number, over: Partial<Submission> = {}): Submission {
  return { id, form: "contact", name: `Lead ${id}`, email: `lead${id}@x.com`, phone: "", company: "", about: "Kitchen", summary: "", status: "new", createdAt: new Date().toISOString(), ...over };
}

beforeEach(() => {
  web.list = [];
  leads.fresh = [];
  leads.backlog = [];
  bids.list = [];
});

describe("loadInbox", () => {
  it("lists fresh callers and the backlog, carries called/texted, drops dismissed and tracked", async () => {
    leads.fresh = [lead("6025550001", 0), lead("6025550002", 1, "called"), lead("6025550003", 2, "dismissed")];
    leads.backlog = [lead("6025550004", 20, "texted"), lead("6025550005", 30), lead("6025550001", 40)];
    const { items, syncedAt } = await loadInbox(new Set([phoneRef("6025550005")]));
    expect(items.map((i) => [i.phone, i.status ?? null])).toEqual([
      ["6025550001", null],
      ["6025550002", "called"],
      ["6025550004", "texted"],
    ]);
    expect(syncedAt).toBe("2026-10-21T08:00:00-07:00");
  });

  it("caps the list and keeps the newest first", async () => {
    leads.backlog = Array.from({ length: INBOX_MAX + 10 }, (_, n) => lead(`60255510${String(n).padStart(2, "0")}`, 100 - n));
    bids.list = [{ project: "Franklin Hall", gc: "Haydon", ageDays: 3 }];
    const { items } = await loadInbox(new Set());
    expect(items).toHaveLength(INBOX_MAX);
    expect(items[0].from).toBe("bid");
    expect(items.every((i, n) => n === 0 || items[n - 1].ageDays <= i.ageDays)).toBe(true);
  });

  it("shows a website lead with no phone, by its email", async () => {
    web.list = [sub(1)];
    const { items } = await loadInbox(new Set());
    expect(items[0]).toMatchObject({ ref: "email:lead1@x.com", from: "web", who: "Lead 1", webId: 1, detail: "Website · Kitchen", ageDays: 0 });
    expect(items[0].phone).toBeUndefined();
  });

  it("two website leads with no phone stay two people", async () => {
    web.list = [sub(2), sub(1)];
    expect((await loadInbox(new Set())).items.map((i) => i.webId)).toEqual([2, 1]);
  });

  it("a website lead outlives the Mac's next sync", async () => {
    web.list = [sub(1, { createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString() })];
    leads.generated = new Date().toISOString();
    expect((await loadInbox(new Set())).items[0]).toMatchObject({ webId: 1, ageDays: 2 });
  });

  it("wins over the same phone on the call list, and the newest submission speaks for the person", async () => {
    web.list = [sub(2, { phone: "(602) 555-0001", status: "called" }), sub(1, { phone: "6025550001" })];
    leads.fresh = [lead("6025550001", 0)];
    const { items } = await loadInbox(new Set());
    expect(items.map((i) => [i.webId, i.status])).toEqual([[2, "called"]]);
  });

  it("dismissing one hides their older submissions and their call-list row", async () => {
    web.list = [sub(2, { phone: "6025550001", status: "dismissed" }), sub(1, { phone: "6025550001" })];
    leads.fresh = [lead("6025550001", 0)];
    expect((await loadInbox(new Set())).items).toEqual([]);
  });

  it("drops a tracked website lead", async () => {
    web.list = [sub(1, { phone: "6025550001" })];
    expect((await loadInbox(new Set([phoneRef("6025550001")]))).items).toEqual([]);
  });

  it("marks a builder's bid request with the company", async () => {
    web.list = [sub(1, { name: "Dan", company: "Haydon" })];
    expect((await loadInbox(new Set())).items[0]).toMatchObject({ title: "Haydon", who: "Dan", company: "Haydon" });
  });
});
