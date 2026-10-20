import { describe, expect, it } from "vitest";

import {
  buildAwardEmailDrafts,
  buildWorkOrder,
  classifyCoi,
  computeSubScorecards,
} from "../scorecard";
import type { PackageDetail } from "../store";
import type { Sub } from "../types";

const BASE_SUB: Sub = {
  id: "sub-1",
  name: "Desert Peak Drywall LLC",
  trades: ["drywall", "framing"],
  status: "approved",
  phone: "602-555-0100",
  email: "bids@desertpeak.example.com",
  address: "Phoenix, AZ",
  rocLicense: "ROC-331092",
  rocVerifiedAt: "2026-10-01T12:00:00Z",
  rocVerifiedBy: "Ilene",
  coiExpiresOn: "2026-12-15",
  w9OnFile: true,
  msaSignedOn: "2026-01-10",
  achConfirmedAt: "2026-01-12T12:00:00Z",
  achConfirmedBy: "Ilene",
  note: "",
  createdBy: "Ilene",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  contacts: [
    {
      id: "c-1",
      subId: "sub-1",
      name: "Carlos Vega",
      email: "carlos@desertpeak.example.com",
      phone: "602-555-0101",
      role: "Estimator",
      isPrimary: true,
      active: true,
    },
  ],
};

