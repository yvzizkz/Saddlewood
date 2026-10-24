import { describe, expect, it } from "vitest";

import {
  buildGcLookAheadDrafts,
  mobilizationOf,
  monthGrid,
  SCHEDULE_KIND_LABEL,
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

describe("an awarded sub's start on the schedule", () => {
  const ready = { ready: true, missing: [] };
  const held = { ready: false, missing: ["no insurance certificate", "no W-9"] };

  it("takes the package's work window over the winning bid's start", () => {
    expect(mobilizationOf({ workFrom: "2026-11-02", workTo: "2026-11-06" }, "2026-10-30", ready, "2026-10-24")).toEqual({
      startDay: "2026-11-02",
      endDay: "2026-11-06",
      status: "scheduled",
      detail: "Cleared to mobilize",
    });
  });

  it("falls back to the winning bid's start, one day long", () => {
    expect(mobilizationOf({ workFrom: null, workTo: null }, "2026-10-30", ready, "2026-10-24")).toMatchObject({ startDay: "2026-10-30", endDay: "2026-10-30" });
  });

  it("is not on the schedule with no start at all", () => {
    expect(mobilizationOf({ workFrom: null, workTo: "2026-11-06" }, null, ready, "2026-10-24")).toBeNull();
  });

  it("names what holds the sub, and is overdue once the start comes while they are still held", () => {
    expect(mobilizationOf({ workFrom: "2026-11-02", workTo: null }, null, held, "2026-10-24")).toMatchObject({ status: "scheduled", detail: "Not cleared to mobilize: no insurance certificate, no W-9" });
    expect(mobilizationOf({ workFrom: "2026-10-24", workTo: null }, null, held, "2026-10-24")?.status).toBe("overdue");
    expect(mobilizationOf({ workFrom: "2026-10-20", workTo: null }, null, ready, "2026-10-24")?.status).toBe("done");
  });

  it("flags a held sub only while the work window is open, never on finished work", () => {
    // A COI that lapsed after the job: the award stays, the start is not missed.
    expect(mobilizationOf({ workFrom: "2026-09-01", workTo: "2026-09-12" }, null, held, "2026-10-24")?.status).toBe("done");
    expect(mobilizationOf({ workFrom: "2026-10-20", workTo: "2026-10-24" }, null, held, "2026-10-24")?.status).toBe("overdue");
    expect(mobilizationOf({ workFrom: "2026-10-20", workTo: "2026-10-23" }, null, held, "2026-10-24")?.status).toBe("done");
    expect(mobilizationOf({ workFrom: "2026-10-25", workTo: "2026-10-30" }, null, held, "2026-10-24")?.status).toBe("scheduled");
  });

  it("never ends before it starts", () => {
    expect(mobilizationOf({ workFrom: "2026-11-02", workTo: "2026-10-30" }, null, ready, "2026-10-24")?.endDay).toBe("2026-11-02");
  });
});
