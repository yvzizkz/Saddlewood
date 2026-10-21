// A material request reads where it stands from its pickup (cleanup Batch 3):
// a request whose column still says ordered shows delivered once its pickup
// was delivered, and cancelling the pickup in Crew admin cancels the request.
// Seeded on this worktree's local database only, and removed after.

import { execSync } from "node:child_process";

import { expect, test } from "./support/env";

const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = (q: string) => execSync(`psql "${DB}" -qAtc ${JSON.stringify(q)}`, { encoding: "utf8" }).trim();

type Req = { id: number; status: string; pickupStatus?: string | null };

test.describe("A material request follows its pickup", () => {
  test("Delivered on the pickup is delivered on the request; a cancelled pickup cancels it", async ({ owner: page }) => {
    const job = sql("select id from public.crew_jobs where active order by name limit 1");
    const asker = sql("select email from public.crew_people where active order by email limit 1");
    const n = Date.now().toString().slice(-7);
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Phoenix" });
    const pickup = sql(`insert into public.crew_pickups (day, supplier, job_id, job_name, items, status) values ('${today}', 'E2E Supply ${n}', '${job}', 'E2E', 'E2E ${n} block', 'delivered') returning id`);
    const req = Number(
      sql(`insert into public.crew_requests (job_id, job_name, items, asked_by, status, supplier, pickup_id) values ('${job}', 'E2E', 'E2E ${n} block', '${asker}', 'ordered', 'E2E Supply ${n}', ${pickup}) returning id`),
    );
    const mine = async (): Promise<Req | undefined> => {
      const res = await page.request.get("/api/crew/admin");
      expect(res.status()).toBe(200);
      return ((await res.json()).requests as Req[]).find((r) => r.id === req);
    };
    try {
      // The copy-back was missed (the column says ordered): the pickup wins.
      expect(await mine()).toMatchObject({ status: "delivered", pickupStatus: "delivered" });

      // A pickup in trouble: still on order, and the line knows why.
      sql(`update public.crew_pickups set status = 'problem' where id = ${pickup}`);
      expect(await mine()).toMatchObject({ status: "ordered", pickupStatus: "problem" });

      // Cancelled in Crew admin: the request is cancelled too, column and all.
      const res = await page.request.post("/api/crew/admin", { data: { kind: "pickup.update", id: Number(pickup), status: "cancelled" } });
      expect(res.status()).toBe(200);
      expect(await mine()).toMatchObject({ status: "cancelled", pickupStatus: "cancelled" });
      expect(sql(`select status from public.crew_requests where id = ${req}`)).toBe("cancelled");
    } finally {
      sql(`delete from public.crew_requests where id = ${req}; delete from public.crew_pickups where id = ${pickup}`);
    }
  });
});
