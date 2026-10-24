// The deposit watch closes itself from Money (cleanup Batch 3): paying the
// deposit invoice in full takes "Deposit received" off Waiting on you with no
// tick, voiding that payment puts it back, and an owner who opens a
// record-closed watch again keeps it open. Seeded on this worktree's local
// database only, and removed after.

import { execSync } from "node:child_process";

import { expect, test } from "./support/env";

const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = (q: string) => execSync(`psql "${DB}" -qAtc ${JSON.stringify(q)}`, { encoding: "utf8" }).trim();

test.describe("The deposit watch closes from the payment", () => {
  test("Paid in full closes it, a void opens it, an owner's reopen sticks", async ({ owner: page }) => {
    const n = Date.now().toString().slice(-7);
    const name = `E2E ${n} W Deposit Dr`;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Phoenix" });
    const client = sql(`insert into public.clients (name) values ('E2E Deposit ${n}') returning id`);
    const job = sql(`insert into public.jobs (name, address, client_id) values ('${name}', '${n} W Deposit Dr', '${client}') returning id`);
    const lines = JSON.stringify({ lines: [{ description: "Deposit", amountCents: 250000 }] });
    const doc = sql(
      `insert into public.documents (kind, job_id, client_id, number, title, status, snapshot, total_cents, token, issued_at, issued_by) values ('invoice', '${job}', '${client}', 'E${n}-01', 'Deposit', 'issued', '${lines}'::jsonb, 250000, 'e2e${n}', now(), 'E2E') returning id`,
    );
    sql(`update public.jobs set billing = jsonb_build_object('award', jsonb_build_object('depositId', '${doc}')) where id = '${job}'`);
    const opp = sql(`insert into public.sales_opportunities (number, title, stage, job_id) values ('E2E-${n}', '${name}', 'won', '${job}') returning id`);
    const watch = sql(`insert into public.job_watches (job_id, kind, title, due_on, note, created_by) values ('${job}', 'deposit', 'Deposit received', '${today}', 'E${n}-01', 'E2E') returning id`);
    const waiting = async () => {
      const res = await page.request.get("/api/bot/home");
      expect(res.status()).toBe(200);
      return JSON.stringify(await res.json()).includes(`Deposit received: ${name}`);
    };
    const pay = async (amountCents: number) => {
      const res = await page.request.post("/api/billing/payments", { data: { documentId: doc, amountCents, method: "check", receivedOn: today, reference: `E2E ${n}`, confirm: true } });
      expect(res.status()).toBe(200);
      return (await res.json()).payment.id as string;
    };
    const doneBy = () => sql(`select coalesce(done_at::text, 'open') || '|' || done_by from public.job_watches where id = ${watch}`);
    try {
      expect(await waiting()).toBe(true);

      // Part of it is not the deposit received.
      await pay(100000);
      expect(await waiting()).toBe(true);
      expect(doneBy()).toBe("open|");

      // The rest: closed by the record, no tick.
      const rest = await pay(150000);
      expect(await waiting()).toBe(false);
      expect(doneBy()).toMatch(/\|record: E\d+-01 paid in full$/);

      // That payment was a mistake: voided, the watch is open again.
      const v = await page.request.post(`/api/billing/payments/${rest}/void`, { data: { reason: "E2E bounced" } });
      expect(v.status()).toBe(200);
      expect(await waiting()).toBe(true);
      expect(doneBy()).toBe("open|");

      // Paid again, closed again, and the job's paperwork says what closed it.
      await pay(150000);
      expect(await waiting()).toBe(false);
      await page.goto(`/app/sales/${opp}`);
      await expect(page.getByText(/Done .*: E\d+-01 paid in full/)).toBeVisible();

      // An owner opens it by hand: it stays open although the deposit is paid.
      const re = await page.request.post(`/api/sales/${opp}/watches`, { data: { id: Number(watch), done: false } });
      expect(re.status()).toBe(200);
      expect(await waiting()).toBe(true);
      expect(doneBy()).toMatch(/^open\|reopened by /);
    } finally {
      // Issued documents and payment allocations are frozen by triggers; these local test rows go with them off.
      sql(
        `set session_replication_role = replica; ` +
          `delete from public.payment_allocations where document_id = '${doc}'; delete from public.payments where reference = 'E2E ${n}'; ` +
          `delete from public.sales_events where opportunity_id = '${opp}'; delete from public.sales_opportunities where id = '${opp}'; ` +
          `delete from public.job_watches where job_id = '${job}'; delete from public.documents where id = '${doc}'; ` +
          `delete from public.jobs where id = '${job}'; delete from public.clients where id = '${client}'`,
      );
    }
  });
});
