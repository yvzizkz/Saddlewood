// A directive on an "Other job" log: the CO is on no job, so its title carries
// the typed name. The same ask on two Other jobs is two COs; the same log sent
// twice is one.

import { execSync } from "node:child_process";

import { PM, expect, signIn, test } from "./support/env";

const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = (q: string) => execSync(`psql "${DB}" -qAtc ${JSON.stringify(q)}`, { encoding: "utf8" }).trim();

test.describe("A directive on an Other job", () => {
  test("names the job in Tasks and Billing, and only the same job counts as a repeat", async ({ owner: page, browser }) => {
    const n = Date.now().toString().slice(-8);
    const ask = `E2E add a header ${n}`;
    const jobs = [`E2E Smith ${n}`, `E2E Jones ${n}`];
    const crew = await browser.newContext();
    await signIn(crew, PM, { crew: true });
    const eod = async (jobName: string, clientId: string) => {
      const res = await crew.request.post("/api/crew/act", { data: { kind: "eod.add", jobId: "other", jobName, done: "E2E framed", asked: ask, clientId } });
      expect(res.status()).toBe(200);
    };
    try {
      await eod(jobs[0], `e2e-${n}-a`);
      await eod(jobs[1], `e2e-${n}-b`);
      await eod(jobs[0], `e2e-${n}-a`); // The same log sent again.

      expect(sql(`select title from public.change_orders where title like '%${ask}' and job_id is null and crew_job_id is null order by id`).split("\n")).toEqual(jobs.map((j) => `${j}: ${ask}`));

      await page.goto("/app/tasks?view=all");
      const tasks = page.locator('[data-table="tasks-all"]');
      await tasks.getByRole("searchbox").fill(ask);
      await expect(tasks.getByRole("row").filter({ hasText: ask })).toHaveCount(2);
      for (const job of jobs) await expect(tasks.getByRole("row").filter({ hasText: `Price: ${job}: ${ask}` })).toHaveCount(1);

      await page.goto("/app/accounting/billing");
      for (const job of jobs) await expect(page.locator("#changes").getByText(`${job}: ${ask}`).first()).toBeVisible();
    } finally {
      await crew.close();
      sql(`delete from public.change_orders where title like '%${ask}'`);
      sql(`delete from public.crew_entries where client_id like 'e2e-${n}-%'`);
    }
  });
});
