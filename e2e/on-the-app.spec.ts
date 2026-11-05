// Who's on the app (the January move): an owner sees each person's last clock-in
// and whether they're really using it. Opening it isn't using it for field people.

import { execSync } from "node:child_process";

import { PM, expect, signIn, test } from "./support/env";

const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = (q: string) => execSync(`psql "${DB}" -qAtc ${JSON.stringify(q)}`, { encoding: "utf8" }).trim();

test.describe("Who's on the app", () => {
  test("an owner sees who's using it; a PM can't open it", async ({ owner: page, browser }) => {
    const n = Date.now().toString().slice(-8);
    const clocking = `e2e-clock-${n}@example.com`;
    const idle = `e2e-idle-${n}@example.com`;
    const group = sql("select id from public.crew_groups where id = 'crew'") || sql("select id from public.crew_groups limit 1");
    const job = sql("select id from public.crew_jobs limit 1");
    const pmCtx = await browser.newContext();
    try {
      sql(`insert into public.crew_people (email, name, group_id) values ('${clocking}', 'E2E Clocking ${n}', '${group}'), ('${idle}', 'E2E Idle ${n}', '${group}')`);
      sql(`update public.crew_people set last_seen_at = now() where email = '${idle}'`);
      sql(`insert into public.crew_shifts (email, job_id, job_name, day, started_at, ended_at) values ('${clocking}', '${job}', 'E2E', (now() at time zone 'America/Phoenix')::date, now() - interval '2 hours', now())`);
      await page.goto("/app/crew", { waitUntil: "networkidle" });
      await page.getByRole("link", { name: "Who's on the app" }).click();
      await expect(page.getByRole("heading", { name: "Who's on the app" })).toBeVisible();

      const row = (name: string) => page.getByRole("row", { name: new RegExp(name) }).first();
      await expect(row(`E2E Clocking ${n}`)).toContainText("Using it");
      await expect(row(`E2E Idle ${n}`)).toContainText("Opened it");
      // The owner opening this page counts: office people are counted by opening it.
      expect(sql("select count(*) from public.staff_seen where last_seen_at > now() - interval '10 minutes'")).not.toBe("0");

      await signIn(pmCtx, PM, { crew: true });
      const pm = await pmCtx.newPage();
      await pm.goto("/app/crew/on-the-app");
      await expect(pm).not.toHaveURL(/on-the-app/);
    } finally {
      await pmCtx.close();
      sql(`begin; set local session_replication_role = replica; delete from public.crew_shifts where email = '${clocking}'; delete from public.crew_people where email in ('${clocking}', '${idle}'); commit;`);
    }
  });
});
