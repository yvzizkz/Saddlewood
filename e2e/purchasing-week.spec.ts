// Purchasing: Home Depot & supply-house runs across jobs (docs/SCENARIOS.md §5).
// KPI headline matches table total, drill-down by trade and vendor, assigning
// an unmatched register name ("Which job is this?") flows into the job's
// Purchases total, re-tagging a purchase line to a trade persists, and CSV
// export matches the table rows.

import { readFileSync } from "node:fs";

import { cents, expect, test } from "./support/env";

test.describe("Purchasing: the purchasing week", () => {
  test("Purchases KPI headline equals the table total across Items and Trips views, and drilling by trade narrows the table", async ({ owner: page }) => {
    await page.goto("/app/accounting/purchases?p=mtd");
    const headline = cents(await page.locator('[data-kpi="value"]').textContent());
    const itemsFooter = cents(await page.locator('[data-table="purchases-items-mtd"] [data-total="amount"]').textContent());
    expect(headline).not.toBeNull();
    expect(headline).toBe(itemsFooter);

    await page.goto("/app/accounting/purchases?p=mtd&view=trips");
    const tripsFooter = cents(await page.locator('[data-table="purchases-trips-mtd"] [data-total="amount"]').textContent());
    expect(tripsFooter).toBe(headline);

    await page.goto("/app/accounting/purchases?p=mtd&trade=framing");
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Framing");
    const rowTexts = await page.locator('[data-table="purchases-items-mtd"] tbody tr').allTextContents();
    expect(rowTexts.length).toBeGreaterThan(0);
    for (const r of rowTexts) expect(r).toContain("Framing");
  });

  test("An unmatched register PO name ('BAMBI BACKYARD') is assigned to a job and increases that job's material spend", async ({ owner: page }) => {
    const jobSlug = "6402-e-bambi-drive";
    await page.request.patch("/api/accounting/purchases", {
      data: { action: "alias_rule", jobKey: "bambi backyard", jobId: null, clearAlias: true },
    });

    await page.goto(`/app/jobs/${jobSlug}?tab=purchases&p=ytd`);
    const beforeJobSpend = cents(await page.locator('[data-kpi="value"]').textContent()) ?? 0;

    await page.goto("/app/accounting/purchases?p=ytd");
    const banner = page.getByRole("region", { name: "Unassigned register names" });
    await expect(banner).toBeVisible();
    const row = banner.getByRole("listitem").filter({ hasText: "BAMBI BACKYARD" });
    await expect(row).toBeVisible();

    try {
      await row.getByRole("combobox").selectOption(jobSlug);
      await row.getByRole("button", { name: "Save rule" }).click();
      await expect(banner.getByRole("listitem").filter({ hasText: "BAMBI BACKYARD" })).toHaveCount(0);

      await page.goto(`/app/jobs/${jobSlug}?tab=purchases&p=ytd`);
      const afterJobSpend = cents(await page.locator('[data-kpi="value"]').textContent()) ?? 0;
      expect(afterJobSpend).toBe(beforeJobSpend + 67_200);
    } finally {
      // Restore BAMBI BACKYARD to unassigned so reruns find it in the banner
      await page.request.patch("/api/accounting/purchases", {
        data: { action: "alias_rule", jobKey: "bambi backyard", jobId: null, clearAlias: true },
      });
    }
  });

  test("A line item on a receipt trip page is re-tagged to a different trade and shows Manual override", async ({ owner: page }) => {
    await page.goto("/app/accounting/purchases?p=mtd");
    const firstLink = page.locator('[data-table="purchases-items-mtd"] tbody tr a').first();
    const tripHref = (await firstLink.getAttribute("href")) ?? "";
    expect(tripHref).toContain("/app/accounting/purchases/trip/");

    await page.goto(tripHref);
    const select = page.getByLabel("Trade category").first();
    const originalTrade = await select.inputValue();
    const nextTrade = originalTrade === "framing" ? "drywall" : "framing";

    try {
      await select.selectOption(nextTrade);
      await expect(page.getByText("Saved").first()).toBeVisible();
      await page.reload();
      expect(await page.getByLabel("Trade category").first().inputValue()).toBe(nextTrade);
    } finally {
      await page.getByLabel("Trade category").first().selectOption(originalTrade);
      await expect(page.getByText("Saved").first()).toBeVisible();
    }
  });

  test("Exporting Purchases to CSV downloads a file matching the table rows", async ({ owner: page }) => {
    await page.goto("/app/accounting/purchases?p=wtd");
    const table = page.locator('[data-table="purchases-items-wtd"]');
    const rows = Number(await table.locator("[data-rows]").getAttribute("data-rows"));
    expect(rows).toBeGreaterThan(0);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      table.getByRole("button", { name: "CSV" }).click(),
    ]);
    const csv = readFileSync((await download.path())!, "utf8").replace(/^\uFEFF/, "").trim().split(/\r?\n/);
    expect(csv[0]).toContain("Item");
    expect(csv.length - 1).toBe(rows);
  });
});
