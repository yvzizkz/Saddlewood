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

  test("a first run on a week with clock data: paste it, link who it can't, and flat stays flat", async ({ owner: page }) => {
    const first = "2098-11-07";
    const next = "2098-11-14";
    const nextWeek = "2098-11-07"; // Monday-to-Sunday week before each pay date
    const firstWeek = "2098-10-31";
    const shift = (email: string, name: string, day: string, hours: number) =>
      `insert into public.crew_shifts (email, job_id, job_name, day, started_at, ended_at, status) values ('${email}', '8009-n-ironwood-dr', 'E2E', '${day}', '${day}T15:00:00Z', timestamptz '${day}T15:00:00Z' + interval '${hours} hours', 'ok');`;
    const people = [["filiberto.framing@example.com", "Filiberto Villegas", 40], ["omar.runner@example.com", "Omar Pena", 2], ["arnold.framing@example.com", "Arnoldo Mujica", 30]] as const;
    sql(people.map(([e, n, h]) => shift(e, n, firstWeek, h) + shift(e, n, nextWeek, h)).join(" "));
    try {
      await page.goto(`/app/accounting/payroll/run?date=${first}`, { waitUntil: "networkidle" });
      const flagged = page.getByRole("region", { name: "On the clock, not on this run" });
      await expect(flagged).toContainText("Filiberto Villegas, 40 hours");
      await expect(page.getByLabel("Name")).toHaveCount(0);

      await page.getByLabel("A past payroll email").fill(OCT_23);
      await page.getByRole("button", { name: "Start from this email" }).click();
      await expect(page.getByLabel("A past payroll email")).toHaveCount(0);
      // Filiberto stays by hours, Omar Peña is Omar Pena, and Arnoldo the app won't guess.
      await expect(page.getByLabel("Name").first()).toHaveValue("Filiberto Villegas");
      await expect(page.getByLabel("Paid as").first()).toHaveValue("employee");
      await expect(flagged).toContainText("Arnoldo Mujica");
      await expect(flagged).not.toContainText("Omar Pena");
      await expect(flagged).not.toContainText("Filiberto");
      await page.getByLabel("Arnoldo Mujica is").selectOption({ label: "Arnold Mujica" });
      await expect(flagged).toHaveCount(0);
      await page.getByLabel("Paid as").nth(1).selectOption("rate");
      await page.getByRole("button", { name: "Save the run" }).click();
      await expect(page.getByLabel("Email to the accountant")).toHaveText(OCT_23);

      // Next week: one line each. Omar's flat $3,390 stays with 2 hours on the clock; Arnold's by-rate line moves and says so.
      await page.goto(`/app/accounting/payroll/run?date=${next}`, { waitUntil: "networkidle" });
      await expect(page.getByRole("region", { name: "On the clock, not on this run" })).toHaveCount(0);
      await expect(page.getByLabel("Name")).toHaveCount(6);
      await expect(page.getByLabel(/^Amount/).nth(1)).toHaveValue("3390.00");
      await expect(page.getByLabel(/^Amount/).first()).toHaveValue("960.00");
      await expect(page.getByText("Was $1,489.25")).toBeVisible();
      await page.getByRole("button", { name: "Save the run" }).click();
      const email = page.getByLabel("Email to the accountant");
      await expect(email).toContainText("Filiberto Villegas: 40 hours");
      await expect(email).toContainText("Arnold Mujica: $960");
      await expect(email).toContainText("Omar Peña: $3,390");
      await expect(email).not.toContainText("Pena");
      await expect(email).not.toContainText("Arnoldo");

      // Reopened, a saved figure is real: marking it by rate doesn't replace it with the clock's.
      await page.reload({ waitUntil: "networkidle" });
      await page.getByLabel("Paid as").nth(2).selectOption("rate");
      await expect(page.getByLabel(/^Amount/).nth(1)).toHaveValue("3390.00");
    } finally {
      sql(`delete from public.crew_shifts where job_name = 'E2E' and day in ('${firstWeek}', '${nextWeek}')`);
      sql(`delete from public.payroll_runs where pay_date in ('${first}', '${next}')`);
    }
  });

  test("on a carried run, marking a line or linking it fills it from the clock", async ({ owner: page }) => {
    const first = "2098-11-21";
    const next = "2098-11-28";
    const week = "2098-11-21";
    const shift = (email: string, hours: number) =>
      `insert into public.crew_shifts (email, job_id, job_name, day, started_at, ended_at, status) values ('${email}', '8009-n-ironwood-dr', 'E2E', '${week}', '${week}T15:00:00Z', timestamptz '${week}T15:00:00Z' + interval '${hours} hours', 'ok');`;
    sql([shift("omar.runner@example.com", 2), shift("filiberto.framing@example.com", 40), shift("arnold.framing@example.com", 30), shift("cesar.finish@example.com", 10)].join(" "));
    const line = (name: string, kind: string, hours: number | null, amountCents: number | null, byRate = false) => ({ name, kind, hours, amountCents, note: "", ...(byRate ? { byRate } : {}) });
    try {
      const saved = await page.request.put("/api/accounting/payroll-run", {
        data: { payDate: first, lines: [line("Omar Peña", "sub", null, 339_000), line("Filiberto Villegas", "sub", null, 150_000), line("A. Hours", "employee", 10, null), line("R. Rate", "sub", null, 50_000, true)] },
      });
      expect(saved.ok(), await saved.text()).toBeTruthy();

      await page.goto(`/app/accounting/payroll/run?date=${next}`, { waitUntil: "networkidle" });
      await expect(page.getByText(/Started from/)).toBeVisible();

      // A carried flat figure doesn't survive being marked by rate; the clock's does, and says what it replaced.
      await expect(page.getByLabel(/^Amount/).first()).toHaveValue("3390.00");
      await page.getByLabel("Paid as").first().selectOption("rate");
      await expect(page.getByLabel(/^Amount/).first()).toHaveValue("50.00");
      await expect(page.getByText("Was $3,390.00")).toBeVisible();

      await page.getByLabel("Paid as").nth(1).selectOption("employee");
      await expect(page.getByLabel(/^Hours/).first()).toHaveValue("40");

      // Linking fills a blank line, so it can be saved and nothing goes missing.
      await page.getByLabel("Arnoldo Mujica is").selectOption({ label: "A. Hours" });
      await expect(page.getByLabel(/^Hours/).nth(1)).toHaveValue("30");
      await page.getByLabel("Cesar Olivares is").selectOption({ label: "R. Rate" });
      await expect(page.getByLabel(/^Amount/).last()).toHaveValue("340.00");
      await expect(page.getByRole("region", { name: "On the clock, not on this run" })).toHaveCount(0);

      await page.getByRole("button", { name: "Save the run" }).click();
      const email = page.getByLabel("Email to the accountant");
      await expect(email).toContainText("Omar Peña: $50");
      await expect(email).toContainText("Filiberto Villegas: 40 hours");
      await expect(email).toContainText("A. Hours: 30 hours");
      await expect(email).toContainText("R. Rate: $340");

      // A new line isn't saved yet, so the email for the accountant goes until it is.
      await page.getByRole("button", { name: "Add a person" }).click();
      await expect(email).toHaveCount(0);

      const badDate = await page.request.put("/api/accounting/payroll-run", { data: { payDate: "2098-13-45", lines: [line("Omar Peña", "sub", null, 339_000)] } });
      expect(badDate.status()).toBe(400);
    } finally {
      sql(`delete from public.crew_shifts where job_name = 'E2E' and day = '${week}'`);
      sql(`delete from public.payroll_runs where pay_date in ('${first}', '${next}')`);
    }
  });
});
