// A Home Depot trip counted once: the Pro Xtra lines (pre-tax) and the same
// receipt filed in the app (tax in) both land in purchases; the app copy is
// marked covered and left out of totals, on the backfill action and when the
// Pro Xtra lines arrive later. Seeded on this worktree's local database only,
// on a day far in the past, and removed after.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { expect, test } from "./support/env";

const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = (q: string) => execSync(`psql "${DB}" -Atc ${JSON.stringify(q)}`, { encoding: "utf8" }).trim();
const TOKEN = /^OPS_AGENT_TOKEN=(.*)$/m.exec(readFileSync(".env.local", "utf8"))?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";

test.describe("Home Depot: a trip filed in the app and on Pro Xtra counts once", () => {
  test("The backfill marks the app copy; Pro Xtra lines that come later mark it too; totals leave it out", async ({ owner: page }) => {
    const job = sql("select id from public.crew_jobs where active order by name limit 1");
    const n = Number(Date.now().toString().slice(-7));
    const day = "2024-02-14";
    const day2 = "2024-02-15";
    const trip = `hd:20240214:9${n % 1000}:1:${n}`;
    const trip2 = `hd:20240215:9${n % 1000}:1:${n}`;
    const app1 = `app:${n}`;
    const app2 = `app:${n + 1}`;
    const cleanup = () => sql(`delete from public.purchases where source_key like '${trip}:%' or source_key like '${trip2}:%' or source_key in ('${app1}', '${app2}')`);
    const insert = (key: string, src: string, on: string, cents: number, jobId: string | null, vendor = "Home Depot") =>
      sql(`insert into public.purchases (source, source_key, purchased_on, vendor, job_id, line_total_cents, description, meta) values ('${src}', '${key}', '${on}', '${vendor}', ${jobId ? `'${jobId}'` : "null"}, ${cents}, 'E2E ${n}', '{"runner":"E2E Runner"}'::jsonb)`);
    cleanup();
    try {
      // 1. Both copies already there (before this change): the owner's backfill finds them.
      insert(`${trip}:1`, "hd", day, 10_000, null);
      insert(`${trip}:2`, "hd", day, 5_000, null);
      insert(app1, "app", day, 16_245, job); // 15,000 + 8.3% tax
      const res = await page.request.patch("/api/accounting/purchases", { data: { action: "dedupe_receipts", from: day, to: day } });
      expect(res.status()).toBe(200);
      expect(await res.json()).toMatchObject({ ok: true, covered: 1, cleared: 0, linked: 2 });
      expect(sql(`select meta->>'coveredBy' from public.purchases where source_key = '${app1}'`)).toBe(trip);
      // The trip had no job; it takes the job the crew filed the receipt under.
      expect(sql(`select string_agg(distinct job_id, ',') from public.purchases where trip_key = '${trip}'`)).toBe(job);

      // Totals: the job's purchases that day are the trip, once.
      await page.goto(`/app/accounting/purchases?p=custom&from=${day}&to=${day}&job=${job}`);
      await expect(page.getByText("$150.00").first()).toBeVisible();
      await expect(page.getByText("$312.45")).toHaveCount(0);

      // Each trip page says where the other copy is.
      await page.goto(`/app/accounting/purchases/trip/${encodeURIComponent(app1)}`);
      await expect(page.getByTestId("trip-covered")).toContainText("counted once");
      await page.goto(`/app/accounting/purchases/trip/${encodeURIComponent(trip)}`);
      await expect(page.getByTestId("trip-also-filed")).toContainText("E2E Runner also filed this receipt");

      // 2. The receipt first, Pro Xtra a few days later through the Mac's door: marked on arrival.
      insert(app2, "app", day2, 5_400, job);
      expect(TOKEN.length, "OPS_AGENT_TOKEN in .env.local").toBeGreaterThanOrEqual(16);
      const post = await page.request.post("/api/bot/purchases", {
        headers: { authorization: `Bearer ${TOKEN}` },
        data: { lines: [{ source: "hd", sourceKey: `${trip2}:1`, purchasedOn: day2, store: "9", lineTotalCents: 5_000, description: `E2E ${n}` }] },
      });
      expect(post.status()).toBe(200);
      expect(sql(`select meta->>'coveredBy' from public.purchases where source_key = '${app2}'`)).toBe(trip2);

      // 3. An Ace Hardware receipt the same day is not Home Depot's: it stays counted.
      insert(`app:${n + 2}`, "app", day2, 5_400, job, "Ace Hardware");
      await page.request.patch("/api/accounting/purchases", { data: { action: "dedupe_receipts", from: day2, to: day2 } });
      expect(sql(`select coalesce(meta->>'coveredBy', 'counted') from public.purchases where source_key = 'app:${n + 2}'`)).toBe("counted");
    } finally {
      cleanup();
      sql(`delete from public.purchases where source_key = 'app:${n + 2}'`);
    }
  });
});
