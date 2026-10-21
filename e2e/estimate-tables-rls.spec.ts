// 0051: jobs and the estimate tables are service-role only. The staff pages
// that review pipeline estimates still show them (they read with the server
// key after the proxy let staff in), and a signed-in session going straight
// at the database gets nothing. Seeded on this worktree's local database
// only, and removed after.

import { execSync } from "node:child_process";

import { expect, test } from "./support/env";

const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = (q: string) => execSync(`psql "${DB}" -Atc ${JSON.stringify(q)}`, { encoding: "utf8" }).trim();
const asRole = (role: string, q: string) => {
  try {
    return execSync(`psql "${DB}" -v ON_ERROR_STOP=1 -Atc ${JSON.stringify(`set role ${role}; ${q}`)}`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (e) {
    return String((e as { stderr?: Buffer }).stderr ?? e);
  }
};

test.describe("Estimate tables: service-role only, staff pages still read them", () => {
  test("A pipeline estimate shows on /internal and its review page; the database refuses signed-in and public keys", async ({ owner: page }) => {
    const uid = Date.now().toString().slice(-6);
    const name = `E2E RLS Estimate ${uid}`;
    const jobId = sql(`insert into public.jobs (name, client_name, address) values ('${name}', 'E2E Client', '1 Test Way') returning id`).split("\n")[0];
    const estId = sql(`insert into public.estimates (job_id, review_status, direct_cost, grand_total) values ('${jobId}', 'in_review', 1000, 1400) returning id`).split("\n")[0];
    sql(`insert into public.estimate_trades (estimate_id, trade_name) values ('${estId}', 'Framing')`);
    try {
      // The database: the browser's keys hold nothing on these tables.
      for (const t of ["jobs", "estimates", "estimate_trades", "estimate_line_items", "estimate_overrides", "bid_log", "export_links", "email_log"]) {
        expect(asRole("authenticated", `select count(*) from public.${t}`), t).toMatch(/permission denied/);
        expect(asRole("anon", `select count(*) from public.${t}`), t).toMatch(/permission denied/);
      }
      expect(Number(asRole("service_role", `select count(*) from public.jobs where id = '${jobId}'`).split("\n").pop())).toBe(1);

      // The site: staff still see the estimate, with its job.
      await page.goto("/internal");
      await expect(page.getByText(name).first()).toBeVisible();
      await page.goto(`/internal/estimates/${estId}`);
      await expect(page.getByText(name).first()).toBeVisible();
      await expect(page.getByText("Framing").first()).toBeVisible();
    } finally {
      sql(`delete from public.estimates where id = '${estId}'`);
      sql(`delete from public.jobs where id = '${jobId}'`);
    }
  });
});
