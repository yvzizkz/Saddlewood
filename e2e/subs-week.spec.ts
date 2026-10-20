// Subs: SOP-008 sub directory, compliance & scorecard, bid package -> invites ->
// leveling -> award -> frozen Work Order & email drafts -> bill -> waiver hold
// -> payment (docs/SCENARIOS.md §6).

import { expect, test } from "./support/env";

const VALID_PNG =
  "data:image/png;base64," +
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(140, 1),
  ]).toString("base64");

test.describe("Subs: the subcontractor & compliance week", () => {
  test("Compliance & Scorecard tab shows COI expiry alerts, missing W-9/MSA counts, and per-sub hit rate & open bills", async ({ owner: page }) => {
    await page.goto("/app/subs");
    await page.getByRole("tab", { name: /Compliance & Scorecard/i }).click();

    await expect(page.getByText("Cleared to mobilize").first()).toBeVisible();
    await expect(page.getByText("Expired / missing COI")).toBeVisible();
    await expect(page.getByText("Medina Pro Drywall LLC (Synthetic)")).toBeVisible();
    await expect(page.getByText("Sonoran Thermal Insulation LLC (Synthetic)")).toBeVisible();
    await expect(page.getByText(/COI expired/i).first()).toBeVisible();

    // Job Subs tab also surfaces the compliance & scorecard table
    await page.goto("/app/jobs/9146-w-hutton-dr?tab=subs");
    await expect(page.locator('[data-table="9146-w-hutton-dr-sub-scorecard"]')).toBeVisible();
  });

  test("Awarded package renders the frozen Work Order (S7), mobilization gate, and copyable Award & Thank-you email drafts (S6)", async ({ owner: page }) => {
    await page.goto("/app/subs/bids/e0000001-0000-4000-8000-000000000001");
    await expect(page.getByText(/WO-9440-INSU · Frozen Work Order/i)).toBeVisible();
    await expect(page.getByText("Medina Pro Drywall LLC (Synthetic)").first()).toBeVisible();
    await expect(page.getByText("Cleared to mobilize").first()).toBeVisible();
    await expect(page.getByText("Never auto-sent")).toBeVisible();
    await expect(page.getByText(/Award notice → Medina Pro Drywall/i)).toBeVisible();
    await expect(page.getByText(/Thank-you draft → Sonoran Thermal Insulation/i)).toBeVisible();
  });

  test("Package -> invites -> sub bid links -> leveling -> award under $10k -> frozen Work Order & mobilization hold when COI is expired", async ({ owner: page }) => {
    const title = `E2E Acoustic Baffles ${Date.now()}`;
    const pkgRes = await page.request.post("/api/bids", {
      data: {
        jobId: "b0000001-0000-4000-8000-000000008009",
        opportunityId: null,
        trade: "insulation",
        title,
        scope: "Furnish and hang 2-inch fabric-wrapped acoustic wall panels in Home Theater.",
        lines: [
          { id: "baffles-main", description: "Theater wall acoustic panels", qty: 240, unit: "SF", note: "", ourCents: 600_000 },
          { id: "baffles-trim", description: "perimeter J-mold & corner trim", qty: 80, unit: "LF", note: "", ourCents: 220_000 },
        ],
        exclusions: ["Low-voltage speaker cutouts"],
        workFrom: "2026-11-02",
        workTo: "2026-11-06",
        siteWalk: "",
        dueAt: null,
        terms: "Per Saddlewood MSA.",
      },
    });
    expect(pkgRes.ok()).toBeTruthy();
    const { package: pkg } = await pkgRes.json();

    // Invite Medina (approved, current COI) and Sonoran (approved, expired COI)
    const invRes = await page.request.post(`/api/bids/${pkg.id}/invites`, {
      data: {
        add: [
          { subId: "d0000001-0000-4000-8000-000000000001" },
          { subId: "d0000001-0000-4000-8000-000000000003" },
        ],
      },
    });
    expect(invRes.ok()).toBeTruthy();
    const { invites } = await invRes.json();
    expect(invites).toHaveLength(2);

    // Put package out to bid
    const outRes = await page.request.patch(`/api/bids/${pkg.id}`, { data: { status: "out" } });
    expect(outRes.ok()).toBeTruthy();

    const medinaInvite = invites.find((i: { subId: string }) => i.subId === "d0000001-0000-4000-8000-000000000001");
    const sonoranInvite = invites.find((i: { subId: string }) => i.subId === "d0000001-0000-4000-8000-000000000003");

    // Sonoran bids $5,800 on line 1 but leaves line 2 out (plugs our $2,200 cost -> leveled $8,000)
    const b1 = await page.request.post(`/b/${sonoranInvite.token}/submit`, {
      data: {
        lines: [
          { lineId: "baffles-main", cents: 580_000, note: "" },
          { lineId: "baffles-trim", cents: null, note: "excluded" },
        ],
        inclusions: "Panels only",
        exclusions: "Perimeter trim",
        startOn: "2026-11-02",
        duration: "4 days",
        validDays: 30,
        deviations: "",
        note: "",
        files: [],
        signerTitle: "Estimator",
        signature: {
          name: "Luis Sonoran",
          method: "draw",
          image: VALID_PNG,
          agree: true,
        },
      },
    });
    expect(b1.ok()).toBeTruthy();

    // Medina bids both lines for $7,600 total -> lowest leveled ($7,600 vs $8,000), even though Sonoran's headline ($5,800) is lower!
    const b2 = await page.request.post(`/b/${medinaInvite.token}/submit`, {
      data: {
        lines: [
          { lineId: "baffles-main", cents: 560_000, note: "" },
          { lineId: "baffles-trim", cents: 200_000, note: "" },
        ],
        inclusions: "All panels and trim",
        exclusions: "",
        startOn: "2026-11-02",
        duration: "3 days",
        validDays: 30,
        deviations: "",
        note: "",
        files: [],
        signerTitle: "Chief Estimator",
        signature: {
          name: "Hector Medina",
          method: "draw",
          image: VALID_PNG,
          agree: true,
        },
      },
    });
    expect(b2.ok()).toBeTruthy();

    await page.goto(`/app/subs/bids/${pkg.id}`);
    await expect(page.getByText("Lowest leveled", { exact: true })).toBeVisible();
    await expect(page.getByText("Lowest total, not lowest leveled", { exact: true })).toBeVisible();

    // Award to Sonoran (to prove the mobilization gate warns on expired COI in the frozen Work Order)
    const awardRes = await page.request.post(`/api/bids/${pkg.id}/award`, {
      data: { inviteId: sonoranInvite.id, why: "Testing COI mobilization gate" },
    });
    expect(awardRes.ok()).toBeTruthy();

    await page.reload();
    await expect(page.getByText(/WO-8009-INSU · Frozen Work Order/i)).toBeVisible();
    await expect(page.getByText("Hold before mobilization")).toBeVisible();
    await expect(page.getByText(/insurance expired/i).first()).toBeVisible();
  });

  test("A sub bill missing its lien waiver or with an expired COI is held in Payables until the waiver is received", async ({ owner: page }) => {
    // Seeded bill f1000001-0000-4000-8000-000000000003 (Sonoran Thermal Insulation) is on hold for missing waiver / expired COI
    const billId = "f1000001-0000-4000-8000-000000000003";
    await page.goto(`/app/accounting/payables/bill/${billId}`);
    await expect(page.getByText("Sonoran Thermal Insulation LLC (Synthetic)").first()).toBeVisible();
    await expect(page.getByText(/On hold|Missing/i).first()).toBeVisible();

    // Collecting the waiver and clearing the hold schedules the bill for Friday's run
    const clearRes = await page.request.patch("/api/accounting/payables", {
      data: { action: "update_bill", billId, waiverReceived: true, clearHold: true },
    });
    expect(clearRes.ok()).toBeTruthy();

    try {
      await page.reload();
      await expect(page.getByText(/Conditional waiver on file|Scheduled/i).first()).toBeVisible();
    } finally {
      // Restore the hold state so reruns see the same starting state
      await page.request.patch("/api/accounting/payables", {
        data: { action: "update_bill", billId, status: "hold" },
      });
    }
  });
});
