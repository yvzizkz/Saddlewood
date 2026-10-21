// Old Expenses retired (cleanup Batch 2): the bot's Zelle payments and texted
// receipts land in purchases (0053) through /api/expenses, which keeps the
// shape the KB bot sends. An owner tags them on Purchases > Tag spend; the
// bot's "Z12 Jury Materials" links through the register-name rules. Rows are
// removed after.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { localDay } from "../src/lib/crew/time";
import { expect, test } from "./support/env";

const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = (q: string) => execSync(`psql "${DB}" -qAtc ${JSON.stringify(q)}`, { encoding: "utf8" }).trim();
const TOKEN = /^OPS_AGENT_TOKEN=(.*)$/m.exec(readFileSync(".env.local", "utf8"))?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
const JOB = "8009-n-ironwood-dr"; // alias "jury" points here in the local seed

test.describe("Old Expenses: one spend ledger", () => {
  test("the bot's Zelle payments land in purchases; owners tag them; the old page redirects", async ({ owner: page }) => {
    expect(TOKEN.length, "OPS_AGENT_TOKEN in .env.local").toBeGreaterThanOrEqual(16);
    const base = 9_000_000 + (Date.now() % 900_000);
    const day = localDay();
    const zelle = (n: number, recipient: string) => ({
      id: `z-${n}`, n, source: "zelle", direction: "out", date: day, amount: 812.5, recipient, memo: "E2E spend",
      transactionId: `e2e${n}`, status: "pending", project: null, expenseType: null, notes: "Chase Zelle disbursement",
    });
    const bot = (body: unknown) =>
      page.request.post("/api/expenses", { headers: { Authorization: `Bearer ${TOKEN}`, "X-Ops-Actor": "bot" }, data: body });
    const row = (n: number) => sql(`select coalesce(job_id, '-') || '|' || job_manual || '|' || coalesce(meta->>'ignored', '-') || '|' || line_total_cents from public.purchases where source_key = 'expense:z-${n}:1'`);

    try {
      // accounting.py: a new payment, sent twice (the second is a no-op), and its bare number (nothing to enter).
      const first = await bot({ action: "add", expense: zelle(base, "E2E Tagger"), via: "text" });
      expect(first.status()).toBe(201);
      expect((await first.json()).item).toMatchObject({ id: `z-${base}`, status: "pending", amount: 812.5 });
      expect((await bot({ action: "add", expense: zelle(base, "E2E Tagger") })).status()).toBe(200);
      expect(sql(`select count(*) from public.purchases where source_key = 'expense:z-${base}:1'`)).toBe("1");
      expect(row(base)).toBe("-|false|-|81250");
      expect((await bot({ action: "add", n: base + 9 })).status()).toBe(422);
      // crew.py: an app receipt is already app:<entry> in purchases; nothing is added.
      const app = await bot({ action: "add", expense: { id: `r-${base + 8}`, n: base + 8, source: "receipt", date: day, amount: 5, appEntry: base } });
      expect(app.status()).toBe(200);
      expect(sql(`select count(*) from public.purchases where source_key = 'expense:r-${base + 8}:1'`)).toBe("0");

      // An owner: the old page lands on Tag spend; put the payment on a job.
      await page.goto("/internal/expenses");
      await expect(page).toHaveURL(/\/app\/accounting\/purchases#tag-spend$/);
      const line = page.getByTestId(`tag-expense-z-${base}-1`);
      await expect(line).toContainText("Zelle to E2E Tagger: E2E spend");
      await line.getByRole("combobox").selectOption(JOB);
      await line.getByRole("button", { name: "Save" }).click();
      await expect(line).toHaveCount(0);
      expect(row(base)).toBe(`${JOB}|true|-|81250`);

      // "Not a job": set aside.
      await bot({ action: "add", expense: zelle(base + 1, "E2E Overhead") });
      await page.reload();
      const other = page.getByTestId(`tag-expense-z-${base + 1}-1`);
      await other.getByRole("combobox").selectOption("__ignore__");
      await other.getByRole("button", { name: "Save" }).click();
      await expect(other).toHaveCount(0);
      expect(row(base + 1)).toBe("-|true|true|81250");

      // The bot's text answers: "Z<n> Jury Materials" links through the alias; "Z<n> dismiss" sets aside.
      await bot({ action: "add", expense: zelle(base + 2, "E2E Texted") });
      const cat = await bot({ action: "categorize", n: base + 2, project: "Jury", expenseType: "Materials", via: "text" });
      expect(cat.status()).toBe(200);
      expect((await cat.json()).item).toMatchObject({ status: "categorized", expenseType: "Materials" });
      expect(row(base + 2)).toBe(`${JOB}|false|-|81250`);
      await bot({ action: "add", expense: zelle(base + 3, "E2E Dismissed") });
      expect((await bot({ action: "dismiss", n: base + 3, via: "text" })).status()).toBe(200);
      expect(row(base + 3)).toBe("-|false|true|81250");
      expect((await bot({ action: "dismiss", n: base + 7 })).status()).toBe(404);

      // The ledger counts them as spend on the job.
      await page.goto(`/app/accounting/purchases?job=${JOB}`);
      await expect(page.getByRole("link", { name: "Zelle to E2E Tagger: E2E spend" }).first()).toBeVisible();

      // Phone width: Tag spend fits.
      await bot({ action: "add", expense: zelle(base + 4, "E2E Phone") });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/app/accounting/purchases#tag-spend");
      await expect(page.getByTestId(`tag-expense-z-${base + 4}-1`)).toBeVisible();
      const w = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
      expect(w.s).toBeLessThanOrEqual(w.c);
    } finally {
      sql(`delete from public.purchases where source_key like 'expense:%' and description like 'Zelle to E2E %'`);
    }
  });
});
