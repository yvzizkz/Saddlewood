// A signed change order always has a way to close. At no charge there is nothing
// to bill, so it closes on the job's row. On a job with no billing record nothing
// can bill it, so the owners are told, and can void it or set one up.

import { execSync } from "node:child_process";

import { expect, test } from "./support/env";

const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = (q: string) => execSync(`psql "${DB}" -qAtc ${JSON.stringify(q.replace(/\s+/g, " "))}`, { encoding: "utf8" }).trim();
const JOB = "8009-n-ironwood-dr";

function clean(ids: number[]) {
  if (!ids.length) return;
  const list = ids.join(",");
  sql(`begin; set local session_replication_role = replica;
       delete from change_order_events where change_order_id in (${list});
       delete from joist_jobs where change_order_id in (${list});
       delete from change_orders where id in (${list});
       commit;`);
}

test.describe("Closing a signed change order", () => {
  const ids: number[] = [];
  test.afterEach(() => {
    clean(ids.splice(0));
  });

  async function signedCo(page: import("@playwright/test").Page, job: string, title: string, amountCents: number): Promise<number> {
    const made = await page.request.post("/api/change-orders", { data: { job, title } });
    expect(made.ok(), await made.text()).toBeTruthy();
    const id = (await made.json()).id as number;
    ids.push(id);
    expect((await page.request.patch("/api/change-orders", { data: { id, status: "priced", amountCents } })).ok()).toBeTruthy();
    expect((await page.request.patch("/api/change-orders", { data: { id, status: "signed" } })).ok()).toBeTruthy();
    return id;
  }

  test("a no-charge one closes on its row, with no invoice and no Bill task", async ({ owner: page }) => {
    const title = `E2E no-charge patch ${Date.now()}`;
    const id = await signedCo(page, JOB, title, 0);

    await page.goto(`/app/jobs/${JOB}?tab=changes`, { waitUntil: "networkidle" });
    const row = page.getByRole("listitem").filter({ hasText: title });
    await expect(row.getByRole("link", { name: "Bill it" })).toHaveCount(0);

    await page.goto("/app/tasks?view=all", { waitUntil: "networkidle" });
    const tasks = page.locator('[data-table="tasks-all"]');
    await tasks.getByRole("searchbox").fill(title);
    await expect(tasks.getByRole("row").filter({ hasText: title })).toHaveCount(0);

    await page.goto(`/app/jobs/${JOB}?tab=changes`, { waitUntil: "networkidle" });
    await row.getByRole("button", { name: "No charge: close it" }).click();
    await expect(row).toHaveCount(0);
    expect(sql(`select status || '|' || coalesce(billed_document_id::text, 'none') from change_orders where id = ${id}`)).toBe("billed|none");
  });

  test("on a job with no billing record the owners hear of it and can void it, or set one up and bill it", async ({ owner: page }) => {
    const stamp = Date.now();
    const crew = `e2e-no-billing-${stamp}`;
    sql(`insert into crew_jobs (id, name, address, created_by) values ('${crew}', 'E2E No Billing ${stamp}', '', 'e2e')`);
    try {
      const gone = `E2E crew-only extra ${stamp}`;
      const kept = `E2E crew-only header ${stamp}`;
      const goneId = await signedCo(page, crew, gone, 50_000);
      const keptId = await signedCo(page, crew, kept, 60_000);

      await page.goto(`/app/jobs/${crew}?tab=changes`, { waitUntil: "networkidle" });
      const row = page.getByRole("listitem").filter({ hasText: gone });
      await expect(row).toContainText("No billing job");
      await expect(row.getByRole("link", { name: "Bill it" })).toHaveCount(0);

      await page.goto("/app/tasks?view=all", { waitUntil: "networkidle" });
      const tasks = page.locator('[data-table="tasks-all"]');
      await tasks.getByRole("searchbox").fill(gone);
      const task = tasks.getByRole("row").filter({ hasText: gone });
      await expect(task).toHaveCount(1);
      await expect(task).toContainText("No billing job");
      await expect(task).toContainText("Owner");

      await page.goto(`/app/jobs/${crew}?tab=changes`, { waitUntil: "networkidle" });
      page.once("dialog", (d) => void d.accept());
      await row.getByRole("button", { name: "Void" }).click();
      await expect(row).toHaveCount(0);
      expect(sql(`select status from change_orders where id = ${goneId}`)).toBe("void");

      // The job gets its billing record: the row bills, and the draw has it.
      const jobId = sql(`insert into jobs (name, address, crew_job_id) values ('E2E No Billing ${stamp}', '', '${crew}') returning id`).split("\n")[0];
      await page.goto(`/app/jobs/${crew}?tab=changes`, { waitUntil: "networkidle" });
      await expect(page.getByRole("listitem").filter({ hasText: kept }).getByRole("link", { name: "Bill it" })).toBeVisible();
      const progress = await page.request.get(`/api/jobs/${crew}/progress`);
      expect(progress.ok(), await progress.text()).toBeTruthy();
      expect(((await progress.json()) as { lines: { key: string }[] }).lines.map((l) => l.key)).toContain(`co:${keptId}`);
      sql(`delete from jobs where id = '${jobId}'`);
    } finally {
      clean(ids.splice(0));
      sql(`delete from jobs where crew_job_id = '${crew}'`);
      sql(`delete from crew_jobs where id = '${crew}'`);
    }
  });

  test("one from an Other job log, on no job at all, moves on Billing's list and can be voided", async ({ owner: page }) => {
    const title = `E2E other-job ask ${Date.now()}`;
    const id = Number(sql(`insert into change_orders (title, source, requested_by) values ('${title}', 'directive', 'e2e') returning id`).split("\n")[0]);
    ids.push(id);

    // Its Price task opens this list; the change order's own page has nothing for it.
    await page.goto(`/app/changes/${id}`, { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/app\/accounting\/billing/);
    const row = page.getByRole("listitem").filter({ hasText: title });
    await row.getByPlaceholder("$ price").fill("250");
    await row.getByRole("button", { name: "Price it" }).click();
    await expect(row).toContainText("$250");
    await row.getByRole("button", { name: "Signed" }).click();
    await expect(row).toContainText("No billing job");
    await expect(row.getByRole("link", { name: "Bill it" })).toHaveCount(0);

    page.once("dialog", (d) => void d.accept());
    await row.getByRole("button", { name: "Void" }).click();
    await expect(row).toHaveCount(0);
    expect(sql(`select status from change_orders where id = ${id}`)).toBe("void");
  });
});
