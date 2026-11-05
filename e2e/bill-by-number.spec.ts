// The bot issues invoices with no job on them, only a number, and an issued
// document's job can't be set afterward. So every reader places a bill the way
// the money card does (jobMoney.ts): its own job, else its number's prefix. The
// client's link adds one rule, because it's the client's page: same client too.

import { execSync } from "node:child_process";

import { PM, expect, signIn, test } from "./support/env";

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

  test("a PM opens one on their job and still can't open one on another job", async ({ browser }) => {
    const n = Date.now().toString().slice(-8);
    const [mine, name, prefix] = sql("select id, name, number_prefix from public.jobs where crew_job_id = '5203-n-monte-vista'").split("|");
    const otherPrefix = `78${n}`;
    const other = sql(`insert into public.jobs (name, number_prefix) values ('E2E not the PM''s ${n}', '${otherPrefix}') returning id`).split("\n")[0];
    const client = sql("select id from public.clients order by id limit 1");
    const bill = (number: string, t: string) =>
      sql(`insert into public.documents (kind, client_id, number, title, status, total_cents, token, issued_at, issued_by) values ('invoice', '${client}', '${number}', 'E2E ${n}', 'issued', 50000, '${t}', now(), 'E2E') returning id`).split("\n")[0];
    const ctx = await browser.newContext();
    try {
      expect(mine, "the seed's job has a number prefix").toBeTruthy();
      const onMine = bill(`${prefix}-${n}`, `${n}`.padEnd(32, "d"));
      const onOther = bill(`${otherPrefix}-01`, `${n}`.padEnd(32, "e"));
      await signIn(ctx, PM, { crew: true });
      const pm = await ctx.newPage();

      await pm.goto(`/app/money/${onMine}`, { waitUntil: "networkidle" });
      await expect(pm.getByRole("heading", { name: `${prefix}-${n}` })).toBeVisible();
      await expect(pm.getByRole("link", { name: `Job: ${name}` })).toBeVisible();

      // Every door a PM has into it, not just the address.
      await pm.goto(`/app/jobs/${mine}?tab=money`, { waitUntil: "networkidle" });
      await pm.getByRole("link", { name: `${prefix}-${n}` }).first().click();
      await expect(pm).toHaveURL(new RegExp(onMine));
      await expect(pm.getByRole("heading", { name: `${prefix}-${n}` })).toBeVisible();

      const res = await pm.goto(`/app/money/${onOther}`);
      expect(res?.status()).toBe(404);
    } finally {
      await ctx.close();
      sql(`begin; set local session_replication_role = replica; delete from public.documents where title = 'E2E ${n}'; delete from public.jobs where id = '${other}'; commit;`);
    }
  });
});