describe("subs scorecard & compliance (S1, S6, S7, S8)", () => {
  it("classifies COI states accurately around 30-day window and expiration", () => {
    expect(classifyCoi(null, "2026-10-20")).toEqual({ daysLeft: null, state: "missing" });
    expect(classifyCoi("2026-10-15", "2026-10-20")).toEqual({ daysLeft: -5, state: "expired" });
    expect(classifyCoi("2026-11-05", "2026-10-20")).toEqual({ daysLeft: 16, state: "expiring_30d" });
    expect(classifyCoi("2026-12-31", "2026-10-20")).toEqual({ daysLeft: 72, state: "ok" });
  });

  it("computes per-sub scorecards and compliance summary", () => {
    const expiredSub: Sub = {
      ...BASE_SUB,
      id: "sub-2",
      name: "Sonoran Stucco Co",
      trades: ["stucco"],
      coiExpiresOn: "2026-10-01",
      w9OnFile: false,
    };

    const invites = [
      { sub_id: "sub-1", status: "awarded" },
      { sub_id: "sub-1", status: "not_awarded" },
      { sub_id: "sub-1", status: "declined" },
      { sub_id: "sub-2", status: "invited" },
    ];
    const bills = [
      { vendorName: "Desert Peak Drywall LLC", balanceCents: 420_000, status: "ready" },
      { vendorName: "Sonoran Stucco Co", balanceCents: 185_000, status: "hold" },
    ];
    const punch = new Map<string, number>([["Desert Peak Drywall LLC", 2]]);

    const { scorecards, summary } = computeSubScorecards(
      [BASE_SUB, expiredSub],
      invites,
      bills,
      punch,
      "2026-10-20",
    );

    expect(summary).toEqual({
      totalSubs: 2,
      readyCount: 1,
      expiredOrMissingCoiCount: 1,
      expiring30dCoiCount: 0,
      missingW9OrMsaCount: 1,
    });

    const s1 = scorecards.find((s) => s.subId === "sub-1")!;
    expect(s1.readyToMobilize).toBe(true);
    expect(s1.invitedCount).toBe(3);
    expect(s1.submittedCount).toBe(2);
    expect(s1.awardedCount).toBe(1);
    expect(s1.hitRatePct).toBe(50);
    expect(s1.responseRatePct).toBe(100);
    expect(s1.openBillsCents).toBe(420_000);
    expect(s1.punchOpenCount).toBe(2);

    const s2 = scorecards.find((s) => s.subId === "sub-2")!;
    expect(s2.readyToMobilize).toBe(false);
    expect(s2.coiState).toBe("expired");
    expect(s2.heldBillsCount).toBe(1);
  });

  it("builds a frozen Work Order (S7) and Award + Thank-you email drafts (S6)", () => {
    const detail: PackageDetail = {
      pkg: {
        id: "pkg-9146-dry",
        jobId: "job-1",
        opportunityId: null,
        trade: "drywall",
        title: "Level 4 Drywall Hang & Finish",
        scope: "Hang, tape, and Level 4 finish per A-sheets.",
        lines: [
          { id: "l-1", description: "5/8 Type X board hang & tape", qty: 4800, unit: "SF", note: "", ourCents: 1_200_000 },
        ],
        exclusions: ["Paint", "Primer"],
        files: [],
        workFrom: "2026-10-26",
        workTo: "2026-11-06",
        siteWalk: "",
        dueAt: "2026-10-22T17:00:00-07:00",
        terms: "Standard Saddlewood MSA terms.",
        status: "awarded",
        awardedInviteId: "inv-1",
        awardedAt: "2026-10-20T15:00:00Z",
        awardedBy: "Lando",
        createdBy: "Lando",
        createdAt: "2026-10-15T00:00:00Z",
        updatedAt: "2026-10-20T15:00:00Z",
      },
      job: { name: "9146 W Hutton Dr", address: "9146 W Hutton Dr, Peoria, AZ" },
      addenda: [],
      invites: [
        {
          id: "inv-1",
          packageId: "pkg-9146-dry",
          subId: "sub-1",
          contactName: "Carlos Vega",
          contactEmail: "carlos@desertpeak.example.com",
          token: "tok-1",
          status: "awarded",
          sentAt: "2026-10-16T00:00:00Z",
          viewedAt: "2026-10-16T02:00:00Z",
          declinedAt: null,
          declineNote: "",
          levelAddCents: 0,
          levelNote: "",
          createdBy: "Lando",
          createdAt: "2026-10-15T00:00:00Z",
          sub: {
            id: BASE_SUB.id,
            name: BASE_SUB.name,
            status: BASE_SUB.status,
            trades: BASE_SUB.trades,
            coiExpiresOn: BASE_SUB.coiExpiresOn,
            w9OnFile: BASE_SUB.w9OnFile,
            msaSignedOn: BASE_SUB.msaSignedOn,
            rocVerifiedAt: BASE_SUB.rocVerifiedAt,
            achConfirmedAt: BASE_SUB.achConfirmedAt,
          },
          latest: {
            id: 1,
            inviteId: "inv-1",
            revision: 1,
            lines: [{ lineId: "l-1", cents: 1_150_000, note: "" }],
            totalCents: 1_150_000,
            inclusions: "All corner bead and L-trim",
            exclusions: "Prime and paint",
            startOn: "2026-10-26",
            duration: "8 working days",
            validDays: 30,
            deviations: "",
            note: "",
            files: [],
            signerName: "Carlos Vega",
            signerTitle: "Chief Estimator",
            signature: { method: "type", typed: "Carlos Vega", image: "data:image/png;base64,iVBOR" },
            consent: "Agreed",
            fingerprint: "fp-1234567890abcdef",
            submittedAt: "2026-10-18T18:00:00Z",
          },
          revisions: 1,
        },
        {
          id: "inv-2",
          packageId: "pkg-9146-dry",
          subId: "sub-2",
          contactName: "Marco Ruiz",
          contactEmail: "marco@sonoran.example.com",
          token: "tok-2",
          status: "not_awarded",
          sentAt: "2026-10-16T00:00:00Z",
          viewedAt: "2026-10-16T04:00:00Z",
          declinedAt: null,
          declineNote: "",
          levelAddCents: 0,
          levelNote: "",
          createdBy: "Lando",
          createdAt: "2026-10-15T00:00:00Z",
          sub: {
            id: "sub-2",
            name: "Sonoran Drywall Inc",
            status: "approved",
            trades: ["drywall"],
            coiExpiresOn: "2026-12-01",
            w9OnFile: true,
            msaSignedOn: "2026-01-01",
            rocVerifiedAt: "2026-01-01",
            achConfirmedAt: "2026-01-01",
          },
          latest: null,
          revisions: 1,
        },
      ],
      events: [],
      leveling: {
        budgetCents: 1_200_000,
        linesWithoutCost: [],
        bids: [
          {
            inviteId: "inv-1",
            headlineCents: 1_150_000,
            plugs: [],
            pluggedCents: 0,
            unpriced: [],
            addCents: 0,
            leveledCents: 1_150_000,
            rank: 1,
          },
        ],
        lowestHeadline: "inv-1",
        lowestLeveled: "inv-1",
      },
    };

    const wo = buildWorkOrder(detail, new Map([[BASE_SUB.id, BASE_SUB]]), {}, "2026-10-20");
    expect(wo).not.toBeNull();
    expect(wo!.woNumber).toBe("WO-9146-DRYW");
    expect(wo!.headlineCents).toBe(1_150_000);
    expect(wo!.mobilizationGate.canMobilize).toBe(true);
    expect(wo!.workOrderHash.length).toBeGreaterThan(10);

    const drafts = buildAwardEmailDrafts(detail, wo, "Lando");
    expect(drafts.awardDraft).not.toBeNull();
    expect(drafts.awardDraft!.subject).toContain("WO-9146-DRYW");
    expect(drafts.awardDraft!.body).toContain("$11,500.00");
    expect(drafts.thankYouDrafts).toHaveLength(1);
    expect(drafts.thankYouDrafts[0].subName).toBe("Sonoran Drywall Inc");
  });
});
