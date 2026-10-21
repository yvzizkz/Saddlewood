import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  moneySeatMock,
  listJobRefsMock,
  loadIssuedMock,
  loadBillingCalendarMock,
  loadChangeOrdersMock,
  loadWaiversMock,
  captured,
} = vi.hoisted(() => ({
  moneySeatMock: vi.fn(),
  listJobRefsMock: vi.fn(),
  loadIssuedMock: vi.fn(),
  loadBillingCalendarMock: vi.fn(),
  loadChangeOrdersMock: vi.fn(),
  loadWaiversMock: vi.fn(),
  captured: {
    tables: new Map<string, Record<string, unknown>[]>(),
    kpiStats: [] as { label: string; href?: string }[],
    frameActions: undefined as unknown,
  },
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("@/lib/accounting/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/accounting/access")>();
  return {
    ...actual,
    moneySeatForPage: moneySeatMock,
  };
});

vi.mock("@/lib/jobs/hub", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jobs/hub")>();
  return {
    ...actual,
    listJobRefs: listJobRefsMock,
  };
});

vi.mock("@/lib/accounting/receivables", () => ({
  loadIssued: loadIssuedMock,
  loadBillingCalendar: loadBillingCalendarMock,
}));

vi.mock("@/lib/billing/registers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/registers")>();
  return {
    ...actual,
    loadChangeOrders: loadChangeOrdersMock,
    loadWaivers: loadWaiversMock,
  };
});

vi.mock("@/lib/crew/time", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/crew/time")>();
  return {
    ...actual,
    localDay: () => "2026-10-20",
  };
});

vi.mock("@/components/accounting/AccountingFrame", () => ({
  default: function MockAccountingFrame(props: { actions?: unknown; children?: unknown }) {
    captured.frameActions = props.actions;
    return props.children ?? null;
  },
}));

