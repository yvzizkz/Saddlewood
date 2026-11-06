import { beforeEach, describe, expect, it, vi } from "vitest";

const listExhibits = vi.fn();
vi.mock("../exhibits", () => ({ listExhibits: (...a: unknown[]) => listExhibits(...a) }));

type Waiver = { id: number; status: string };
let waivers: Waiver[] = [];
let client: { name: string; billing: unknown } | null = null;
const writes: { op: string; row: unknown }[] = [];
function table() {
  const q = {
    select: () => q,
    eq: () => q,
    neq: () => q,
    maybeSingle: async () => ({ data: client, error: null }),
    then: (done: (r: unknown) => unknown) => done({ data: waivers, error: null }),
    insert: async (row: unknown) => (writes.push({ op: "insert", row }), { error: null }),
    update: (row: unknown) => ({ eq: async (_k: string, id: number) => (writes.push({ op: "update", row: { ...(row as object), id } }), { error: null }) }),
  };
  return q;
}
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from: table }) }));

import type { BillingDocument } from "../types";
import { apGap, loadPackage, noteWaiversSent, packageGap, packageItems, type PackageDoc } from "../package";

const doc = (number: string, labels: string[] = [], kind = "invoice"): PackageDoc => ({ id: `id-${number}`, number, kind, exhibits: labels.map((label) => ({ label })) });
const missing = (items: ReturnType<typeof packageItems>) => items.flatMap((i) => i.missing.map((d) => `${i.label}: ${d.number}`));

describe("packageItems", () => {
  it("wants a waiver on each bill, read off the labels the Mac and the owners really use", () => {
    expect(missing(packageItems(["conditional_waiver"], [doc("8009-13", ["Conditional waiver 8009-13"]), doc("8009-14", ["View waiver"]), doc("8009-15", ["Signed conditional waiver"])]))).toEqual([]);
    expect(missing(packageItems(["conditional_waiver"], [doc("8009-13", ["Conditional waiver 8009-13"]), doc("8009-14", ["Invoice 8009-14 (PDF)"])]))).toEqual(["Conditional waiver: 8009-14"]);
  });

  it("wants anything else once per email", () => {
    const docs = [doc("3526-11", ["Progress Payment Tracker #3526-11 (Excel)"]), doc("3526-12")];
    expect(missing(packageItems(["tracker_workbook"], docs))).toEqual([]);
    expect(missing(packageItems(["tracker_workbook", "w9", "insurance_certificate", "schedule_of_values"], [doc("1", ["W9 2026", "SOV", "COI"])]))).toEqual(["Tracker workbook: 1"]);
    expect(missing(packageItems(["w9"], [doc("1"), doc("2")]))).toEqual(["W-9: 1"]);
  });

  it("asks nothing of a change order on its own, and a change order beside a bill needs no waiver", () => {
    expect(packageItems(["conditional_waiver"], [doc("8009-CO7", [], "change_order")])).toEqual([]);
    expect(missing(packageItems(["conditional_waiver"], [doc("8009-CO7", [], "change_order"), doc("8009-13", ["View waiver"])]))).toEqual([]);
  });

  it("asks for one waiver from a client with both on their list", () => {
    expect(packageItems(["conditional_waiver", "final_waiver"], [doc("1")]).map((i) => i.label)).toEqual(["Conditional waiver"]);
    expect(packageItems(["final_waiver"], [doc("1")]).map((i) => i.label)).toEqual(["Final waiver"]);
  });
});

describe("packageGap", () => {
  it("names each thing, or says nothing when it's whole", () => {
    expect(packageGap(packageItems(["conditional_waiver", "w9"], [doc("1"), doc("2")]))).toBe("Still needed before this goes: Conditional waiver for 1, Conditional waiver for 2, W-9 for 1");
    expect(packageGap(packageItems(["w9"], [doc("1", ["W-9"])]))).toBeNull();
    expect(packageGap([])).toBeNull();
  });
});

describe("apGap", () => {
  it("wants their AP on the email, To or Cc, and asks nothing of a client with none on file", () => {
    expect(apGap(["ap@aft.test"], ["super@aft.test"])).toBe("Their accounts payable has to be on this: ap@aft.test");
    expect(apGap(["ap@aft.test", "ap2@aft.test"], ["super@aft.test", " AP2@aft.test "])).toBeNull();
    expect(apGap([], ["owner@home.test"])).toBeNull();
  });
});

const bill = (over: Partial<BillingDocument> = {}) => ({ id: "d1", number: "8009-13", kind: "invoice", clientId: "c1", totalCents: 120000, ...over }) as BillingDocument;

describe("what's read and written", () => {
  beforeEach(() => {
    waivers = [];
    writes.length = 0;
    client = { name: "AFT", billing: { attachments: ["conditional_waiver"] } };
    listExhibits.mockReset().mockResolvedValue([{ label: "Conditional waiver 8009-13" }]);
  });

  it("loadPackage reads the bill's client and its page; a client with no list owes nothing", async () => {
    expect((await loadPackage([bill()]))[0].missing).toEqual([]);
    listExhibits.mockResolvedValue([]);
    expect((await loadPackage([bill()]))[0].missing).toEqual([{ id: "d1", number: "8009-13" }]);
    client = { name: "Powell", billing: {} };
    expect(await loadPackage([bill()])).toEqual([]);
    expect(await loadPackage([bill({ clientId: null as never })])).toEqual([]);
    expect(await loadPackage([])).toEqual([]);
  });

  it("noteWaiversSent adds the waiver that went, as sent", async () => {
    await noteWaiversSent([bill()], "lando@x.com");
    expect(writes).toEqual([{ op: "insert", row: { direction: "out", kind: "conditional_progress", document_id: "d1", party: "AFT", amount_cents: 120000, status: "sent", created_by: "lando@x.com" } }]);
  });

  it("registers a final waiver as final, even for a client who wants conditionals", async () => {
    listExhibits.mockResolvedValue([{ label: "Final waiver 8009-20" }]);
    await noteWaiversSent([bill()], "x");
    expect(writes[0].row).toMatchObject({ kind: "conditional_final" });
  });

  it("moves one that was prepared, and leaves one that already went", async () => {
    waivers = [{ id: 7, status: "prepared" }];
    await noteWaiversSent([bill()], "x");
    expect(writes).toEqual([{ op: "update", row: { status: "sent", id: 7 } }]);
    writes.length = 0;
    waivers = [{ id: 7, status: "received" }];
    await noteWaiversSent([bill()], "x");
    expect(writes).toEqual([]);
  });

  it("writes nothing with no waiver on the page, none on the client's list, or no bill", async () => {
    listExhibits.mockResolvedValue([{ label: "Invoice 8009-13 (PDF)" }]);
    await noteWaiversSent([bill()], "x");
    listExhibits.mockResolvedValue([{ label: "View waiver" }]);
    client = { name: "Powell", billing: { attachments: ["tracker_workbook"] } };
    await noteWaiversSent([bill()], "x");
    await noteWaiversSent([bill({ kind: "change_order" })], "x");
    expect(writes).toEqual([]);
  });
});
