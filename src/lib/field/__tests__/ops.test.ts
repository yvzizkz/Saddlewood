import { describe, expect, it } from "vitest";

import {
  buildNormalizedReceiptPurchase,
  defaultChecklistItems,
  extractEodWorkItems,
} from "../ops";

describe("field operations helpers", () => {
  it("provides SOP-009 pre-cover checklist items with photo requirements for each stage", () => {
    const preCover = defaultChecklistItems("pre_cover");
    expect(preCover.length).toBeGreaterThanOrEqual(4);
    expect(preCover.some((i) => i.key === "both_faces_photo")).toBe(true);

    const prePaint = defaultChecklistItems("pre_paint");
    expect(prePaint.some((i) => i.label.includes("500W raking light"))).toBe(true);
  });

  it("normalizes a company-card field receipt into a purchases row without a reimbursement bill", () => {
    const res = buildNormalizedReceiptPurchase({
      entryId: 42,
      day: "2026-10-20",
      jobId: "9146-w-hutton-dr",
      jobName: "9146 W Hutton Dr",
      billingJobId: "20000000-0000-0000-0000-000000000001",
      vendor: "Home Depot",
      amountDollars: 84.5,
      paidBy: "company",
      note: "90-minute hot mud + mesh tape",
      trade: "drywall",
      personName: "Jorge",
      personEmail: "jorge@saddlewood.crew",
    });

    expect(res.purchaseRow.source).toBe("app");
    expect(res.purchaseRow.source_key).toBe("app:entry:42");
    expect(res.purchaseRow.line_total_cents).toBe(8450);
    expect(res.purchaseRow.trade).toBe("drywall");
    expect(res.purchaseRow.class).toBe("COMPANY CARD");
    expect(res.reimbursementBill).toBeNull();
  });

  it("normalizes an out-of-pocket ('me') field receipt into both purchases and a reimbursement bill", () => {
    const res = buildNormalizedReceiptPurchase({
      entryId: 99,
      day: "2026-10-20",
      jobId: "9146-w-hutton-dr",
      jobName: "9146 W Hutton Dr",
      billingJobId: "20000000-0000-0000-0000-000000000001",
      vendor: "Westside Building Material",
      amountDollars: 64.25,
      paidBy: "me",
      note: "2 boxes of 093V vinyl control joint",
      trade: "drywall",
      personName: "Carlos",
      personEmail: "carlos@saddlewood.crew",
    });

    expect(res.purchaseRow.class).toBe("REIMBURSEMENT");
    expect(res.reimbursementBill).not.toBeNull();
    expect(res.reimbursementBill?.kind).toBe("reimbursement");
    expect(res.reimbursementBill?.amount_cents).toBe(6425);
    expect(res.reimbursementBill?.due_on).toBe("2026-10-23");
    expect(res.reimbursementBill?.purchase_trip_key).toBe("app:entry:99");
  });

  it("extracts CO awaiting price and owner ASK decision items from EOD daily logs", () => {
    const items = extractEodWorkItems({
      entryId: 77,
      day: "2026-10-20",
      jobId: "9146-w-hutton-dr",
      jobName: "9146 W Hutton Dr",
      billingJobId: "20000000-0000-0000-0000-000000000001",
      done: "Hung 38 sheets of 5/8 Type X.\nASK: Should we fur out the north niche 1.5in for flush tile?",
      asked: "GC superintendent asked to add sound attenuation batts in powder room wall.",
      decision: "",
      stuck: "",
      createdBy: "jorge@saddlewood.crew",
    });

    expect(items).toHaveLength(2);
    const co = items.find((i) => i.kind === "co_price");
    const dec = items.find((i) => i.kind === "decision");
    expect(co?.role).toBe("sales");
    expect(co?.title).toContain("CO awaiting price");
    expect(dec?.role).toBe("decisions");
    expect(dec?.title).toContain("Should we fur out the north niche 1.5in for flush tile?");
  });
});
