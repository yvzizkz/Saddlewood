// A change order's whole week (docs/SCENARIOS.md §9), one CO end to end on the
// Jury job (AFT): the client's emailed request is taken in by the Mac as a
// numbered $0 draft, lands on the owners' Tasks to price, is priced on its
// page, sent (put out with the client by hand: local mail has no key), approved
// by the client on the link on a phone, copied into Joist by the Mac, handed to
// Finance to bill, and billed on the next draw. Each step has its own spec
// (co-intake, co-price, co-approve, joist-sync, powell-draw); this one checks
// that they hand off to each other. Rows are removed after; the draw is voided.

import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { request as http } from "@playwright/test";

import { cents, expect, test } from "./support/env";

const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = (q: string) => execSync(`psql "${DB}" -qAtc ${JSON.stringify(q.replace(/\s+/g, " "))}`, { encoding: "utf8" }).trim();
const TOKEN = /^OPS_AGENT_TOKEN=(.*)$/m.exec(readFileSync(".env.local", "utf8"))?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
const BASE = process.env.BASE ?? "http://localhost:3100";
const JOB = "8009-n-ironwood-dr";

test.describe("A change order's week", () => {
  test("emailed request → priced → approved on the link → in Joist → Finance bills it on the draw", async ({ owner: page, browser }) => {
    expect(TOKEN.length, "OPS_AGENT_TOKEN in .env.local").toBeGreaterThanOrEqual(16);
    const ref = `e2e-co-week-${Date.now()}`;
    const title = `Blocking for the studio TV ${Date.now()}`;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Phoenix" });
    const bot = await http.newContext({ baseURL: BASE, extraHTTPHeaders: { Authorization: `Bearer ${TOKEN}`, "X-Ops-Actor": "bot" } });
    const clientCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    // Only this run's Joist jobs: park anything else waiting on the local queue, and put it back after.
    const parked = sql(`select coalesce(string_agg(id::text, ','), '0') from joist_jobs where status in ('queued', 'claimed')`);
    sql(`update joist_jobs set status = 'failed', error = 'e2e parked' where id in (${parked})`);
    let drawId: string | null = null;
    try {
      // Monday: Chris's email, taken in by the Mac. A numbered $0 draft, awaiting a price.
      const made = await bot.post("/api/change-orders/intake", {
        data: {
          sourceRef: ref,
          job: JOB,
          requestedBy: "Chris Turner (AFT)",
          requestedOn: today,
          subject: "TV blocking in the studio",
          items: [{ key: "tv", title, lines: [{ description: "2x blocking for the wall mount, 6 LF" }] }],
        },
      });
      expect(made.status()).toBe(201);
      const co = (await made.json()).changeOrders[0] as { changeOrderId: number; number: string; documentId: string };
      expect(co.number).toMatch(/^8009-CO\d+$/);
      expect(sql(`select status || ':' || coalesce(amount_cents::text, 'null') from change_orders where id = ${co.changeOrderId}`)).toBe("requested:null");
      const joist = () => sql(`select coalesce(string_agg(status || ':' || reason, ',' order by id), '') from joist_jobs where change_order_id = ${co.changeOrderId}`);
      expect(joist()).toBe("queued:drafted");

      // It is on the owners' Tasks to price, and the item opens its page.
      await page.goto("/app/tasks?view=all", { waitUntil: "networkidle" });
      await page.getByPlaceholder("Search").first().fill(title);
      await expect(page.getByRole("link", { name: `Price: ${title}` }).first()).toHaveAttribute("href", `/app/changes/${co.changeOrderId}`);

      // On the job's Changes tab it has a document, so it moves on its own page: no price box, no Sent, no Signed.
      await page.goto(`/app/jobs/${JOB}?tab=changes`, { waitUntil: "networkidle" });
      const onJob = page.getByRole("listitem").filter({ hasText: title });
      await expect(onJob.getByRole("link", { name: "Price it" })).toHaveAttribute("href", `/app/changes/${co.changeOrderId}`);
      await expect(onJob.getByPlaceholder("$ price")).toHaveCount(0);

      // Priced on its page: one line, $1,240.
      await page.goto(`/app/changes/${co.changeOrderId}`, { waitUntil: "networkidle" });
      await expect(page.getByText(`${co.number} · Awaiting price`)).toBeVisible();
      await page.getByLabel("Line 1 price").fill("1240");
      await expect(page.getByTestId("co-total")).toHaveText("$1,240.00");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect.poll(() => sql(`select amount_cents from change_orders where id = ${co.changeOrderId}`)).toBe("124000");
      expect(sql(`select total_cents from documents where id = '${co.documentId}'`)).toBe("124000");
      // The draft and the price fold into one waiting Joist job.
      expect(joist()).toBe("queued:priced");

      // Sent. Local mail has no key, so the send is recorded the way a real one lands:
      // the register moves to sent and the document goes out with a link.
      for (const status of ["priced", "sent"]) expect((await page.request.patch("/api/change-orders", { data: { id: co.changeOrderId, status } })).status()).toBe(200);
      const token = randomBytes(16).toString("hex");
      sql(`update documents set status = 'issued', issued_at = now(), token = '${token}' where id = '${co.documentId}'`);
      await page.goto("/app/tasks?view=all", { waitUntil: "networkidle" });
      await page.getByPlaceholder("Search").first().fill(title);
      await expect(page.getByRole("link", { name: `Price: ${title}` })).toHaveCount(0);
      await page.goto(`/app/jobs/${JOB}?tab=changes`, { waitUntil: "networkidle" });
      await expect(onJob.getByRole("link", { name: "Follow up" })).toHaveAttribute("href", `/app/changes/${co.changeOrderId}`);
      await expect(onJob.getByRole("button", { name: "Sent" })).toHaveCount(0);
      await expect(onJob.getByRole("button", { name: "Signed" })).toHaveCount(0);

      // Chris approves on his phone, not signed in. His first try saved the signature but the
      // register never moved: reloading must not read Approved, and the form must finish it.
      const dot = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
      const signedEvent = JSON.stringify({ role: "client", name: "Chris Turner", method: "draw", image: dot });
      sql(`insert into document_events (document_id, kind, actor, dedupe, detail) values ('${co.documentId}', 'signed', 'client link', 'signed:client:${co.documentId}', '${signedEvent}')`);
      const c = await clientCtx.newPage();
      await c.goto(`/d/${token}`, { waitUntil: "networkidle" });
      await expect(c.getByTestId("co-approved")).toHaveCount(0);
      const box = c.getByRole("region", { name: "Approve this change order" });
      await expect(box).toContainText(`Approve change order ${co.number}`);
      await expect(box).toContainText("$1,240.00 added to the contract");
      await box.getByLabel("Your full name").fill("Chris Turner");
      await box.getByRole("checkbox").check();
      await box.getByRole("button", { name: "Approve and sign" }).click();
      await expect(c.getByTestId("co-approved")).toContainText("Chris Turner");
      expect(sql(`select status || '|' || signed_on from change_orders where id = ${co.changeOrderId}`)).toBe(`signed|${today}`);
      expect(sql(`select count(*) from document_events where document_id = '${co.documentId}' and kind = 'signed'`)).toBe("1");
      // Still one waiting Joist job, now for the signature.
      expect(joist()).toBe("queued:signed");

      // The Mac copies it into Joist as it is now: signed, $1,240.
      const claimed = ((await (await bot.post("/api/bot/joist-sync", { data: {} })).json()).jobs as { jobId: number; changeOrderId: number; number: string; totalCents: number }[]).filter((j) => j.changeOrderId === co.changeOrderId);
      expect(claimed).toHaveLength(1);
      expect(claimed[0]).toMatchObject({ number: co.number, totalCents: 124000 });
      const saved = await bot.post(`/api/bot/joist-sync/${claimed[0].jobId}`, { data: { ok: true, joistId: 52790001, joistUrl: "https://pro.joistapp.com/estimates/52790001" } });
      expect((await saved.json()).status).toBe("done");
      await page.goto(`/app/changes/${co.changeOrderId}`, { waitUntil: "networkidle" });
      await expect(page.getByTestId("co-joist")).toHaveText("In Joist as estimate 52790001.");
      const happened = page.getByRole("region", { name: "What happened" });
      await expect(happened).toContainText(`Approved by Chris Turner on the link (signed ${today})`);
      await expect(happened).toContainText("Copied to Joist (estimate 52790001)");

      // Finance is told to bill it.
      await page.goto("/app/tasks?view=all", { waitUntil: "networkidle" });
      const tasks = page.locator('[data-table="tasks-all"]');
      await tasks.getByRole("searchbox").fill(title);
      await expect(tasks.getByRole("row").filter({ hasText: `Bill ${co.number}` })).toContainText("Finance");

      // Billed on the next draw: the signed CO is on Jury's schedule of values; 100% bills all of it.
      await page.goto(`/app/jobs/${JOB}?tab=money`, { waitUntil: "networkidle" });
      const card = page.getByRole("region", { name: "Progress billing" });
      const row = card.getByRole("row").filter({ hasText: title });
      await expect(row).toContainText("change order");
      await expect(row).toContainText("$1,240");
      await card.getByLabel(new RegExp(`${title} percent complete`)).fill("100");
      expect(cents(await card.locator('[data-draw="gross"]').textContent())).toBe(124_000);
      await card.getByRole("button", { name: "Make the draft invoice" }).click();
      await page.waitForURL(/\/app\/money\/[0-9a-f-]{36}$/i);
      drawId = page.url().split("/").pop()!;
      expect((await page.request.post(`/api/billing/documents/${drawId}/issue`, { data: {} })).ok()).toBeTruthy();

      // Billed against that invoice: off Finance's Tasks, off the open Changes, on the timeline with the invoice.
      expect(sql(`select status || '|' || billed_document_id from change_orders where id = ${co.changeOrderId}`)).toBe(`billed|${drawId}`);
      const invoice = sql(`select number from documents where id = '${drawId}'`);
      await page.goto("/app/tasks?view=all", { waitUntil: "networkidle" });
      await page.locator('[data-table="tasks-all"]').getByRole("searchbox").fill(title);
      await expect(page.locator('[data-table="tasks-all"]').getByRole("row").filter({ hasText: `Bill ${co.number}` })).toHaveCount(0);
      await page.goto(`/app/jobs/${JOB}?tab=changes`, { waitUntil: "networkidle" });
      await expect(page.getByRole("listitem").filter({ hasText: title })).toHaveCount(0);
      expect(sql(`select string_agg(kind, ',' order by id) from change_order_events where change_order_id = ${co.changeOrderId}`)).toMatch(/^requested,drafted(,updated)*,priced,sent,signed,.*billed$/);
      expect(sql(`select detail->>'invoice' from change_order_events where change_order_id = ${co.changeOrderId} and kind = 'billed'`)).toBe(invoice);
    } finally {
      // Voiding the draw puts a billed CO back to signed (draw-void); then this run's rows go.
      if (drawId) await page.request.post(`/api/billing/documents/${drawId}/void`, { data: { reason: "e2e cleanup" } });
      await bot.dispose();
      await clientCtx.close();
      sql(`update joist_jobs set status = 'queued', error = '' where id in (${parked}) and error = 'e2e parked'`);
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
});
