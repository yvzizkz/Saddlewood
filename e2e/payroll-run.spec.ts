// The Wednesday run (docs/SCENARIOS.md): Finance starts from a real payroll email
// (KB #435038), saves it, and gets the same email to send the accountant. Next
// week starts from it, and a one-off company gets added with its note (KB #455577).

import { execSync } from "node:child_process";

import { PM, expect, signIn, test } from "./support/env";

const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = (q: string) => execSync(`psql "${DB}" -qAtc ${JSON.stringify(q)}`, { encoding: "utf8" }).trim();

const OCT_23 = "Employees:\nFiliberto Villegas: 70.33 hours\nSubs:\nArnold Mujica: $1,489.25\nOmar Peña: $3,390\nRolando Vite: $500\nEli Lugo: $3,000\nAngel Lopez: $1,500\nThank you\nIlene";

test.describe("The Wednesday payroll run", () => {
  test("starts from a real email, gives it back, and carries to next week", async ({ owner: page, browser }) => {
    // Far from any real run, so the two dates are the only ones here.
    const first = "2098-10-24";
    const next = "2098-10-31";
    const pmCtx = await browser.newContext();
    try {
      await page.goto("/app/accounting/payroll", { waitUntil: "networkidle" });
      await expect(page.getByRole("link", { name: "Wednesday run" })).toHaveAttribute("href", "/app/accounting/payroll/run");

      await page.goto(`/app/accounting/payroll/run?date=${first}`, { waitUntil: "networkidle" });
      await page.getByLabel("A past payroll email").fill(OCT_23);
      await page.getByRole("button", { name: "Start from this email" }).click();
      await page.getByRole("button", { name: "Save the run" }).click();
      await expect(page.getByLabel("Email to the accountant")).toHaveText(OCT_23);
      await expect(page.getByText("Payroll 10/24/98")).toBeVisible();

      await page.goto(`/app/accounting/payroll/run?date=${next}`, { waitUntil: "networkidle" });
      await expect(page.getByText(/Started from/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Save the run" })).toBeDisabled();
      await expect(page.getByText("Filiberto Villegas: fill in the hours")).toBeVisible();
      await page.getByRole("button", { name: "Take Filiberto Villegas off" }).click();

      await page.getByRole("button", { name: "Add a person" }).click();
      await page.getByLabel("Name").last().fill("Belico’s Mora LLC");
      await page.getByLabel("Amount").last().fill("1,600");
      await page.getByLabel("Note").last().fill("W9 attached");
      await page.getByRole("button", { name: "Save the run" }).click();
      const email = page.getByLabel("Email to the accountant");
      await expect(email).toContainText("Omar Peña: $3,390");
      await expect(email).toContainText("Belico’s Mora LLC: $1,600 (W9 attached)");
      await expect(email).not.toContainText("Employees:");

      await signIn(pmCtx, PM, { crew: true });
      const pm = await pmCtx.newPage();
      expect((await pm.request.put("/api/accounting/payroll-run", { data: { payDate: next, lines: [] } })).status()).toBe(403);
      await pm.goto(`/app/accounting/payroll/run?date=${first}`);
      await expect(pm).not.toHaveURL(/payroll\/run/);
      await expect(pm.getByRole("link", { name: "Wednesday run" })).toHaveCount(0);
    } finally {
      await pmCtx.close();
      sql(`delete from public.payroll_runs where pay_date in ('${first}', '${next}')`);
    }
  });
});
