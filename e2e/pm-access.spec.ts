// PM access (docs/SCENARIOS.md §3): what a project manager's seat can and
// can't open in Accounting. Signed in as the synthetic PM, a crew-marked seat
// with money.view and projects.mine. Local stack only (support/env.ts).

import { execSync } from "node:child_process";

import { cents, expect, hours, PM, signIn, test as base } from "./support/env";

const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = (q: string) => execSync(`psql "${DB}" -qAtc ${JSON.stringify(q.replace(/\s+/g, " "))}`, { encoding: "utf8" }).trim();

const test = base.extend<{ pm: import("@playwright/test").Page }>({
  pm: async ({ context, page }, provide) => {
    await signIn(context, PM, { crew: true });
    await provide(page);
  },
});

const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Phoenix" });
const monthFirst = `${today.slice(0, 7)}-01`;

test.describe("PM access: his jobs, no pay, no payables", () => {
  test.beforeAll(() => {
    sql(`delete from crew_shifts where client_in like 'e2e-pm-access-%'`);
    // Evening shifts: the seed's day shifts end by 15:00, so these never overlap a seeded shift for the same person.
    const days = monthFirst === today ? [today] : [monthFirst, today];
    for (const day of days) {
      sql(`
        insert into crew_shifts (email, job_id, job_name, day, started_at, ended_at, break_min, trade, note, source, end_source, status, client_in)
        values
          ('tacho.framing@example.com', '9146-w-hutton-dr', '9146 W Hutton Dr (Bellevue AC938)', '${day}',
           ('${day}'::date + time '18:00') at time zone 'America/Phoenix',
           ('${day}'::date + time '20:30') at time zone 'America/Phoenix',
           0, 'framing', 'e2e pm-access PM job shift', 'app', 'app', 'ok', 'e2e-pm-access-pm-${day}'),
          ('omar.runner@example.com', '4125-e-camelback-rd', '4125 E Camelback Rd (Carder AFT 129)', '${day}',
           ('${day}'::date + time '18:00') at time zone 'America/Phoenix',
           ('${day}'::date + time '20:00') at time zone 'America/Phoenix',
           0, 'general', 'e2e pm-access non-PM job shift', 'app', 'app', 'ok', 'e2e-pm-access-other-${day}')
      `);
    }
  });

  test.afterAll(() => {
    sql(`delete from crew_shifts where client_in like 'e2e-pm-access-%'`);
  });

  test("opens Overview, Payroll, Purchases, Receivables and Billing; the section row lists only those", async ({ pm: page }) => {
    for (const path of ["/app/accounting", "/app/accounting/payroll?p=mtd", "/app/accounting/purchases?p=ytd", "/app/accounting/receivables", "/app/accounting/billing?p=ytd"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      expect(page.url()).toContain(path.split("?")[0]);
    }
    const sections = await page.getByRole("navigation", { name: "Accounting sections" }).getByRole("link").allTextContents();
    expect(sections).toEqual(["Overview", "Payroll", "Purchases", "Receivables", "Billing"]);
  });

  test("is turned away from Payables, Job costing and Departments", async ({ pm: page }) => {
    for (const path of ["/app/accounting/payables", "/app/accounting/job-costing", "/app/departments"]) {
      await page.goto(path);
      expect(new URL(page.url()).pathname, path).toBe("/app");
    }
  });

  test("sees hours on his jobs only, and never labor dollars, even when he asks", async ({ owner: page, browser }) => {
    await page.goto("/app/accounting/payroll?p=mtd");
    const ownerHours = hours(await page.locator('[data-kpi="value"]').textContent())!;

    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await signIn(ctx, PM, { crew: true });
    const pm = await ctx.newPage();
    await pm.goto("/app/accounting/payroll?p=mtd&m=cost");
    const pmHours = hours(await pm.locator('[data-kpi="value"]').textContent())!;
    expect(pmHours).toBeGreaterThan(0);
    expect(pmHours).toBeLessThan(ownerHours);
    await expect(pm.getByText("Labor cost")).toHaveCount(0);
    await expect(pm.getByRole("link", { name: "Cost" })).toHaveCount(0);
    await ctx.close();
  });

  test("opens his own job's invoice read only, and another job's invoice is not there", async ({ pm: page }) => {
    await page.goto("/app/accounting/receivables");
    const own = page.locator('[data-table="receivables-open"] tbody tr').first().getByRole("link").first();
    const href = (await own.getAttribute("href")) ?? "";
    await page.goto(href);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(/Record (a )?payment/i)).toHaveCount(0);
    await expect(page.getByLabel("Lien waiver")).toHaveCount(0);

    // 4125 Camelback has no PM: its invoices are not his.
    const other = await page.goto("/app/money/a1000001-0000-4000-8000-000000004103");
    expect(other?.status()).toBe(404);
  });

  test("Receivables is narrower than the owner's", async ({ owner: page, browser }) => {
    await page.goto("/app/accounting/receivables");
    const ownerOpen = cents(await page.locator('[data-kpi="value"]').textContent())!;
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await signIn(ctx, PM, { crew: true });
    const pm = await ctx.newPage();
    await pm.goto("/app/accounting/receivables");
    const pmOpen = cents(await pm.locator('[data-kpi="value"]').textContent())!;
    expect(pmOpen).toBeGreaterThan(0);
    expect(pmOpen).toBeLessThan(ownerOpen);
    await ctx.close();
  });
});
