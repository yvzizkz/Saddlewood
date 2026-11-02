// Joist sync (docs/JOIST-SYNC.md): a change order the app drafts, prices or
// gets signed is queued for the Mac, which writes it into Joist through its
// browser and reports back. Here the Mac is played by the bridge token: the
// queue folds changes into one waiting job, only the bridge can claim, a claim
// hands over the change order as it is now, a failure goes back in line and is
// flagged after the last try, and a success puts the Joist id and link on the
// change order (and on its draft) and a line on its timeline. Rows are removed after.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { request as http } from "@playwright/test";

import { expect, test } from "./support/env";

const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = (q: string) => execSync(`psql "${DB}" -qAtc ${JSON.stringify(q.replace(/\s+/g, " "))}`, { encoding: "utf8" }).trim();
const TOKEN = /^OPS_AGENT_TOKEN=(.*)$/m.exec(readFileSync(".env.local", "utf8"))?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
const BASE = process.env.BASE ?? "http://localhost:3100";

test.describe("Joist sync", () => {
  test("queued on change, claimed by the Mac only, retried, then saved or flagged on the change order", async ({ owner: page }) => {
    const ref = `e2e-joist-${Date.now()}`;
    const bot = await http.newContext({ baseURL: BASE, extraHTTPHeaders: { Authorization: `Bearer ${TOKEN}`, "X-Ops-Actor": "bot" } });
    const anon = await http.newContext({ baseURL: BASE });
    // Only this run's jobs: leave anything else on the local queue alone.
    const others = sql(`select coalesce(string_agg(id::text, ','), '0') from joist_jobs where status in ('queued', 'claimed')`);
    sql(`update joist_jobs set status = 'failed', error = 'e2e parked' where id in (${others})`);
    try {
      const made = await bot.post("/api/change-orders/intake", {
        data: {
          sourceRef: ref,
          job: "8009-n-ironwood-dr",
          requestedBy: "Chris Turner (AFT)",
          requestedOn: "2026-11-02",
          items: [{ key: "door", title: "Widen the studio door", lines: [{ description: "Header and jambs", quantity: 1, unit: "ls" }, { description: "Drywall patch" }] }],
        },
      });
      expect(made.status()).toBe(201);
      const co = (await made.json()).changeOrders[0] as { changeOrderId: number; number: string; documentId: string };
      const jobs = () => sql(`select string_agg(status || ':' || reason, ',' order by id) from joist_jobs where change_order_id = ${co.changeOrderId}`);
      expect(jobs()).toBe("queued:drafted");

      // Two saves before the Mac comes: still one waiting job, now for the prices.
      for (const cents of [120000, 125000]) {
        const r = await page.request.post(`/api/change-orders/${co.changeOrderId}/price`, {
          data: { title: "Widen the studio door", note: "", lines: [{ description: "Header and jambs", note: "", amountCents: cents, noCharge: false }, { description: "Drywall patch", note: "", amountCents: 30000, noCharge: false }] },
        });
        expect(r.status()).toBe(200);
      }
      expect(jobs()).toBe("queued:priced");

      // Only the Mac's bridge token claims: not a stranger, not a signed-in owner.
      expect((await anon.post("/api/bot/joist-sync", { data: {} })).status()).toBe(401);
      expect((await page.request.post("/api/bot/joist-sync", { data: {} })).status()).toBe(401);

      const claim = async () => ((await (await bot.post("/api/bot/joist-sync", { data: {} })).json()).jobs as { jobId: number; changeOrderId: number; attempt: number; number: string; totalCents: number; joistId: number | null; lines: { amountCents: number }[] }[]).filter((j) => j.changeOrderId === co.changeOrderId);
      const [first] = await claim();
      expect(first).toMatchObject({ number: co.number, attempt: 1, joistId: null, totalCents: 155000 });
      expect(first.lines.map((l) => l.amountCents)).toEqual([125000, 30000]);
      expect(await claim()).toEqual([]); // held: no one else gets it

      // It failed in Joist: back in line, nothing flagged yet.
      expect((await (await bot.post(`/api/bot/joist-sync/${first.jobId}`, { data: { ok: false, error: "Record not found" } })).json()).status).toBe("queued");
      expect(sql(`select joist_error from change_orders where id = ${co.changeOrderId}`)).toBe("");

      // The next try saves it.
      const [second] = await claim();
      expect(second).toMatchObject({ jobId: first.jobId, attempt: 2 });
      const saved = await bot.post(`/api/bot/joist-sync/${second.jobId}`, { data: { ok: true, joistId: 52782795, joistUrl: "https://pro.joistapp.com/estimates/52782795" } });
      expect((await saved.json()).status).toBe("done");
      expect((await bot.post(`/api/bot/joist-sync/${second.jobId}`, { data: { ok: true, joistId: 1 } })).status()).toBe(409);
      expect(sql(`select joist_id || '|' || joist_url from change_orders where id = ${co.changeOrderId}`)).toBe("52782795|https://pro.joistapp.com/estimates/52782795");
      expect(sql(`select count(*) from document_exhibits where document_id = '${co.documentId}' and kind = 'link' and label = 'Joist estimate'`)).toBe("1");
      await page.goto(`/app/changes/${co.changeOrderId}`, { waitUntil: "networkidle" });
      await expect(page.getByTestId("co-joist")).toHaveText("In Joist as estimate 52782795.");
      await expect(page.getByRole("region", { name: "What happened" })).toContainText("Copied to Joist (estimate 52782795)");

      // Signed: queued again, now to update that estimate. A last failed try is flagged, with Try again.
      for (const status of ["priced", "signed"]) expect((await page.request.patch("/api/change-orders", { data: { id: co.changeOrderId, status } })).status()).toBe(200);
      expect(jobs()).toBe("done:priced,queued:signed");
      const [third] = await claim();
      expect(third).toMatchObject({ joistId: 52782795 });
      sql(`update joist_jobs set attempts = 3 where id = ${third.jobId}`);
      expect((await (await bot.post(`/api/bot/joist-sync/${third.jobId}`, { data: { ok: false, error: "Joist is down" } })).json()).status).toBe("failed");
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.getByTestId("co-joist")).toContainText("Joist copy failed: Joist is down");
      await page.getByTestId("co-joist").getByRole("button", { name: "Try again" }).click();
      await expect(page.getByTestId("co-joist")).toHaveText("In Joist as estimate 52782795; the latest changes are on their way.");
      expect(jobs()).toBe("done:priced,failed:signed,queued:retry");
    } finally {
      await bot.dispose();
      await anon.dispose();
      sql(`update joist_jobs set status = 'queued', error = '' where id in (${others}) and error = 'e2e parked'`);
      const docs = `select document_id from change_orders where source_ref = '${ref}' and document_id is not null`;
      sql(`begin; set local session_replication_role = replica;
           create temp table co_docs on commit drop as ${docs};
           delete from document_exhibits where document_id in (select document_id from co_docs);
           delete from document_events where document_id in (select document_id from co_docs);
           delete from change_order_events where change_order_id in (select id from change_orders where source_ref = '${ref}');
           delete from joist_jobs where change_order_id in (select id from change_orders where source_ref = '${ref}');
           delete from change_orders where source_ref = '${ref}';
           delete from documents where id in (select document_id from co_docs);
           commit;`);
    }
  });

  test("a change order recorded by hand goes to Joist from its own row; one with no job is never queued", async ({ owner: page }) => {
    const bot = await http.newContext({ baseURL: BASE, extraHTTPHeaders: { Authorization: `Bearer ${TOKEN}`, "X-Ops-Actor": "bot" } });
    const others = sql(`select coalesce(string_agg(id::text, ','), '0') from joist_jobs where status in ('queued', 'claimed')`);
    sql(`update joist_jobs set status = 'failed', error = 'e2e parked' where id in (${others})`);
    const ids: number[] = [];
    try {
      // Recorded on the register, priced and signed there: never opened on Price it, so no document.
      const made = await page.request.post("/api/change-orders", { data: { job: "8009-n-ironwood-dr", title: "Extra hose bib at the patio", detail: "Owner asked on site", source: "field" } });
      expect(made.status()).toBe(200);
      const id = (await made.json()).id as number;
      ids.push(id);
      expect((await page.request.patch("/api/change-orders", { data: { id, amountCents: 48500, status: "priced" } })).status()).toBe(200);
      expect((await page.request.patch("/api/change-orders", { data: { id, status: "signed" } })).status()).toBe(200);
      expect(sql(`select coalesce(document_id::text, 'none') from change_orders where id = ${id}`)).toBe("none");
      expect(sql(`select string_agg(status || ':' || reason, ',' order by id) from joist_jobs where change_order_id = ${id}`)).toBe("queued:signed");

      const claimed = ((await (await bot.post("/api/bot/joist-sync", { data: {} })).json()).jobs as { jobId: number; changeOrderId: number; number: string; totalCents: number; client: { name: string }; job: { name: string }; lines: { description: string; note: string; amountCents: number }[]; attachments: unknown[] }[]).filter((j) => j.changeOrderId === id);
      expect(claimed).toHaveLength(1);
      const [job] = claimed;
      expect(job.number).toMatch(/CO/);
      expect(job).toMatchObject({ totalCents: 48500, attachments: [], lines: [{ description: "Extra hose bib at the patio", note: "Owner asked on site", amountCents: 48500 }] });
      expect(job.job.name).not.toBe("");
      expect((await (await bot.post(`/api/bot/joist-sync/${job.jobId}`, { data: { ok: true, joistId: 52790001, joistUrl: "https://pro.joistapp.com/estimates/52790001" } })).json()).status).toBe("done");
      expect(sql(`select joist_id from change_orders where id = ${id}`)).toBe("52790001");

      // No document and no billing job: nothing to put it under in Joist, so nothing is queued.
      const loose = Number(sql(`insert into change_orders (title, requested_by) values ('e2e loose change', 'e2e') returning id`));
      ids.push(loose);
      expect((await page.request.patch("/api/change-orders", { data: { id: loose, amountCents: 1000, status: "priced" } })).status()).toBe(200);
      expect(sql(`select count(*) from joist_jobs where change_order_id = ${loose}`)).toBe("0");
    } finally {
      await bot.dispose();
      sql(`update joist_jobs set status = 'queued', error = '' where id in (${others}) and error = 'e2e parked'`);
      if (ids.length) {
        const list = ids.join(",");
        sql(`begin; set local session_replication_role = replica;
             delete from change_order_events where change_order_id in (${list});
             delete from joist_jobs where change_order_id in (${list});
             delete from change_orders where id in (${list});
             commit;`);
      }
    }
  });
});
