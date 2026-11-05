// The bot issues invoices with no job on them, only a number, and an issued
// document's job can't be set afterward. So every reader places a bill the way
// the money card does (jobMoney.ts): its own job, else its number's prefix. The
// client's link adds one rule, because it's the client's page: same client too.

import { execSync } from "node:child_process";

import { expect, test } from "./support/env";

const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = (q: string) => execSync(`psql "${DB}" -qAtc ${JSON.stringify(q)}`, { encoding: "utf8" }).trim();

test.describe("A bill with no job, only a number", () => {
  test("shows on its job, in Job Costing and on that client's link", async ({ owner: page, browser }) => {
    const n = Date.now().toString().slice(-8);
    const prefix = `77${n}`;
    const [client, other] = sql("select id from public.clients order by id limit 2").split("\n");
    const job = sql(`insert into public.jobs (name, number_prefix, client_id) values ('E2E by number ${n}', '${prefix}', '${client}') returning id`).split("\n")[0];
    const token = `${n}`.padEnd(32, "a");
    const bill = (number: string, who: string, t: string) =>
      sql(`insert into public.documents (kind, client_id, number, title, status, total_cents, token, issued_at, issued_by) values ('invoice', '${who}', '${number}', 'E2E ${n}', 'issued', 987600, '${t}', now(), 'E2E')`);
    const clientCtx = await browser.newContext();
    try {
      bill(`${prefix}-01`, client, `${n}`.padEnd(32, "b"));
      // The same prefix on another client's bill: a typing slip, and never something this client should see.
      bill(`${prefix}-02`, other, `${n}`.padEnd(32, "c"));
      sql(`insert into public.client_portals (job_id, token, sections, created_by) values ('${job}', '${token}', '{documents}', 'E2E')`);

      await page.goto(`/app/jobs/${job}?tab=money`, { waitUntil: "networkidle" });
      await expect(page.getByRole("link", { name: `${prefix}-01` }).first()).toBeVisible();
      await expect(page.getByText("$9,876.00").locator("visible=true").first()).toBeVisible();

      await page.goto("/app/accounting/job-costing", { waitUntil: "networkidle" });
      await expect(page.getByRole("row", { name: new RegExp(`E2E by number ${n}`) }).first()).toContainText("$19,752.00");

      const link = await clientCtx.newPage();
      await link.goto(`/c/${token}`);
      await expect(link.getByText(`${prefix}-01`)).toBeVisible();
      await expect(link.getByText(`${prefix}-02`)).toHaveCount(0);
    } finally {
      await clientCtx.close();
      sql(`begin; set local session_replication_role = replica; delete from public.client_portals where job_id = '${job}'; delete from public.documents where number like '${prefix}-%'; delete from public.jobs where id = '${job}'; commit;`);
    }
  });
});
