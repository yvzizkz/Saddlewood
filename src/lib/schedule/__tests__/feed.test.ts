import { describe, expect, it } from "vitest";

import {
  buildGcLookAheadDrafts,
  monthGrid,
  SCHEDULE_KIND_LABEL,
  scheduleForSeat,
  weekDays,
  type ScheduleEvent,
} from "../feed";
import type { JobRef } from "@/lib/jobs/hub";

describe("schedule feed helpers", () => {
  it("computes the 7-day Monday..Sunday week for any date", () => {
    const days = weekDays("2026-10-21"); // Wednesday
    expect(days).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
    ]);
  });

  it("computes a full Monday-aligned month grid", () => {
    const grid = monthGrid("2026-10-20");
    expect(grid.monthLabel).toContain("October 2026");
    expect(grid.weeks.length).toBeGreaterThanOrEqual(4);
    expect(grid.weeks[0][0]).toBe("2026-09-28");
    expect(grid.weeks[grid.weeks.length - 1][6]).toBe("2026-11-01");
  });

  it("builds Wednesday two-week look-ahead email drafts per GC with jobs, milestones & billings", () => {
    const refs: JobRef[] = [
      {
        key: "9146-w-hutton-dr",
        name: "9146 W Hutton Dr",
        client: "Build Collective",
        clientId: "10000000-0000-0000-0000-000000000001",
        address: "9146 W Hutton Dr, Peoria AZ",
        billingId: "20000000-0000-0000-0000-000000000001",
        crewId: "9146-w-hutton-dr",
        saleId: null,
        saleNumber: "P-011",
        contractCents: 2840000,
        active: true,
      status: "active",
        awarded: true,
        pm: ["Jorge"],
      },
    ];
    const items: ScheduleEvent[] = [
      {
        id: "si:1",
        source: "item",
        kind: "inspection",
        kindLabel: SCHEDULE_KIND_LABEL.inspection,
        jobKey: "9146-w-hutton-dr",
        job: "9146 W Hutton Dr",
        client: "Build Collective",
        title: "Pre-cover drywall screw & corner-bead inspection",
        detail: "Peoria inspector · Main hall",
        startDay: "2026-10-22",
        endDay: "2026-10-22",
        startTime: "09:30",
        who: "Jorge",
        whoEmail: "jorge@saddlewood.crew",
        role: "field_lead",
        status: "scheduled",
        href: "/app/jobs/9146-w-hutton-dr?tab=schedule",
        editable: true,
        itemId: 1,
      },
      {
        id: "bc:cut",
        source: "billing",
        kind: "billing_cutoff",
        kindLabel: SCHEDULE_KIND_LABEL.billing_cutoff,
        jobKey: null,
        job: "Build Collective (1 open job)",
        client: "Build Collective",
        title: "Billing cutoff: Build Collective",
        detail: "25th of month · G702/G703",
        startDay: "2026-10-25",
        endDay: "2026-10-25",
        startTime: "17:00",
        who: "Ilene",
        whoEmail: "",
        role: "finance",
        status: "scheduled",
        href: "/app/accounting/billing",
        editable: false,
      },
    ];

    const drafts = buildGcLookAheadDrafts(items, refs, "2026-10-20");
    expect(drafts).toHaveLength(1);
    expect(drafts[0].client).toBe("Build Collective");
    expect(drafts[0].subject).toContain("Two-Week Look-Ahead");
    expect(drafts[0].body).toContain("9146 W Hutton Dr");
    expect(drafts[0].body).toContain("Pre-cover drywall screw & corner-bead inspection");
    expect(drafts[0].body).toContain("Billing cutoff: Build Collective");
    expect(SCHEDULE_KIND_LABEL.inspection).toBe("Inspection");
  });
});

describe("a project manager's cut of the schedule", () => {
  const ev = (id: string, over: Partial<ScheduleEvent>): ScheduleEvent => ({
    id,
    source: "item",
    kind: "inspection",
    kindLabel: "Inspection",
    jobKey: "ironwood",
    job: "8009 N Ironwood Dr",
    client: "Patrick Homes",
    title: id,
    detail: "",
    startDay: "2026-10-28",
    endDay: "2026-10-28",
    startTime: "",
    who: "",
    whoEmail: "",
    role: "pm",
    status: "scheduled",
    href: "/app/jobs/ironwood?tab=schedule",
    editable: true,
    ...over,
  });
  const refs = [
    { key: "ironwood", client: "Patrick Homes" },
    { key: "camelback", client: "Build Collective" },
  ];
  const events = [
    ev("mine", {}),
    ev("crew", { source: "crew", kind: "crew", href: "/app/jobs/ironwood?tab=crew" }),
    ev("bid", { source: "bid", kind: "bid_due", href: "/app/subs/bids/4" }),
    ev("bill", { source: "pay", kind: "pay_day", href: "/app/accounting/payables/bill/9" }),
    ev("other", { jobKey: "camelback", client: "Build Collective" }),
    ev("cutoff", { source: "billing", kind: "billing_cutoff", jobKey: null, client: "Patrick Homes", href: "/app/accounting/billing" }),
    ev("their cutoff", { source: "billing", kind: "billing_cutoff", jobKey: null, client: "Build Collective", href: "/app/accounting/billing" }),
    ev("payroll", { source: "pay", kind: "pay_day", jobKey: null, client: "", href: "/app/accounting/payroll" }),
    ev("coi", { source: "sub", kind: "compliance", jobKey: null, client: "", href: "/app/subs" }),
  ];

  it("keeps their jobs and their clients' billing dates, never pay runs, other jobs or company dates", () => {
    expect(scheduleForSeat(events, new Set(["ironwood"]), refs).map((e) => e.id)).toEqual(["mine", "crew", "bid", "cutoff"]);
  });

  it("sends a link they cannot open to the job's Schedule tab", () => {
    const hrefs = Object.fromEntries(scheduleForSeat(events, new Set(["ironwood"]), refs).map((e) => [e.id, e.href]));
    expect(hrefs).toEqual({
      mine: "/app/jobs/ironwood?tab=schedule",
      crew: "/app/jobs/ironwood?tab=crew",
      bid: "/app/jobs/ironwood?tab=schedule",
      cutoff: "/app/accounting/billing",
    });
  });

  it("leaves an owner's schedule as it is", () => {
    expect(scheduleForSeat(events, null, refs)).toBe(events);
  });
});
