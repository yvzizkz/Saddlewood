import { beforeEach, describe, expect, it, vi } from "vitest";

const { moneySeatMock, loadJobCostMock, captured } = vi.hoisted(() => ({
  moneySeatMock: vi.fn(),
  loadJobCostMock: vi.fn(),
  captured: {
    tables: new Map<string, Record<string, unknown>[]>(),
    kpiValue: 0,
    kpiStats: [] as { label: string; value: unknown }[],
  },
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("@/lib/accounting/access", () => ({
  moneySeatForPage: moneySeatMock,
}));

vi.mock("@/lib/accounting/jobCost", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/accounting/jobCost")>();
  return {
    ...actual,
    loadJobCost: loadJobCostMock,
  };
});

vi.mock("@/components/accounting/AccountingFrame", () => ({
  default: function MockAccountingFrame(props: { children?: unknown }) {
    return props.children ?? null;
  },
}));

vi.mock("@/components/data/KpiHeader", () => ({
  default: function MockKpiHeader(props: { value: number; stats?: { label: string; value: unknown }[] }) {
    captured.kpiValue = props.value;
    captured.kpiStats = props.stats ?? [];
    return null;
  },
}));

vi.mock("@/components/data/DataTable", () => ({
  default: function MockDataTable(props: { name: string; rows: Record<string, unknown>[] }) {
    captured.tables.set(props.name, props.rows);
    return null;
  },
}));

import JobCostingPage from "../page";

function renderTree(node: unknown): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) renderTree(child);
    return;
  }
  const el = node as { type?: unknown; props?: { children?: unknown } };
  if (typeof el.type === "function") {
    renderTree((el.type as (p: unknown) => unknown)(el.props ?? {}));
    return;
  }
  if (el.props?.children) renderTree(el.props.children);
}

describe("JobCostingPage PM with pmSeesMargins on and laborCost off (T60)", () => {
  beforeEach(() => {
    captured.tables.clear();
    captured.kpiValue = 0;
    captured.kpiStats = [];

    loadJobCostMock.mockResolvedValue({
      lines: [
        {
          id: "l-shift-1",
          day: "2026-03-18",
          jobKey: "job-8009",
          job: "8009 N Ironwood Dr",
          category: "labor",
          trade: "framing",
          tradeLabel: "Framing",
          cents: 32_000,
          href: "/app/accounting/payroll/entry/101",
          label: "Jorge Ramirez, 2026-03-18",
        },
        {
          id: "l-shift-2",
          day: "2026-03-19",
          jobKey: "job-8009",
          job: "8009 N Ironwood Dr",
          category: "labor",
          trade: "framing",
          tradeLabel: "Framing",
          cents: 28_000,
          href: "/app/accounting/payroll/entry/102",
          label: "Carlos Vega, 2026-03-19",
        },
        {
          id: "p-mat-1",
          day: "2026-03-19",
          jobKey: "job-8009",
          job: "8009 N Ironwood Dr",
          category: "materials",
          trade: "framing",
          tradeLabel: "Framing",
          cents: 15_000,
          href: "/app/accounting/purchases/trip/hd%3A1",
          label: "Home Depot: 2x4 studs",
        },
        {
          id: "b-sub-1",
          day: "2026-03-20",
          jobKey: "job-8009",
          job: "8009 N Ironwood Dr",
          category: "subs",
          trade: "drywall",
          tradeLabel: "Drywall",
          cents: 100_000,
          href: "/app/accounting/payables/bill/bill-sub-1",
          label: "Desert Peak Drywall LLC DP-8812",
        },
      ],
      jobs: [
        {
          jobKey: "job-8009",
          job: "8009 N Ironwood Dr",
          contractCents: 500_000,
          billedCents: 300_000,
          collectedCents: 200_000,
          laborCents: 60_000,
          materialsCents: 15_000,
          subsCents: 100_000,
        },
      ],
      laborWithoutRate: 0,
      payablesMissing: false,
      capped: false,
    });
  });

  it("hides per-shift labor dollar rows and shift-hours links when !seat.laborCost, drops /app/accounting/payables/bill links when !seat.owner, and keeps job/margin totals equal to the owner view", async () => {
    moneySeatMock.mockResolvedValue({
      owner: true,
      email: "lando@saddlewoodcontracting.com",
      sections: ["overview", "job-costing"],
      crewJobs: null,
      billingJobs: null,
      laborCost: true,
      margins: true,
    });
    renderTree(await JobCostingPage({ searchParams: Promise.resolve({ p: "ytd" }) }));

    const ownerKpi = captured.kpiValue;
    const ownerStats = [...captured.kpiStats];
    const ownerJobs = [...(captured.tables.get("job-costing-ytd") ?? [])];
    const ownerLines = [...(captured.tables.get("job-cost-lines-ytd") ?? [])];

    expect(ownerLines).toHaveLength(4);
    expect(ownerLines.some((r) => r.id === "l-shift-1")).toBe(true);
    expect(ownerLines.find((r) => r.id === "b-sub-1")?.href).toBe("/app/accounting/payables/bill/bill-sub-1");

    captured.tables.clear();
    moneySeatMock.mockResolvedValue({
      owner: false,
      email: "eli.pm@example.com",
      sections: ["job-costing"],
      crewJobs: ["8009-n-ironwood-dr"],
      billingJobs: ["job-8009"],
      laborCost: false,
      margins: true,
    });
    renderTree(await JobCostingPage({ searchParams: Promise.resolve({ p: "ytd" }) }));

    const pmKpi = captured.kpiValue;
    const pmStats = [...captured.kpiStats];
    const pmJobs = [...(captured.tables.get("job-costing-ytd") ?? [])];
    const pmLines = [...(captured.tables.get("job-cost-lines-ytd") ?? [])];

    // Totals (KPI cost, billed, margin, and job table rows) equal the owner view.
    expect(pmKpi).toBe(ownerKpi);
    expect(pmStats).toEqual(ownerStats);
    expect(pmJobs).toEqual(ownerJobs);

    const ownerLineSum = ownerLines.reduce((sum, r) => sum + Number(r.cents), 0);
    const pmLineSum = pmLines.reduce((sum, r) => sum + Number(r.cents), 0);
    expect(pmLineSum).toBe(ownerLineSum);

    // No per-shift dollar rows, no worker names, and no payroll entry links.
    expect(pmLines).toHaveLength(3);
    expect(JSON.stringify(pmLines)).not.toContain("Jorge Ramirez");
    expect(JSON.stringify(pmLines)).not.toContain("Carlos Vega");
    expect(JSON.stringify(pmLines)).not.toContain("/app/accounting/payroll/entry/");
    const laborSummary = pmLines.find((r) => r.kind === "Labor");
    expect(laborSummary).toMatchObject({
      trade: "Framing",
      what: "Framing labor total",
      href: null,
      cents: 60_000,
    });

    // Sub cost line drops owner-only /app/accounting/payables/bill/[id] link.
    const subRow = pmLines.find((r) => r.id === "b-sub-1");
    expect(subRow?.href).toBeNull();
    expect(JSON.stringify(pmLines)).not.toContain("/app/accounting/payables/bill/");
  });
});
