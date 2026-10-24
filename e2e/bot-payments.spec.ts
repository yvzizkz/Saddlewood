// Payments recorded in both places (Lando 2026-10-22): a Joist payment the bot
// confirmed (KB accounting.py, P<n>) is one row in the app's payments too
// (0054), applied to the invoice with that number, never twice, and marked as
// the bot's on Money and Receivables. Rows are removed after.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { localDay } from "../src/lib/crew/time";
import { expect, test } from "./support/env";

const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = (q: string) => execSync(`psql "${DB}" -qAtc ${JSON.stringify(q.replace(/\s+/g, " "))}`, { encoding: "utf8" }).trim();
const TOKEN = /^OPS_AGENT_TOKEN=(.*)$/m.exec(readFileSync(".env.local", "utf8"))?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";

test.describe("Bot payments: Joist and the app side by side", () => {
  test("a confirmed P-number lands once on its invoice, shows as the bot's, and a voided one stays voided", async ({ owner: page }) => {
    expect(TOKEN.length, "OPS_AGENT_TOKEN in .env.local").toBeGreaterThanOrEqual(16);
    // An issued invoice with at least $50 open.
    const [docId, number, open] = sql(
      `select d.id || '|' || d.number || '|' || (d.total_cents - coalesce((select sum(a.amount_cents) from payment_allocations a join payments p on p.id = a.payment_id where a.document_id = d.id and p.voided_at is null), 0))
         from documents d where d.kind = 'invoice' and d.status = 'issued'
          and d.total_cents - coalesce((select sum(a.amount_cents) from payment_allocations a join payments p on p.id = a.payment_id where a.document_id = d.id and p.voided_at is null), 0) >= 5000
        order by d.number limit 1`,
    ).split("|");
    const p = 900_000 + (Date.now() % 90_000);
    const send = (body: Record<string, unknown>) =>
      page.request.post("/api/bot/payments", { headers: { Authorization: `Bearer ${TOKEN}`, "X-Ops-Actor": "bot" }, data: body });
    const P = { pNumber: p, invoice: `AFT123-${number}`, client: "E2E", amountCents: 2_500, receivedOn: localDay(), method: "melio", joistId: "e2e", evidence: "melio receipt" };
    const rows = () => sql(`select count(*) from payments where source = 'bot' and external_ref = 'P${p}'`);

    try {
      const first = await send(P);
      expect(first.status()).toBe(201);
      const pay = (await first.json()).payment;
      expect(pay).toMatchObject({ source: "bot", externalRef: `P${p}`, amountCents: 2_500, method: "melio", reference: `P${p}` });
      expect(pay.allocations).toEqual([{ documentId: docId, lineIndex: null, amountCents: 2_500 }]);

      // A retry and a re-sync: the same row, not a second.
      const again = await send(P);
      expect(again.status()).toBe(200);
      expect((await again.json())).toMatchObject({ status: "already", payment: { id: pay.id } });
      expect(rows()).toBe("1");

      // Nothing written when it cannot be placed.
      expect((await send({ ...P, pNumber: p + 1, invoice: "0000-99" })).status()).toBe(404);
      expect((await send({ ...P, pNumber: p + 2, amountCents: Number(open) })).status()).toBe(409);
      expect(sql(`select count(*) from payments where external_ref in ('P${p + 1}', 'P${p + 2}')`)).toBe("0");

      // Someone already entered it on Money by hand: a possible duplicate, for a person to reconcile.
      sql(`with m as (insert into payments (client_id, received_on, amount_cents, method, reference, recorded_by)
             select client_id, '${localDay()}', 1200, 'check', 'E2E-DUP-${p}', 'e2e' from documents where id = '${docId}' returning id)
           insert into payment_allocations (payment_id, document_id, amount_cents) select id, '${docId}', 1200 from m`);
      const dup = await send({ ...P, pNumber: p + 3, amountCents: 1_200 });
      expect(dup.status()).toBe(409);
      expect(await dup.json()).toMatchObject({ status: "possible_duplicate", error: expect.stringContaining("E2E-DUP-") });
      expect(sql(`select count(*) from payments where external_ref = 'P${p + 3}'`)).toBe("0");

      // Money says whose it is.
      await page.goto(`/app/money/${docId}`);
      await expect(page.getByText(`From Joist · P${p}`)).toBeVisible();

      // An owner voids it: the bot's resend does not bring it back.
      await page.getByTestId(`void-payment-${pay.id}`).click();
      const form = page.getByTestId(`void-payment-${pay.id}-form`);
      await form.getByRole("textbox").fill("E2E: Joist had it twice");
      await form.getByRole("button", { name: /^Void this/ }).click();
      await expect(page.getByText("Voided: E2E: Joist had it twice")).toBeVisible();
      const after = await send(P);
      expect(after.status()).toBe(200);
      expect((await after.json())).toMatchObject({ status: "voided", paymentId: pay.id });
      expect(rows()).toBe("1");
    } finally {
      const mine = `external_ref in ('P${p}', 'P${p + 1}', 'P${p + 2}', 'P${p + 3}') or reference = 'E2E-DUP-${p}'`;
      sql(`set session_replication_role = replica; delete from payment_allocations where payment_id in (select id from payments where ${mine}); delete from payments where ${mine};`);
    }
  });

  test("Receivables tells the bot's payments apart", async ({ owner: page }) => {
    const number = sql(`select number from documents where kind = 'invoice' and status = 'issued' order by number limit 1`);
    const p = 990_000 + (Date.now() % 9_000);
    const res = await page.request.post("/api/bot/payments", {
      headers: { Authorization: `Bearer ${TOKEN}` },
      data: { pNumber: p, invoice: number, amountCents: 100, receivedOn: localDay(), method: "check" },
    });
    try {
      expect([201, 409], await res.text()).toContain(res.status());
      test.skip(res.status() === 409, `${number} has less than $1 open`);
      await page.goto("/app/accounting/receivables?m=collected&p=mtd");
      await expect(page.getByRole("cell", { name: "Joist (bot)" }).first()).toBeVisible();
    } finally {
      sql(`set session_replication_role = replica; delete from payment_allocations where payment_id in (select id from payments where external_ref = 'P${p}'); delete from payments where external_ref = 'P${p}';`);
    }
  });
});
