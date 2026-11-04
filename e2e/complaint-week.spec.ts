// A client complaint (docs/SCENARIOS.md): logged on the job, one task with the
// job's PM on the Policies clock, up to Owner decisions when it runs late, and
// closed only with what was done, kept on the job.

import { execSync } from "node:child_process";

import { OWNER, PM, expect, signIn, test } from "./support/env";

const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = (q: string) => execSync(`psql "${DB}" -qAtc ${JSON.stringify(q)}`, { encoding: "utf8" }).trim();

const WITH_PM = "8009-n-ironwood-dr";

test.describe("A client complaint", () => {
  test("goes to the job's PM, moves up when late, and closes with what was done", async ({ owner: page, browser }) => {
    const n = Date.now().toString().slice(-8);
    const said = `E2E ceiling bubbling after the weekend rain ${n}`;
    const pmCtx = await browser.newContext();
    await signIn(pmCtx, PM, { crew: true });
    const pm = await pmCtx.newPage();
    try {
      // The office takes the call and logs it on the job.
      await page.goto(`/app/jobs/${WITH_PM}?tab=tasks`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Log a complaint" }).click();
      await page.getByLabel("What the client said").fill(said);
      await page.getByLabel("Who raised it, and how").fill("Homeowner, email to info@ with photos");
      await page.getByRole("button", { name: "Log it" }).click();
      const card = page.locator("#complaints").getByRole("listitem").filter({ hasText: said });
      await expect(card).toContainText("reply by");
      await expect(card).toContainText("Homeowner, email to info@ with photos");

      // Due the next business day: never a weekend, and at most three days out.
      const row = sql(`select role || '|' || assignee || '|' || (extract(isodow from due_on) < 6 and due_on - (now() at time zone 'America/Phoenix')::date between 1 and 3) from public.work_items where title = '${said}'`);
      expect(row).toBe(`pm|${PM}|true`);

      // One task, in Everyone and in the PM's Mine.
      await page.goto("/app/tasks?view=all");
      const tasks = page.locator('[data-table="tasks-all"]');
      await tasks.getByRole("searchbox").fill(said);
      await expect(tasks.getByRole("row").filter({ hasText: said })).toHaveCount(1);
      await expect(tasks.getByRole("row").filter({ hasText: said })).toContainText("Client complaint");

      await pm.goto("/app/tasks");
      const mine = pm.locator('[data-table="tasks-mine"]');
      await mine.getByRole("searchbox").fill(said);
      await expect(mine.getByRole("row").filter({ hasText: said })).toHaveCount(1);

      // The PM can't quietly push the date.
      const id = Number(sql(`select id from public.work_items where title = '${said}'`));
      expect((await pm.request.patch("/api/tasks", { data: { id, dueOn: "2030-01-01" } })).status()).toBe(403);
      expect((await pm.request.patch("/api/tasks", { data: { id, status: "done" } })).status()).toBe(400);

      // A day past due it is the owners' as well.
      sql(`update public.work_items set due_on = (now() at time zone 'America/Phoenix')::date - 2 where id = ${id}`);
      await page.goto("/app/tasks?view=all");
      await tasks.getByRole("searchbox").fill(said);
      await expect(tasks.getByRole("row").filter({ hasText: said })).toContainText("moved up from");

      // The PM closes it on the job with what was done, and the job keeps it.
      await pm.goto(`/app/jobs/${WITH_PM}?tab=tasks`, { waitUntil: "networkidle" });
      const pmCard = pm.locator("#complaints").getByRole("listitem").filter({ hasText: said });
      await expect(pmCard.getByRole("button", { name: "Drop" })).toHaveCount(0);
      await pmCard.getByRole("button", { name: "Done" }).click();
      await pmCard.getByLabel("What was done").fill("Walked it with the drywall lead, repair set for Tuesday");
      await pmCard.getByRole("button", { name: "Close it" }).click();
      await expect(pmCard).toContainText("Closed");
      await expect(pmCard).toContainText("Walked it with the drywall lead, repair set for Tuesday");
      await expect(pmCard.getByRole("button", { name: "Done" })).toHaveCount(0);

      // What was done stays as written: the PM can't close it twice.
      expect((await pm.request.patch("/api/tasks", { data: { id, status: "done", resolution: "Rewritten" } })).status()).toBe(403);
      expect(sql(`select resolution from public.work_items where id = ${id}`)).toBe("Walked it with the drywall lead, repair set for Tuesday");

      await page.goto("/app/tasks?view=all");
      await tasks.getByRole("searchbox").fill(said);
      await expect(tasks.getByRole("row").filter({ hasText: said })).toHaveCount(0);
    } finally {
      await pmCtx.close();
      sql(`delete from public.work_items where title = '${said}'`);
    }
  });

  test("on a job with no PM goes to Owner decisions, and a PM off the job can't log one", async ({ owner: page, browser }) => {
    const n = Date.now().toString().slice(-8);
    const said = `E2E late start ${n}`;
    const noPm = sql("select j.id from public.crew_jobs j where j.active and not exists (select 1 from public.crew_job_people p where p.job_id = j.id and p.role = 'pm') order by j.id limit 1");
    const ctx = await browser.newContext();
    await signIn(ctx, PM, { crew: true });
    try {
      const res = await page.request.post("/api/complaints", { data: { job: noPm, title: said } });
      expect(res.status()).toBe(200);
      expect(await res.json()).toMatchObject({ role: "decisions", assignee: "" });

      expect((await ctx.request.post("/api/complaints", { data: { job: noPm, title: said } })).status()).toBe(404);
      expect(sql(`select count(*) from public.work_items where title = '${said}'`)).toBe("1");
      expect(sql(`select created_by from public.work_items where title = '${said}'`)).toBe(OWNER);
    } finally {
      await ctx.close();
      sql(`delete from public.work_items where title = '${said}'`);
    }
  });
});
