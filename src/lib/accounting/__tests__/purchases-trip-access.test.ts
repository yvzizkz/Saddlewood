import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { moneySeatForPageMock, loadPurchaseTripMock, notFoundMock, redirectMock } = vi.hoisted(() => ({
  moneySeatForPageMock: vi.fn(),
  loadPurchaseTripMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirectMock: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
}));
vi.mock("@/lib/accounting/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/accounting/access")>();
  return {
    ...actual,
    moneySeatForPage: moneySeatForPageMock,
  };
});
vi.mock("@/lib/accounting/purchases", () => ({
  loadPurchaseTrip: loadPurchaseTripMock,
}));
vi.mock("@/components/accounting/AccountingFrame", () => ({
  default: ({ title, children }: { title: string; children: ReactNode }) =>
    createElement("div", { "data-testid": "accounting-frame", "data-title": title }, children),
}));
vi.mock("@/app/(portal)/app/accounting/purchases/PurchaseActions", () => ({
  TripJobAndTradeControl: () => createElement("div", { "data-testid": "trip-job-trade-control" }),
  LineTradeSelector: () => createElement("div", { "data-testid": "line-trade-selector" }),
}));

import PurchaseTripPage from "@/app/(portal)/app/accounting/purchases/trip/[key]/page";

const SAMPLE_TRIP = {
  tripKey: "app:entry:42",
  purchasedOn: "2026-10-20",
  vendor: "Home Depot",
  store: "Field Receipt (App)",
  orderRef: "REC-42",
  jobName: "9146 W Hutton Dr",
  jobKey: "9146-w-hutton-dr",
  jobId: "9146-w-hutton-dr",
  rawJobId: "9146-w-hutton-dr",
  totalCents: 8450,
  trades: [{ trade: "drywall", label: "Drywall", cents: 8450 }],
  lines: [
    {
      id: 1,
      lineNo: 0,
      sku: "FIELD-REC",
      description: "90-minute hot mud + mesh tape",
      department: "FIELD RECEIPT",
      className: "COMPANY CARD",
      qty: 1,
      unitCents: 8450,
      totalCents: 8450,
      trade: "drywall" as const,
      tradeLabel: "Drywall",
      tradeManual: true,
    },
  ],
  jobs: [{ id: "9146-w-hutton-dr", name: "9146 W Hutton Dr", key: "9146-w-hutton-dr" }],
  linkedBill: {
    id: 77,
    billNumber: "REIMB-ENTRY-42",
    status: "needs_approval",
    amountCents: 8450,
    dueOn: "2026-10-23",
  },
};

describe("PurchaseTripPage PM and owner access (T46)", () => {
  it("allows a PM to open a trip on their own job without edit controls or AP bill link, and 404s on another job", async () => {
    loadPurchaseTripMock.mockResolvedValue(SAMPLE_TRIP);

    // PM on their own job (9146-w-hutton-dr)
    moneySeatForPageMock.mockResolvedValue({
      email: "eli@saddlewoodcontracting.com",
      owner: false,
      crewJobs: ["9146-w-hutton-dr"],
      billingJobs: ["20000000-0000-0000-0000-000000000001"],
      laborCost: false,
      margin: false,
      sections: ["overview", "job-costing", "purchases"],
    });

    const el = await PurchaseTripPage({ params: Promise.resolve({ key: "app:entry:42" }) });
    const html = renderToStaticMarkup(el);
    expect(html).toContain("90-minute hot mud + mesh tape");
    expect(html).not.toContain("trip-job-trade-control");
    expect(html).not.toContain("line-trade-selector");
    expect(html).not.toContain("/app/accounting/payables");

    // PM on a different job -> 404
    moneySeatForPageMock.mockResolvedValue({
      email: "eli@saddlewoodcontracting.com",
      owner: false,
      crewJobs: ["4125-e-camelback-rd"],
      billingJobs: [],
      laborCost: false,
      margin: false,
      sections: ["overview", "job-costing", "purchases"],
    });
    await expect(PurchaseTripPage({ params: Promise.resolve({ key: "app:entry:42" }) })).rejects.toThrow("NEXT_NOT_FOUND");

    // Owner sees edit controls and AP bill link
    moneySeatForPageMock.mockResolvedValue({
      email: "lando@saddlewoodcontracting.com",
      owner: true,
      crewJobs: null,
      billingJobs: null,
      laborCost: true,
      margin: true,
      sections: ["overview", "job-costing", "billing", "receivables", "payables", "purchases", "reconcile"],
    });
    const ownerEl = await PurchaseTripPage({ params: Promise.resolve({ key: "app:entry:42" }) });
    const ownerHtml = renderToStaticMarkup(ownerEl);
    expect(ownerHtml).toContain("trip-job-trade-control");
    expect(ownerHtml).toContain("line-trade-selector");
    expect(ownerHtml).toContain("/app/accounting/payables");
  });
});
