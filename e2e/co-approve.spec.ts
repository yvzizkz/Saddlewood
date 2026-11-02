// The client approves a change order on its link (T256). A request is taken
// in, priced, sent (its document put out with the client by hand, as a real
// send would) and opened on a phone, not signed in: the change order is under
// the document with a place to sign. Approving moves the register to signed
// with today's date, keeps one signature in the proof record, puts one line
// on the owners' timeline and queues the Joist copy. A second approval and a
// void link are refused. Rows are removed after.

import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { request as http } from "@playwright/test";

import { expect, test } from "./support/env";

const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = (q: string) => execSync(`psql "${DB}" -qAtc ${JSON.stringify(q.replace(/\s+/g, " "))}`, { encoding: "utf8" }).trim();
const TOKEN = /^OPS_AGENT_TOKEN=(.*)$/m.exec(readFileSync(".env.local", "utf8"))?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
const BASE = process.env.BASE ?? "http://localhost:3100";
const SHOTS = "docs/screenshots/co-approve";

test.describe("Change order approval on the link", () => {
  test("the client approves once on a phone: signed, one signature, one timeline line, queued for Joist; again or void is refused", async ({ owner: page, browser }) => {
    const ref = `e2e-co-approve-${Date.now()}`;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Phoenix" });
    const bot = await http.newContext({ baseURL: BASE, extraHTTPHeaders: { Authorization: `Bearer ${TOKEN}`, "X-Ops-Actor": "bot" } });
    const clientCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    try {
      const made = await bot.post("/api/change-orders/intake", {
        data: {
          sourceRef: ref,
          job: "8009-n-ironwood-dr",
          requestedBy: "Chris Turner (AFT)",
          requestedOn: "2026-11-02",
          items: [
            { key: "bib", title: "Extra hose bib at the patio", lines: [{ description: "Hose bib and line" }] },
            { key: "door", title: "Widen the studio door", lines: [{ description: "Header and jambs" }] },
          ],
        },
      });
      expect(made.status()).toBe(201);
      const [co, other] = (await made.json()).changeOrders as { changeOrderId: number; number: string; documentId: string }[];
      for (const c of [co, other]) {
        const priced = await page.request.post(`/api/change-orders/${c.changeOrderId}/price`, {
          data: { title: c === co ? "Extra hose bib at the patio" : "Widen the studio door", note: "", lines: [{ description: c === co ? "Hose bib and line" : "Header and jambs", note: "", amountCents: 48500, noCharge: false }] },
        });
        expect(priced.status()).toBe(200);
        for (const status of ["priced", "sent"]) expect((await page.request.patch("/api/change-orders", { data: { id: c.changeOrderId, status } })).status()).toBe(200);
      }
      const token = randomBytes(16).toString("hex");
      const voidToken = randomBytes(16).toString("hex");
      sql(`update documents set status = 'issued', issued_at = now(), token = '${token}' where id = '${co.documentId}'`);
      sql(`update documents set status = 'void', void_reason = 'e2e', voided_at = now(), issued_at = now(), token = '${voidToken}' where id = '${other.documentId}'`);

      // The client, not signed in, on a phone.
      const c = await clientCtx.newPage();
      await c.goto(`/d/${token}`, { waitUntil: "networkidle" });
      const box = c.getByRole("region", { name: "Approve this change order" });
      await expect(box).toContainText(`Approve change order ${co.number}`);
      await expect(box).toContainText("$485.00 added to the contract");
      await box.getByLabel("Your full name").fill("Chris Turner");
      const approve = box.getByRole("button", { name: "Approve and sign" });
      await expect(approve).toBeDisabled(); // the consent box first
      await box.getByRole("checkbox").check();
      await box.scrollIntoViewIfNeeded();
      await c.screenshot({ path: `${SHOTS}/approve-phone.png`, fullPage: true });
      await approve.click();
      await expect(c.getByTestId("co-approved")).toContainText("Chris Turner");
      await expect(box).toHaveCount(0);

      expect(sql(`select status || '|' || signed_on from change_orders where id = ${co.changeOrderId}`)).toBe(`signed|${today}`);
      expect(sql(`select count(*) || '|' || max(detail->>'name') || '|' || (max(detail->>'snapshotSha256') ~ '^[0-9a-f]{64}$') from document_events where document_id = '${co.documentId}' and kind = 'signed'`)).toBe("1|Chris Turner|true");
      expect(sql(`select string_agg(status || ':' || reason, ',' order by id) from joist_jobs where change_order_id = ${co.changeOrderId} and status = 'queued'`)).toBe("queued:signed");

      // Read-only after: the page shows the signature, and a second approval is refused.
      await c.reload({ waitUntil: "networkidle" });
      await expect(c.getByTestId("co-approved")).toContainText("Chris Turner");
      await c.screenshot({ path: `${SHOTS}/approved-phone.png`, fullPage: true });
      const again = await c.request.post(`/d/${token}/approve`, { data: { name: "Someone Else", method: "type", typed: "Someone Else", font: "dancing", image: "data:image/png;base64,iVBORw0KGgo=", agree: true } });
      expect([400, 409]).toContain(again.status());
      expect(sql(`select count(*) from document_events where document_id = '${co.documentId}' and kind = 'signed'`)).toBe("1");

      // A void link shows why and takes nothing.
      await c.goto(`/d/${voidToken}`, { waitUntil: "networkidle" });
      await expect(c.getByTestId("co-approve-blocked")).toContainText("withdrawn or replaced");
      await expect(c.getByRole("region", { name: "Approve this change order" })).toHaveCount(0);
      expect(sql(`select status from change_orders where id = ${other.changeOrderId}`)).toBe("sent");

      // The owners see it once, with the name.
      await page.goto(`/app/changes/${co.changeOrderId}`, { waitUntil: "networkidle" });
      const what = page.getByRole("region", { name: "What happened" });
      await expect(what).toContainText(`Approved by Chris Turner on the link (signed ${today})`);
      await expect(what).not.toContainText("The client signed it on the link");
    } finally {
      await bot.dispose();
      await clientCtx.close();
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
