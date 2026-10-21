import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LeadItem } from "@/lib/leads/types";

// The inbox's call list is the old /internal/leads list: fresh callers, then
// the backlog; called/texted callers stay with their mark; dismissed drop out.

const { leads, bids } = vi.hoisted(() => ({
  leads: { fresh: [] as LeadItem[], backlog: [] as LeadItem[], generated: "2026-10-21T08:00:00-07:00" },
  bids: { list: [] as { project: string; gc: string; ageDays: number }[] },
}));

vi.mock("@/lib/leads/store", () => ({
  getLeadsState: async () => ({
    state: { generated: leads.generated, fresh_list: leads.fresh, backlog_list: leads.backlog },
    syncedAt: "2026-10-21T15:00:05Z",
  }),
}));
vi.mock("@/lib/bot/queries", () => ({ readState: async () => ({ sections: { bids: bids.list } }) }));

import { INBOX_MAX, loadInbox, phoneRef } from "../inbox";

function lead(phone: string, age: number, status?: LeadItem["callback_status"]): LeadItem {
  return {
    phone, display: phone, named: true, name: `Caller ${phone}`, unread: 1, last: "", last_ts: null, age_days: age,
    tags: [], opps: 0, fanout: false, tollfree: false, score: 0, snippet: "", kb: null, dial_url: "", suggested_sms: "", sms_url: "",
    callback_status: status,
  };
}

beforeEach(() => {
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
});
