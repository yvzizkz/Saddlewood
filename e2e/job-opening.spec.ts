// The January move: a job comes in from Joist or a tracker with its contract and
// one figure for what was billed and paid in full before the app. Powell's real
// numbers: $817,980.97 contract, $613,172.83 settled through #3526-12, and
// #3526-13's $30,000 is the one real bill in the app.

import { execSync } from "node:child_process";

import { PM, expect, signIn, test } from "./support/env";

const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = (q: string) => execSync(`psql "${DB}" -qAtc ${JSON.stringify(q)}`, { encoding: "utf8" }).trim();

test.describe("A job's opening", () => {
  test("an owner enters it once, it counts in Billed and Paid, and it can't count a bill twice", async ({ owner: page, browser }) => {
    const n = Date.now().toString().slice(-8);
    const prefix = `66${n}`;
    const client = sql("select id from public.clients order by id limit 1");
    const job = sql(`insert into public.jobs (name, number_prefix, client_id) values ('E2E opening ${n}', '${prefix}', '${client}') returning id`).split("\n")[0];
    sql(`insert into public.documents (kind, client_id, number, title, status, total_cents, token, issued_at, issued_by) values ('invoice', '${client}', '${prefix}-13', 'Draw 13', 'issued', 3000000, '${`${n}`.padEnd(32, "d")}', '2026-11-04T17:00:00Z', 'E2E')`);
    const pmCtx = await browser.newContext();
    try {
      await page.goto(`/app/jobs/${job}?tab=money`, { waitUntil: "networkidle" });
      const card = page.getByRole("region", { name: "Before the app" });
      await card.getByRole("button", { name: "Enter it" }).click();
      await card.getByLabel("Contract, with change orders").fill("817,980.97");
      await card.getByLabel("Billed and paid in full before the app").fill("613,172.83");
      await card.getByLabel("Where the figure came from").fill("Powell tracker #3526-12");

      // Dated on or after the bill in the app, the figure would hold it twice.
      await card.getByLabel("Through").fill("2026-11-04");
      await card.getByRole("button", { name: "Save" }).click();
      await expect(card.getByRole("alert")).toContainText(`${prefix}-13 would count twice`);

      await card.getByLabel("Through").fill("2026-10-30");
      await card.getByRole("button", { name: "Save" }).click();
      await expect(card).toContainText("Includes $613,172.83 billed and paid before the app");

      const figure = (label: string) => page.locator("dl > div", { has: page.locator("dt", { hasText: new RegExp(`^${label}$`) }) }).locator("dd");
      await expect(figure("Contract")).toHaveText("$817,980.97");
      await expect(figure("Billed")).toHaveText("$643,172.83");
      await expect(figure("Collected")).toHaveText("$613,172.83");
      await expect(figure("Open")).toHaveText("$30,000.00");
      await expect(figure("Left to bill")).toHaveText("$174,808.14");

      // The money card reads the same totals, and a client's Payments will too.
      const api = await (await page.request.get(`/api/crew/projects/money?job=${job}`)).json();
      expect(api.money).toMatchObject({ contractCents: 81_798_097, billedCents: 64_317_283, paidCents: 61_317_283, owedCents: 3_000_000 });

      // A change keeps the old row: the newest counts, the trail stays.
      await card.getByRole("button", { name: "Change" }).click();
      await card.getByLabel("Billed and paid in full before the app").fill("613,000");
      await card.getByRole("button", { name: "Save" }).click();
      await expect(card).toContainText("Includes $613,000.00");
      expect(sql(`select count(*) from public.job_openings where job_id = '${job}'`)).toBe("2");

      // A PM can't write it.
      await signIn(pmCtx, PM, { crew: true });
      const pm = await pmCtx.newPage();
      const put = await pm.request.put(`/api/jobs/${job}/opening`, { data: { contractCents: 1, settledCents: 0, asOf: "2026-10-30", source: "x" } });
      expect(put.status()).toBe(403);
    } finally {
      await pmCtx.close();
      sql(`begin; set local session_replication_role = replica; delete from public.documents where number like '${prefix}-%'; delete from public.jobs where id = '${job}'; commit;`);
    }
  });
});
