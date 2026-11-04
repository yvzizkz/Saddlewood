// Finance: the AFT billing week (docs/SCENARIOS.md §1). Ilene's week around
// AFT's 23rd cutoff, driven through the screens she uses, asserting the
// numbers on each. Local stack only (support/env.ts).

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { cents, cutoffInDays, expect, hours, test } from "./support/env";

const JOB = "8009-n-ironwood-dr";
const CO_NUMBER = /(?:\d+-)?CO-?\d+/;
const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = (q: string) => execSync(`psql "${DB}" -qAtc ${JSON.stringify(q.replace(/\s+/g, " "))}`, { encoding: "utf8" }).trim();

test.describe("Finance: the AFT billing week", () => {
  test("Billing shows AFT's cutoff, what goes with it, and the PM's date before it", async ({ owner: page }) => {
    await page.goto("/app/accounting/billing?p=ytd");
    const cal = page.getByRole("region", { name: "Billing calendar" });
    const aft = cal.getByRole("listitem").filter({ hasText: "A Finer Touch" });
    await expect(aft).toContainText("Closes the 23rd");
    await expect(aft).toContainText("Conditional waiver");
    await expect(aft).toContainText("% complete by");
    // The same dates are in Tasks: the PM's % complete and Finance's package.
    // Set AFT's cutoff 3 days ahead of today so this check holds on every day of the month.
    try {
      await page.request.post(`/api/jobs/${JOB}/progress`, {
        data: { action: "cutoff", cutoffDay: cutoffInDays(3) },
      });
      await page.goto("/app/tasks?view=all");
      const table = page.locator('[data-table="tasks-all"]');
      await table.getByRole("searchbox").fill("A Finer Touch");
      await expect(table.getByRole("row").filter({ hasText: "% complete and photos for A Finer Touch" })).toHaveCount(1);
      await expect(table.getByRole("row").filter({ hasText: "Invoice package for A Finer Touch" })).toHaveCount(1);
    } finally {
      await page.request.post(`/api/jobs/${JOB}/progress`, {
        data: { action: "cutoff", cutoffDay: 23 },
      });
    }
  });

  test("a change in the field goes from request to price to signed to billed, and Finance is told to bill it", async ({ owner: page }) => {
    const title = `E2E blocking ${Date.now()}`;
    let coId: number | null = null;
    try {
      await page.goto(`/app/jobs/${JOB}?tab=changes`);
      await page.getByRole("button", { name: "Record a change" }).click();
      await page.getByLabel("What changed").fill(title);
      const waitCreate = page.waitForResponse(
        (r) => r.url().includes("/api/change-orders") && r.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Save" }).click();
      const createRes = await waitCreate;
      if (createRes.ok()) {
        const createBody = (await createRes.json()) as { id?: number };
        coId = createBody.id ?? null;
      }
      const row = page.getByRole("listitem").filter({ hasText: title });
      await expect(row).toContainText("Awaiting price");

      await row.getByPlaceholder("$ price").fill("1840");
      await row.getByRole("button", { name: "Price it" }).click();
      // A job with a street-number prefix numbers its COs <prefix>-CO<n> (8009-CO7), others CO-<n> (billing/numbering.ts).
      await expect(row).toContainText(CO_NUMBER);
      await expect(row).toContainText("Priced, not sent");
      // Nothing is sent from here: it goes out from its own page, or is signed on paper.
      await expect(row.getByRole("button", { name: "Sent" })).toHaveCount(0);
      const number = (await row.textContent())?.match(CO_NUMBER)?.[0] ?? "";

      await row.getByRole("button", { name: "Signed" }).click();
      await expect(row).toContainText("Signed, not billed");

      // Finance now has it to bill.
      await page.goto("/app/tasks?view=all");
      const tasks = page.locator('[data-table="tasks-all"]');
      await tasks.getByRole("searchbox").fill(title);
      await expect(tasks.getByRole("row").filter({ hasText: `Bill ${number}` })).toContainText("Finance");
      await expect(tasks.getByRole("link", { name: new RegExp(`Bill ${number}`) }).first()).toHaveAttribute("href", `/app/jobs/${JOB}?tab=money`);

      // Billed names its invoice: with none it is refused, and the row offers Bill it or an invoice already out.
      expect((await page.request.patch("/api/change-orders", { data: { id: coId, status: "billed" } })).status()).toBe(400);
      await page.goto(`/app/jobs/${JOB}?tab=changes`);
      const signed = page.getByRole("listitem").filter({ hasText: title });
      await expect(signed.getByRole("link", { name: "Bill it" })).toHaveAttribute("href", `/app/jobs/${JOB}?tab=money`);
      await expect(signed.getByRole("button", { name: "Billed" })).toBeDisabled();
      await signed.getByLabel("Already billed on").selectOption({ label: "8009-14" });
      await signed.getByRole("button", { name: "Billed" }).click();
      await expect(page.getByRole("listitem").filter({ hasText: title })).toHaveCount(0);
      await page.goto("/app/tasks?view=all");
      await page.locator('[data-table="tasks-all"]').getByRole("searchbox").fill(title);
      await expect(page.locator('[data-table="tasks-all"]').getByRole("row").filter({ hasText: `Bill ${number}` })).toHaveCount(0);
    } finally {
      // A billed change order has no way back, so the test row is taken out by hand.
      if (coId !== null) {
        sql(`begin; set local session_replication_role = replica;
             delete from change_order_events where change_order_id = ${coId};
             delete from joist_jobs where change_order_id = ${coId};
             delete from change_orders where id = ${coId};
             commit;`);
      }
    }
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