vi.mock("@/components/data/KpiHeader", () => ({
  default: function MockKpiHeader(props: { stats?: { label: string; href?: string }[] }) {
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

import BillingPage from "../page";

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

describe("BillingPage PM vs owner scoping (T59)", () => {
  beforeEach(() => {
    captured.tables.clear();
    captured.kpiStats = [];
    captured.frameActions = undefined;

    listJobRefsMock.mockResolvedValue([
      {
        key: "8009-n-ironwood-dr",
        name: "8009 N Ironwood Dr",
        billingId: "job-8009",
        crewId: "8009-n-ironwood-dr",
        clientId: "client-aft",
      },
    ]);

    loadIssuedMock.mockResolvedValue([
      {
        id: "doc-inv-1",
        number: "INV-2026-010",
        title: "Draw 1",
        kind: "invoice",
        status: "issued",
        clientId: "client-aft",
        client: "A Finer Touch",
        jobId: "job-8009",
        job: "8009 N Ironwood Dr",
        day: "2026-10-10",
        dueOn: "2026-10-25",
        totalCents: 250_000,
      },
      {
        id: "doc-draft-1",
        number: "INV-2026-011",
        title: "Draw 2 Draft",
        kind: "invoice",
        status: "draft",
        clientId: "client-aft",
        client: "A Finer Touch",
        jobId: "job-8009",
        job: "8009 N Ironwood Dr",
        day: "2026-10-18",
        dueOn: null,
        totalCents: 180_000,
      },
    ]);

    loadBillingCalendarMock.mockResolvedValue([]);

    loadChangeOrdersMock.mockResolvedValue([
      {
        id: "r1",
        registerId: 1,
        number: "CO-001",
        title: "Priced change with doc",
        jobKey: "8009-n-ironwood-dr",
        job: "8009 N Ironwood Dr",
        status: "sent",
        amountCents: 45_000,
        requestedOn: "2026-10-12",
        ageDays: 8,
        documentId: "doc-co-1",
        billedDocumentId: null,
        source: "field",
      },
      {
        id: "r2",
        registerId: 2,
        number: "Request 2",
        title: "Unpriced field change",
        jobKey: "8009-n-ironwood-dr",
        job: "8009 N Ironwood Dr",
        status: "requested",
        amountCents: null,
        requestedOn: "2026-10-15",
        ageDays: 5,
        documentId: null,
        billedDocumentId: null,
        source: "field",
      },
    ]);

    loadWaiversMock.mockResolvedValue([
      {
        id: "odoc-inv-1",
        direction: "out",
        kind: "conditional_progress",
        party: "A Finer Touch",
        jobKey: "8009-n-ironwood-dr",
        job: "8009 N Ironwood Dr",
        covers: "INV-2026-010",
        coversHref: "/app/money/doc-inv-1",
        amountCents: 250_000,
        status: "missing",
        statusLabel: "Missing",
      },
      {
        id: "ibill-sub-1",
        direction: "in",
        kind: "conditional_progress",
        party: "Desert Peak Drywall LLC",
        jobKey: "8009-n-ironwood-dr",
        job: "8009 N Ironwood Dr",
        covers: "DP-8812",
        coversHref: "/app/accounting/payables/bill/bill-sub-1",
        amountCents: 420_000,
        status: "missing",
        statusLabel: "Missing",
      },
    ]);
  });

  it("drops direction='in' sub waivers and owner-only hrefs (/app/accounting/payables/bill, /app/jobs?tab=changes, /app/bill) for a non-owner PM", async () => {
    moneySeatMock.mockResolvedValue({
      owner: false,
      email: "eli.pm@example.com",
      sections: ["billing"],
      crewJobs: ["8009-n-ironwood-dr"],
      billingJobs: ["job-8009"],
      laborCost: false,
      margins: false,
    });

    renderTree(await BillingPage({ searchParams: Promise.resolve({ p: "mtd" }) }));

    const waiverRows = captured.tables.get("lien-waivers") ?? [];
    expect(waiverRows).toHaveLength(1);
    expect(waiverRows[0]).toMatchObject({
      covers: "INV-2026-010",
      href: "/app/money/doc-inv-1",
      party: "A Finer Touch",
    });
    expect(JSON.stringify(waiverRows)).not.toContain("Desert Peak Drywall LLC");
    expect(JSON.stringify(waiverRows)).not.toContain("/app/accounting/payables/bill");

    const coRows = captured.tables.get("change-orders") ?? [];
    expect(coRows).toHaveLength(2);
    expect(coRows[0]).toMatchObject({ id: "r1", href: "/app/money/doc-co-1" });
    expect(coRows[1]).toMatchObject({ id: "r2", href: null });
    expect(JSON.stringify(coRows)).not.toContain("?tab=changes");

    const billingRows = captured.tables.get("billing-mtd") ?? [];
    const issuedRow = billingRows.find((r) => r.id === "doc-inv-1");
    const draftRow = billingRows.find((r) => r.id === "doc-draft-1");
    expect(issuedRow?.href).toBe("/app/money/doc-inv-1");
    expect(draftRow?.href).toBeNull();

    const draftsStat = captured.kpiStats.find((s) => s.label === "Drafts waiting");
    expect(draftsStat?.href).toBeUndefined();
    expect(captured.frameActions).toBeUndefined();
  });

  it("preserves both waiver directions, job changes links, and /app/bill draft links for an owner", async () => {
    moneySeatMock.mockResolvedValue({
      owner: true,
      email: "lando@saddlewoodcontracting.com",
      sections: ["overview", "billing"],
      crewJobs: null,
      billingJobs: null,
      laborCost: true,
      margins: true,
    });

    renderTree(await BillingPage({ searchParams: Promise.resolve({ p: "mtd" }) }));

    const waiverRows = captured.tables.get("lien-waivers") ?? [];
    expect(waiverRows).toHaveLength(2);

    const coRows = captured.tables.get("change-orders") ?? [];
    expect(coRows[0]?.href).toBe("/app/jobs/8009-n-ironwood-dr?tab=changes");

    const billingRows = captured.tables.get("billing-mtd") ?? [];
    const draftRow = billingRows.find((r) => r.id === "doc-draft-1");
    expect(draftRow?.href).toBe("/app/bill");

    const draftsStat = captured.kpiStats.find((s) => s.label === "Drafts waiting");
    expect(draftsStat?.href).toBe("/app/bill");
  });
});
