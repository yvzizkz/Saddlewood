import { describe, expect, it } from "vitest";

import { approvalBlock } from "@/lib/billing/coApprove";
import { CO_STATUS } from "@/lib/billing/registers";

import { cleanSections, clientDocuments, clientLogText, clientMoney, clientPeople, clientTimeline, withApprovals, type PortalDoc, type PortalDocRow } from "../rules";

const row = (over: Partial<PortalDocRow>): PortalDocRow => ({
  id: "a",
  kind: "invoice",
  number: "8009-01",
  title: "Draw 1",
  status: "issued",
  total_cents: "12500",
  token: "t",
  issued_at: "2026-10-01T15:00:00Z",
  supersedes: null,
  ...over,
});

describe("clientDocuments", () => {
  it("keeps what was issued, as numbers, newest first", () => {
    const docs = clientDocuments([row({ id: "old" }), row({ id: "new", kind: "change_order", issued_at: "2026-10-02T15:00:00Z" })]);
    expect(docs.map((d) => d.id)).toEqual(["new", "old"]);
    expect(docs[1].totalCents).toBe(12500);
  });

  it("never shows a draft, a void, or one with no link", () => {
    expect(clientDocuments([row({ status: "draft" }), row({ status: "void" }), row({ token: null }), row({ issued_at: null })])).toEqual([]);
  });

  it("drops a revision a newer issued one replaced, but not for a newer draft or void", () => {
    const shown = (s: string) => clientDocuments([row({ id: "v1" }), row({ id: "v2", supersedes: "v1", status: s })]).map((d) => d.id);
    expect(shown("issued")).toEqual(["v2"]);
    expect(shown("draft")).toEqual(["v1"]);
    expect(shown("void")).toEqual(["v1"]);
  });

  it("keeps statements and notices off the list", () => {
    expect(clientDocuments([row({ kind: "statement" }), row({ kind: "notice" })])).toEqual([]);
  });
});

describe("withApprovals", () => {
  const doc = (id: string, kind: PortalDoc["kind"] = "change_order"): PortalDoc => ({ id, kind, number: id, title: "", totalCents: 100, token: "t", issuedAt: "2026-10-01T15:00:00Z" });
  const one = (status?: string) => withApprovals([doc("co")], new Map(status ? [["co", status]] : []));

  it("takes a rejected or voided change order off the list, though its document is still issued", () => {
    expect(one("rejected")).toEqual([]);
    expect(one("void")).toEqual([]);
  });

  it("marks what's waiting on the client and what they approved", () => {
    expect(one("sent")[0].approval).toBe("needed");
    expect(one("signed")[0].approval).toBe("approved");
    expect(one("billed")[0].approval).toBe("approved");
  });

  it("keeps a change order with no register row, with no badge", () => {
    expect(one()[0].approval).toBeNull();
  });

  it("leaves other documents alone, whatever a stray status says", () => {
    expect(withApprovals([doc("inv", "invoice")], new Map([["inv", "void"]]))[0].approval).toBeNull();
  });

  it("says needed exactly when the document's link still takes an approval", () => {
    for (const status of CO_STATUS) {
      const canApprove = approvalBlock({ status: "issued" }, { status }) === null;
      expect(one(status)[0]?.approval === "needed", status).toBe(canApprove);
    }
  });
});

describe("clientMoney", () => {
  const m = { contractCents: 100_000, billedCents: 0, paidCents: 0, owedCents: 0 };

  it("shows nothing with nothing billed or paid here, contract or not: Joist's money isn't in the app", () => {
    expect(clientMoney(m)).toBeNull();
    expect(clientMoney({ ...m, contractCents: null })).toBeNull();
  });

  it("gives the totals once there's money here", () => {
    expect(clientMoney({ ...m, billedCents: 40_000, paidCents: 10_000, owedCents: 30_000 })).toEqual({ contractCents: 100_000, billedCents: 40_000, paidCents: 10_000, openCents: 30_000 });
    expect(clientMoney({ ...m, contractCents: null, paidCents: 5 })?.contractCents).toBeNull();
  });
});

describe("clientTimeline", () => {
  const row = (over = {}) => ({ name: "Framing", planned_from: null, planned_to: null, verified_at: null, ...over });

  it("is nothing without a date anywhere", () => {
    expect(clientTimeline([], null)).toBeNull();
    expect(clientTimeline([row()], null)).toBeNull();
  });

  it("takes a promised day, a planned date or a done phase as an answer", () => {
    expect(clientTimeline([], "2026-12-01")).toEqual({ promised: "2026-12-01", phases: [] });
    expect(clientTimeline([row({ planned_to: "2026-12-01" }), row({ name: "Paint" })], null)?.phases.map((p) => p.name)).toEqual(["Framing", "Paint"]);
    expect(clientTimeline([row({ verified_at: "2026-11-01T15:00:00Z" })], null)?.phases[0].done).toBe(true);
  });

  it("carries only names and dates", () => {
    const [p] = clientTimeline([row({ planned_from: "2026-11-01", note: "failed once", verified_by: "eli@x" })], null)!.phases;
    expect(Object.keys(p).sort()).toEqual(["done", "from", "name", "to"]);
  });
});

describe("clientPeople", () => {
  it("drops an email standing in for a name", () => {
    expect(clientPeople(["Eli Ramirez", "pm@saddlewoodcontracting.com"])).toEqual(["Eli Ramirez"]);
  });
});

describe("clientLogText", () => {
  it("takes out the ASK: lines the crew write to the office", () => {
    expect(clientLogText("Hung the north wall.\nASK: who pays for the extra board?\n  ask: call Eli\nTaped the hall.")).toBe("Hung the north wall.\nTaped the hall.");
  });

  it("leaves a word that only starts the same", () => {
    expect(clientLogText("Asked the inspector to come back: Friday.")).toBe("Asked the inspector to come back: Friday.");
  });

  it("is empty when nothing else was written", () => {
    expect(clientLogText("ASK: anything")).toBe("");
  });
});

describe("cleanSections", () => {
  it("keeps known sections once, in order", () => {
    expect(cleanSections(["complaint", "pay", "documents", "complaint"])).toEqual(["documents", "complaint"]);
  });
});
