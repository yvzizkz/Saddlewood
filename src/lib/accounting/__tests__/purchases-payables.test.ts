import { describe, expect, it } from "vitest";

import { drill, type DrillSpec } from "@/lib/analytics/drill";
import { resolvePeriod } from "@/lib/analytics/period";
import { nextFridayDay, type PayableRow } from "../payables";
import type { PurchaseItemRow } from "../purchases";
import { DEFAULT_TRADES, resolveTrade, tradeSlug } from "../trades";

describe("trades resolution for purchases and payables", () => {
  it("normalizes trade labels and slugs consistently", () => {
    expect(tradeSlug("Finish Carpentry")).toBe("finish-carpentry");
    expect(resolveTrade("Finish Carpentry", DEFAULT_TRADES)).toEqual({
      key: "finish-carpentry",
      label: "Finish carpentry",
    });
    expect(resolveTrade("framing", DEFAULT_TRADES)).toEqual({
      key: "framing",
      label: "Framing",
    });
  });
});

describe("nextFridayDay pay-run cutoff", () => {
  it("computes the upcoming Friday or same day on Friday", () => {
    // 2026-10-20 is Tuesday -> Friday is 2026-10-23
    expect(nextFridayDay("2026-10-20")).toBe("2026-10-23");
    // 2026-10-23 is Friday -> same day
    expect(nextFridayDay("2026-10-23")).toBe("2026-10-23");
    // 2026-10-24 is Saturday -> next Friday is 2026-10-30
    expect(nextFridayDay("2026-10-24")).toBe("2026-10-30");
  });
});

describe("purchases and payables drill-down", () => {
  const period = resolvePeriod({ p: "wtd" }, "2026-10-20");

  it("drills purchases by trade, project, vendor and store", () => {
    const sample: PurchaseItemRow[] = [
      {
        id: "hd:1",
        sourceKey: "hd:1",
        tripKey: "hd",
        source: "hd",
        purchasedOn: "2026-10-20",
        vendor: "Home Depot",
        store: "Scottsdale #0404",
        orderRef: "PO-9146",
        jobId: "9146-w-hutton-dr",
        rawJobId: "9146-w-hutton-dr",
        billingJobId: null,
        job: "9146 W Hutton Dr (Bellevue AC938)",
        jobNameRaw: "BELLEVUE AC938",
        jobKey: "bellevue ac938",
        trade: "framing",
        tradeLabel: "Framing",
        tradeManual: false,
        department: "LUMBER",
        class: "METAL STUDS",
        sku: "100284910",
        description: "Metal Stud",
        qty: 100,
        unitCents: 1240,
        lineTotalCents: 124000,
        runner: "Omar Pena",
        ignored: false,
      },
      {
        id: "sw:1",
        sourceKey: "sw:1",
        tripKey: "sw",
        source: "vendor",
        purchasedOn: "2026-10-19",
        vendor: "Sherwin-Williams",
        store: "Tempe #7214",
        orderRef: "SW-3526",
        jobId: "3526-emerson-street",
        rawJobId: "3526-emerson-street",
        billingJobId: null,
        job: "3526 Emerson Street (Powell)",
        jobNameRaw: "3526 EMERSON",
        jobKey: "3526 emerson",
        trade: "paint",
        tradeLabel: "Paint",
        tradeManual: true,
        department: "PAINT",
        class: "COATINGS",
        sku: "SW-6106",
        description: "SuperPaint Satin",
        qty: 5,
        unitCents: 19800,
        lineTotalCents: 99000,
        runner: "Jesus Mendoza",
        ignored: false,
      },
    ];

    const spec: DrillSpec<PurchaseItemRow> = {
      path: "/app/accounting/purchases",
      title: "Purchases",
      dims: [
        { key: "trade", label: "Trade", plural: "trades", of: (r) => ({ key: r.trade, label: r.tradeLabel }), trades: true },
        { key: "job", label: "Project", plural: "projects", of: (r) => ({ key: r.jobId, label: r.job }) },
      ],
      value: (r) => r.lineTotalCents,
      dayOf: (r) => r.purchasedOn,
    };

    const all = drill(spec, sample, period, { p: "wtd" });
    expect(all.total).toBe(223000);
    expect(all.breakdown.slices.map((s) => s.key)).toEqual(["framing", "paint"]);

    const narrowed = drill(spec, sample, period, { p: "wtd", trade: "framing" });
    expect(narrowed.total).toBe(124000);
    expect(narrowed.rows).toHaveLength(1);
    expect(narrowed.breakdown.dim.key).toBe("job");
  });

  it("drills payables by vendor, project, trade and aging", () => {
    const bills: PayableRow[] = [
      {
        id: "b1",
        billNumber: "CACTUS-104",
        vendorName: "Cactus State Stucco LLC",
        vendorKind: "sub",
        subId: "sub-1",
        jobId: "8009-n-ironwood-dr",
        rawCrewJobId: "8009-n-ironwood-dr",
        billingJobId: null,
        job: "8009 N Ironwood Dr (Jury AFT 123)",
        trade: "drywall",
        tradeLabel: "Drywall",
        issuedOn: "2026-10-19",
        dueOn: "2026-10-23",
        amountCents: 840000,
        retainageCents: 84000,
        paidCents: 0,
        balanceCents: 840000,
        status: "hold_waiver",
        statusLabel: "Hold · Missing waiver",
        isOnHold: true,
        holdReason: "Missing Conditional Progress Waiver",
        waiverStatus: "missing",
        waiverLabel: "Waiver missing",
        paymentTerms: "friday_run",
        paymentTermsLabel: "Friday Melio/ACH run",
        purchaseTripKey: null,
        bidPackageId: null,
        description: "Exterior lath draw #1",
        notes: null,
        agingBucket: "Current (not yet due)",
        daysPastDue: 0,
        dueByFriday: true,
        coiStatus: "valid",
        coiExpiresAt: "2027-03-15",
        w9OnFile: true,
      },
    ];

    const spec: DrillSpec<PayableRow> = {
      path: "/app/accounting/payables",
      title: "Payables",
      dims: [
        { key: "vendor", label: "Vendor / Sub", plural: "vendors", of: (r) => ({ key: r.vendorName, label: r.vendorName }) },
        { key: "job", label: "Project", plural: "projects", of: (r) => ({ key: r.jobId, label: r.job }) },
      ],
      value: (r) => r.balanceCents,
      dayOf: (r) => r.issuedOn,
    };

    const res = drill(spec, bills, period, { p: "wtd" });
    expect(res.total).toBe(840000);
    expect(res.breakdown.slices[0]?.label).toBe("Cactus State Stucco LLC");
  });
});
