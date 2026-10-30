// Price it (docs/CO-INTAKE.md step 3): a change order that came in by email is
// priced and sent from one screen on a phone. The Jury shear-wall request is
// taken in, opened at /app/changes/<id>, and Send stays blocked until every
// line has a price (or is marked no charge) and intake's "about ___ sq ft" is
// filled. The total and the client's view follow the typing; Save writes the
// prices to the draft and the register; Send shows the exact email first. A PM
// who follows the link lands on the job's Changes tab instead. Local mail has
// no key, so nothing can leave; the register moves to sent only when it does
// (src/lib/billing/__tests__/coSend.test.ts). Rows are removed after.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { request as http } from "@playwright/test";

import { expect, PM, signIn, test } from "./support/env";

const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = (q: string) => execSync(`psql "${DB}" -qAtc ${JSON.stringify(q.replace(/\s+/g, " "))}`, { encoding: "utf8" }).trim();
const TOKEN = /^OPS_AGENT_TOKEN=(.*)$/m.exec(readFileSync(".env.local", "utf8"))?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
const SHOTS = "docs/screenshots/co-price";

test.describe("Price it", () => {
  test("blocked until priced and filled, total and preview follow the typing, Save writes, Send shows the email first", async ({ owner: page, browser }) => {
    const ref = `e2e-co-price-${Date.now()}`;
    // The Mac's allowlist mirror: only this run's stand-in is removed after, never one the Mac reported.
    const hadMirror = sql(`select count(*) from bot_state where key = 'outboundAllow'`) === "1";
    test.skip(hadMirror, "a real allowlist mirror is on this stack; this run seeds its own");
    const bot = await http.newContext({ baseURL: process.env.BASE ?? "http://localhost:3100", extraHTTPHeaders: { Authorization: `Bearer ${TOKEN}`, "X-Ops-Actor": "bot" } });
    try {
      const made = await bot.post("/api/change-orders/intake", {
        data: {
          sourceRef: ref,
          job: "8009-n-ironwood-dr",
          requestedBy: "Chris Turner (AFT)",
          requestedOn: "2026-10-30",
          subject: "Sheer wall change at garage",
          items: [
            {
              key: "shear-wall",
              title: "Shear Wall Revision at Studio / Garage Door",
              refs: "Broderick Engineering SK8, SK9 and SK10 dated 10/29/26",
              lines: [
                { description: "Hold-Downs at Revised Shear Wall", quantity: 10, unit: "ea", note: "Ten hold-downs set in epoxy at the locations on SK8." },
                { description: "3/4\" Plywood at Hallway", note: "Hallway wall changing to paneling. Approximately ______ sq ft." },
                { description: "Materials", note: "Hold-downs, epoxy, anchors, plywood and fasteners." },
              ],
              notIncluded: [{ description: "Paneling, finishes and door supply", note: "By others" }],
            },
          ],
        },
      });
      expect(made.status()).toBe(201);
      const co = (await made.json()).changeOrders[0] as { changeOrderId: number; number: string; documentId: string };

      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/app/changes/${co.changeOrderId}`, { waitUntil: "networkidle" });
      await expect(page.getByText(`${co.number} · Awaiting price`)).toBeVisible();
      const blockers = page.getByTestId("co-blockers");
      await expect(blockers).toContainText("Line 1 has no price");
      await expect(blockers).toContainText("Line 2 still has a blank to fill.");
      const send = page.getByRole("button", { name: /^Send to/ });
      await expect(send).toBeDisabled();
      await page.screenshot({ path: `${SHOTS}/phone-awaiting.png`, fullPage: true });

      // Price it the way Marco would: two prices, the square feet, materials included at no charge.
      await page.getByLabel("Line 1 price").fill("1800");
      await page.getByLabel("Line 2 price").fill("1,200.50");
      await page.getByLabel("Line 2 detail").fill("Hallway wall changing to paneling. Approximately 120 sq ft.");
      await page.locator("li").filter({ has: page.getByLabel("Line 3") }).getByLabel("No charge").check();
      await expect(page.getByTestId("co-total")).toHaveText("$3,000.50");
      await expect(blockers).toHaveCount(0);
      await expect(send).toBeEnabled();

      // The client's view follows: on a phone, one tap away.
      await page.getByRole("button", { name: "As they see it" }).click();
      const view = page.getByRole("region", { name: "As the client sees it" });
      await expect(view).toContainText("Approximately 120 sq ft.");
      await expect(view).toContainText("No charge");
      await expect(view).toContainText("$3,000.50");
      await page.screenshot({ path: `${SHOTS}/phone-priced.png`, fullPage: true });

      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect.poll(() => sql(`select amount_cents from change_orders where id = ${co.changeOrderId}`)).toBe("300050");
      expect(sql(`select total_cents || ':' || (snapshot->'lines'->2->>'noCharge') from documents where id = '${co.documentId}'`)).toBe("300050:true");
      expect(sql(`select status from change_orders where id = ${co.changeOrderId}`)).toBe("requested");

      // Send: the exact email first, nothing sent. The Mac's allowlist mirror names the client's two synthetic contacts (put back after).
      sql(`insert into bot_state (key, data, updated_at) values ('outboundAllow', '{"addresses":["pm.aft@example.com","ap.aft@example.com"],"domains":[],"updatedAt":"${new Date().toISOString()}"}'::jsonb, now())`);
      await send.click();
      await expect(page.getByTestId("co-email")).toBeVisible();
      await expect(page.getByLabel("Subject")).toHaveValue(`Change order ${co.number}: Shear Wall Revision at Studio / Garage Door (8009 N Ironwood Dr (Jury AFT 123))`);
      await expect(page.getByLabel("Message")).toHaveValue(/\$3,000\.50/);
      await page.screenshot({ path: `${SHOTS}/phone-email.png`, fullPage: true });
      // The second tap: locally there is no mail key, so it cannot leave, and the register does not move.
      await page.getByRole("button", { name: /^Send now/ }).click();
      await expect(page.locator("ul[role=alert]")).toContainText("mail service is not set up");
      expect(sql(`select status from change_orders where id = ${co.changeOrderId}`)).toBe("requested");
      expect(sql(`select status from documents where id = '${co.documentId}'`)).toBe("draft");

      // Desktop: the editor beside the client's view.
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.getByRole("region", { name: "As the client sees it" })).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/desktop.png`, fullPage: true });

      // A settled change order with no document (an old one) opens on its job's Changes tab and gets no draft.
      const old = sql(`select id || '|' || (select count(*) from documents where kind = 'change_order') from change_orders where status = 'billed' and document_id is null and job_id is not null order by id limit 1`);
      if (old) {
        const [oldId, docsBefore] = old.split("|");
        await page.goto(`/app/changes/${oldId}`);
        await expect(page).toHaveURL(/\/app\/jobs\/[^/]+\?tab=changes$/);
        expect(sql(`select count(*) from documents where kind = 'change_order'`)).toBe(docsBefore);
      }

      // A PM who follows the link sees it on the job's Changes tab, never the price screen.
      const pmCtx = await browser.newContext({ baseURL: process.env.BASE ?? "http://localhost:3100" });
      await signIn(pmCtx, PM, { crew: true });
      const pm = await pmCtx.newPage();
      await pm.goto(`/app/changes/${co.changeOrderId}`);
      await expect(pm).toHaveURL(/\/app\/jobs\/8009-n-ironwood-dr\?tab=changes$/);
      expect([401, 403]).toContain((await pm.request.post(`/api/change-orders/${co.changeOrderId}/price`, { data: { title: "x", lines: [{ description: "x", amountCents: 1 }] } })).status());
      expect([401, 403]).toContain((await pm.request.post(`/api/change-orders/${co.changeOrderId}/send`, { data: { to: [] } })).status());
      await pmCtx.close();
    } finally {
      await bot.dispose();
      if (!hadMirror) sql(`delete from bot_state where key = 'outboundAllow'`);
      const docs = `select document_id from change_orders where source_ref = '${ref}' and document_id is not null`;
      sql(`begin; set local session_replication_role = replica;
           create temp table co_docs on commit drop as ${docs};
           delete from document_exhibits where document_id in (select document_id from co_docs);
           delete from document_events where document_id in (select document_id from co_docs);
           delete from change_order_events where change_order_id in (select id from change_orders where source_ref = '${ref}');
           delete from change_orders where source_ref = '${ref}';
           delete from documents where id in (select document_id from co_docs);
           commit;`);
    }
  });
});
