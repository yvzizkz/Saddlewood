// Finance: the AFT billing week (docs/SCENARIOS.md §1). Ilene's week around
// AFT's 23rd cutoff, driven through the screens she uses, asserting the
// numbers on each. Local stack only (support/env.ts).

import { readFileSync } from "node:fs";

import { cents, expect, hours, test } from "./support/env";

const JOB = "8009-n-ironwood-dr";

test.describe("Finance: the AFT billing week", () => {
  test("Billing shows AFT's cutoff, what goes with it, and the PM's date before it", async ({ owner: page }) => {
    await page.goto("/app/accounting/billing?p=ytd");
    const cal = page.getByRole("region", { name: "Billing calendar" });
    const aft = cal.getByRole("listitem").filter({ hasText: "A Finer Touch" });
    await expect(aft).toContainText("Closes the 23rd");
    await expect(aft).toContainText("Conditional waiver");
    await expect(aft).toContainText("% complete by");
    // The same dates are in Tasks: the PM's % complete and Finance's package.
    await page.goto("/app/tasks?view=all");
    const table = page.locator('[data-table="tasks-all"]');
    await table.getByRole("searchbox").fill("A Finer Touch");
    await expect(table.getByRole("row").filter({ hasText: "% complete and photos for A Finer Touch" })).toHaveCount(1);
    await expect(table.getByRole("row").filter({ hasText: "Invoice package for A Finer Touch" })).toHaveCount(1);
  });

  test("a change in the field goes from request to price to signed to billed, and Finance is told to bill it", async ({ owner: page }) => {
    const title = `E2E blocking ${Date.now()}`;
    await page.goto(`/app/jobs/${JOB}?tab=changes`);
    await page.getByRole("button", { name: "Record a change" }).click();
    await page.getByLabel("What changed").fill(title);
    await page.getByRole("button", { name: "Save" }).click();
    const row = page.getByRole("listitem").filter({ hasText: title });
    await expect(row).toContainText("Awaiting price");

    await row.getByPlaceholder("$ price").fill("1840");
    await row.getByRole("button", { name: "Price it" }).click();
    await expect(row).toContainText(/CO-\d+/);
    await expect(row).toContainText("Priced, not sent");
    const number = (await row.textContent())?.match(/CO-\d+/)?.[0] ?? "";

    await row.getByRole("button", { name: "Signed" }).click();
    await expect(row).toContainText("Signed, not billed");

    // Finance now has it to bill.
    await page.goto("/app/tasks?view=all");
    const tasks = page.locator('[data-table="tasks-all"]');
    await tasks.getByRole("searchbox").fill(title);
    await expect(tasks.getByRole("row").filter({ hasText: `Bill ${number}` })).toContainText("Finance");

    await page.goto(`/app/jobs/${JOB}?tab=changes`);
    await page.getByRole("listitem").filter({ hasText: title }).getByRole("button", { name: "Billed" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: title })).toHaveCount(0);
    await page.goto("/app/tasks?view=all");
    await page.locator('[data-table="tasks-all"]').getByRole("searchbox").fill(title);
    await expect(page.locator('[data-table="tasks-all"]').getByRole("row").filter({ hasText: `Bill ${number}` })).toHaveCount(0);
  });

  test("a waiver owed on an AFT invoice is recorded on the invoice and leaves the register and Finance's tasks", async ({ owner: page }) => {
    await page.goto("/app/accounting/billing?p=ytd");
    const register = page.locator('[data-table="lien-waivers"]');
    const missing = register.getByRole("row").filter({ hasText: "A Finer Touch" }).filter({ hasText: "Missing" }).first();
    await expect(missing).toBeVisible();
    const link = missing.getByRole("link").first();
    const number = (await link.textContent())?.trim() ?? "";
    const href = (await link.getAttribute("href")) ?? "";
    const docId = href.split("/").pop() ?? "";

    await page.goto(href);
    const panel = page.getByLabel("Lien waiver");
    await expect(panel).toContainText("Missing");
    await panel.getByRole("button", { name: "Signed copy back" }).click();
    await expect(panel).toContainText("Received");

    await page.goto("/app/accounting/billing?p=ytd");
    await expect(page.locator('[data-table="lien-waivers"]').getByRole("row").filter({ hasText: number }).first()).toContainText("Received");
    await page.goto("/app/tasks?view=all");
    await page.locator('[data-table="tasks-all"]').getByRole("searchbox").fill(`Waiver for ${number}`);
    await expect(page.locator('[data-table="tasks-all"]').getByRole("row").filter({ hasText: `Waiver for ${number}` })).toHaveCount(0);

    // Put it back so the next run finds it owed again.
    const list = await (await page.request.get(`/api/waivers?document=${docId}`)).json();
    for (const w of list.waivers ?? []) await page.request.patch("/api/waivers", { data: { id: w.id, status: "void" } });
  });

  test("Receivables: the headline is the rows, narrowing to AFT keeps AFT, and Melio's fee is apart", async ({ owner: page }) => {
    await page.goto("/app/accounting/receivables");
    const headline = cents(await page.locator('[data-kpi="value"]').textContent());
    const footer = cents(await page.locator('[data-table="receivables-open"] [data-total="balance"]').textContent());
    expect(headline).not.toBeNull();
    expect(headline).toBe(footer);

    await page.getByRole("link", { name: /^A Finer Touch.*Show only/ }).click();
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("A Finer Touch");
    const clients = await page.locator('[data-table="receivables-open"] tbody tr td:nth-child(3)').allTextContents();
    expect(clients.length).toBeGreaterThan(0);
    for (const c of clients) expect(c).toContain("A Finer Touch");

    await page.goto("/app/accounting/receivables?m=collected&p=ytd");
    const gross = cents(await page.locator('[data-kpi="value"]').textContent())!;
    const fees = cents(await page.locator('[data-stat="Fees"]').textContent())!;
    const net = cents(await page.locator('[data-stat="Net"]').textContent())!;
    expect(gross - fees).toBe(net);
  });

  test("Payables: Friday's pay run, and a sub bill without its waiver is held", async ({ owner: page }) => {
    await page.goto("/app/accounting/payables");
    await expect(page.locator('[data-stat="Ready for Friday run"]')).toHaveText(/\$/);
    await expect(page.getByText(/On hold|hold/i).first()).toBeVisible();
  });

  test("Payroll week to date: trades add up to the total, and the CSV is the table", async ({ owner: page }) => {
    await page.goto("/app/accounting/payroll?p=wtd");
    const total = hours(await page.locator('[data-kpi="value"]').textContent())!;
    const bars = await page.getByRole("list", { name: "By trade" }).getByRole("listitem").allTextContents();
    const sum = bars.map((t) => hours(t.match(/([\d,.]+) h/)?.[1])).reduce((a: number, h) => a + (h ?? 0), 0);
    expect(Math.abs(sum - total)).toBeLessThan(0.11 * bars.length + 0.01);

    const rows = Number(await page.locator('[data-table="payroll-wtd"] [data-rows]').getAttribute("data-rows"));
    const [download] = await Promise.all([page.waitForEvent("download"), page.locator('[data-table="payroll-wtd"]').getByRole("button", { name: "CSV" }).click()]);
    const csv = readFileSync((await download.path())!, "utf8").replace(/^﻿/, "").trim().split(/\r?\n/);
    expect(csv[0]).toContain("Hours");
    expect(csv.length - 1).toBe(rows);
  });
});
