// Void buttons on a Money document (cleanup Batch 4): the routes were there,
// but nobody could reach them. A payment recorded in error is voided with a
// reason and stays on the record; an invoice is voided once no payment stands
// against it. Seeded on this worktree's local database only, and removed after.

import { execSync } from "node:child_process";

import { expect, test } from "./support/env";

const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = (q: string) => execSync(`psql "${DB}" -qAtc ${JSON.stringify(q)}`, { encoding: "utf8" }).trim();

test.describe("Money: void a payment, then the invoice", () => {
  test("The invoice waits for its payments; each void keeps its reason", async ({ owner: page }) => {
    const n = Date.now().toString().slice(-7);
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Phoenix" });
    const client = sql(`insert into public.clients (name) values ('E2E Void ${n}') returning id`);
    const job = sql(`insert into public.jobs (name, address, client_id) values ('E2E ${n} W Void Dr', '${n} W Void Dr', '${client}') returning id`);
    const lines = JSON.stringify({ lines: [{ description: "Framing", amountCents: 120000 }] });
    const doc = sql(
      `insert into public.documents (kind, job_id, client_id, number, title, status, snapshot, total_cents, token, issued_at, issued_by) values ('invoice', '${job}', '${client}', 'V${n}-01', 'Framing', 'issued', '${lines}'::jsonb, 120000, 'v2e${n}', now(), 'E2E') returning id`,
    );
    try {
      const res = await page.request.post("/api/billing/payments", { data: { documentId: doc, amountCents: 120000, method: "check", receivedOn: today, reference: `E2E void ${n}`, confirm: true } });
      expect(res.status()).toBe(200);
      const payment = (await res.json()).payment.id as string;

      await page.goto(`/app/money/${doc}`);
      await expect(page.getByText(`To void V${n}-01, void its payments first.`)).toBeVisible();
      await expect(page.getByTestId("void-document")).toHaveCount(0);

      // The payment: a reason, then the second tap.
      await page.getByTestId(`void-payment-${payment}`).click();
      const form = page.getByTestId(`void-payment-${payment}-form`);
      await expect(form.getByRole("button", { name: /Void this \$1,200\.00 payment/ })).toBeDisabled();
      await form.getByRole("textbox").fill("Check bounced");
      await form.getByRole("button", { name: /Void this \$1,200\.00 payment/ }).click();
      await expect(page.getByText(/Voided: Check bounced/)).toBeVisible();
      expect(sql(`select void_reason from public.payments where id = '${payment}'`)).toMatch(/^Check bounced \(/);

      // Now the invoice can go.
      await page.getByTestId("void-document").click();
      await page.getByTestId("void-document-form").getByRole("textbox").fill("Billed to the wrong job");
      await page.getByTestId("void-document-form").getByRole("button", { name: `Void V${n}-01` }).click();
      await expect(page.getByText("Voided: Billed to the wrong job")).toBeVisible();
      expect(sql(`select status || '|' || void_reason from public.documents where id = '${doc}'`)).toBe("void|Billed to the wrong job");
      await expect(page.getByTestId("void-document")).toHaveCount(0);
    } finally {
      // Issued documents and payment allocations are frozen by triggers; these local test rows go with them off.
      sql(
        `set session_replication_role = replica; ` +
          `delete from public.payment_allocations where document_id = '${doc}'; delete from public.payments where reference = 'E2E void ${n}'; ` +
          `delete from public.document_events where document_id = '${doc}'; delete from public.documents where id = '${doc}'; ` +
          `delete from public.jobs where id = '${job}'; delete from public.clients where id = '${client}'`,
      );
    }
  });
});
