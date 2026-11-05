// What Billed and Open count, on the money card and the client's link alike
// (docs/SCENARIOS.md §12): a change order is a bill only once it's approved and
// until an invoice bills it, and a revision replaces what it corrects.

import { execSync } from "node:child_process";

import { expect, test } from "./support/env";

const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = (q: string) => execSync(`psql "${DB}" -qAtc ${JSON.stringify(q)}`, { encoding: "utf8" }).trim();

/** Issued documents are frozen (0012), so the test job goes with the trigger off. */
const wipe = (job: string, also: string[] = []) => {
  const docs = also.map((d) => `'${d}'`).join(",") || "null";
  sql(`begin; set local session_replication_role = replica; delete from public.payment_allocations where document_id in (${docs}); delete from public.document_events where document_id in (${docs}); delete from public.documents where id in (${docs}); delete from public.change_order_events where change_order_id in (select id from public.change_orders where job_id = '${job}'); delete from public.joist_jobs where change_order_id in (select id from public.change_orders where job_id = '${job}'); delete from public.change_orders where job_id = '${job}'; delete from public.sov_progress where job_id = '${job}'; delete from public.document_events where document_id in (select id from public.documents where job_id = '${job}'); delete from public.documents where job_id = '${job}'; delete from public.jobs where id = '${job}'; commit;`);
};

test.describe("Job money counts each dollar once", () => {
  test("a change order billed on a draw is the draw's, part or whole", async ({ owner: page }) => {
    const n = Date.now().toString().slice(-7);
    const job = sql(`insert into public.jobs (name, address, number_prefix) values ('E2E draw CO ${n}', '${n} Draw Way', '${n}') returning id`).split("\n")[0];
    let coId = 0;
    const api = page.request;
    const billed = async () => (await (await api.get(`/api/crew/projects/money?job=${job}`)).json()).money.billedCents as number;
    const issue = async (id: string) => expect((await api.post(`/api/billing/documents/${id}/issue`, { data: {} })).ok()).toBeTruthy();
    try {
      const made = await api.post("/api/change-orders", { data: { job, title: `E2E deck ${n}` } });
      expect(made.ok()).toBeTruthy();
      coId = (await made.json()).id;
      const doc = await (await api.post("/api/billing/documents", { data: { kind: "change_order", number: `${n}-CO1`, title: `E2E deck ${n}`, jobId: job, snapshot: { lines: [{ description: "Deck", amountCents: 500_000 }] } } })).json();
      await issue(doc.document.id);
      expect((await api.patch("/api/change-orders", { data: { id: coId, status: "priced", amountCents: 500_000, documentId: doc.document.id } })).ok()).toBeTruthy();
      expect((await api.patch("/api/change-orders", { data: { id: coId, status: "signed" } })).ok()).toBeTruthy();
      expect(await billed()).toBe(500_000);

      const key = `co:${coId}`;
      const half = await (await api.post(`/api/jobs/${job}/progress`, { data: { action: "draw", pcts: { [key]: 50 } } })).json();
      await issue(half.documentId);
      expect(await billed()).toBe(250_000);

      const rest = await (await api.post(`/api/jobs/${job}/progress`, { data: { action: "draw", pcts: { [key]: 100 } } })).json();
      await issue(rest.documentId);
      expect(await billed()).toBe(500_000);
    } finally {
      wipe(job);
    }
  });

  test("a rejected change order and a replaced invoice stay out of Billed, on the card and the client's link", async ({ owner: page, browser }) => {
    const n = Date.now().toString().slice(-7);
    const job = sql(`insert into public.jobs (name, address, number_prefix) values ('E2E rejected ${n}', '${n} Reject Way', '${n}') returning id`).split("\n")[0];
    const api = page.request;
    const money = async () => (await (await api.get(`/api/crew/projects/money?job=${job}`)).json()).money as { billedCents: number; owedCents: number };
    const issued = async (data: object) => {
      const { document } = await (await api.post("/api/billing/documents", { data })).json();
      expect((await api.post(`/api/billing/documents/${document.id}/issue`, { data: {} })).ok()).toBeTruthy();
      return document.id as string;
    };
    const clientCtx = await browser.newContext();
    try {
      const first = await issued({ kind: "invoice", number: `${n}-1`, title: "Draw 1", jobId: job, snapshot: { lines: [{ description: "Draw 1", amountCents: 100_000 }] } });

      const coId = (await (await api.post("/api/change-orders", { data: { job, title: `E2E wall ${n}` } })).json()).id;
      const coDoc = await issued({ kind: "change_order", number: `${n}-CO1`, title: `E2E wall ${n}`, jobId: job, snapshot: { lines: [{ description: "Wall", amountCents: 500_000 }] } });
      expect((await api.patch("/api/change-orders", { data: { id: coId, status: "priced", amountCents: 500_000, documentId: coDoc } })).ok()).toBeTruthy();
      expect((await api.patch("/api/change-orders", { data: { id: coId, status: "sent" } })).ok()).toBeTruthy();
      expect((await money()).billedCents).toBe(100_000);
      expect((await api.patch("/api/change-orders", { data: { id: coId, status: "rejected" } })).ok()).toBeTruthy();
      expect(await money()).toMatchObject({ billedCents: 100_000, owedCents: 100_000 });

      await issued({ kind: "invoice", number: `${n}-1`, title: "Draw 1, corrected", jobId: job, supersedes: first, snapshot: { lines: [{ description: "Draw 1", amountCents: 90_000 }] } });
      expect(await money()).toMatchObject({ billedCents: 90_000, owedCents: 90_000 });

      const link = await (await api.post(`/api/jobs/${job}/portal`)).json();
      expect(link.preview.money).toMatchObject({ billedCents: 90_000, openCents: 90_000 });
      expect((await api.patch(`/api/jobs/${job}/portal`, { data: { sections: ["payments"] } })).status()).toBe(200);
      const client = await clientCtx.newPage();
      await client.goto(`/c/${link.token}`);
      const payments = client.getByTestId("portal-payments");
      await expect(payments.locator("div").filter({ hasText: "Billed" })).toContainText("$900.00");
      await expect(payments.locator("div").filter({ hasText: "Open" })).toContainText("$900.00");
    } finally {
      await clientCtx.close();
      sql(`delete from public.client_portals where job_id = '${job}'`);
      wipe(job);
    }
  });

  test("a lump on a statement for two jobs holds Payments back until it's on its lines", async ({ owner: page, browser }) => {
    const n = Date.now().toString().slice(-7);
    const m = String(Number(n) + 1);
    const clientId = sql(`insert into public.clients (name) values ('E2E two jobs ${n}') returning id`).split("\n")[0];
    const job = (name: string, prefix: string) => sql(`insert into public.jobs (name, address, number_prefix, client_id) values ('${name}', '${prefix} Lump Way', '${prefix}', '${clientId}') returning id`).split("\n")[0];
    const jobA = job(`E2E lump A ${n}`, n);
    const jobB = job(`E2E lump B ${n}`, m);
    const api = page.request;
    const clientCtx = await browser.newContext();
    let statement = "";
    try {
      const { document } = await (
        await api.post("/api/billing/documents", {
          data: { kind: "statement", number: `ST-${n}`, title: "Statement", clientId, snapshot: { lines: [{ description: `Invoice ${n}-1 · Job A`, amountCents: 300_000 }, { description: `Invoice ${m}-1 · Job B`, amountCents: 200_000 }] } },
        })
      ).json();
      statement = document.id;
      expect((await api.post(`/api/billing/documents/${statement}/issue`, { data: {} })).ok()).toBeTruthy();
      const pay = async (amountCents: number, lineIndex: number | null) => {
        const res = await api.post("/api/billing/payments", { data: { documentId: statement, amountCents, method: "check", receivedOn: "2026-11-05", lineIndex, confirm: true } });
        expect(res.ok(), await res.text()).toBeTruthy();
        return (await res.json()).payment.id as string;
      };

      const lump = await pay(500_000, null);
      const link = await (await api.post(`/api/jobs/${jobA}/portal`)).json();
      expect(link.preview).toMatchObject({ money: null, unplacedCents: 500_000 });
      expect((await api.patch(`/api/jobs/${jobA}/portal`, { data: { sections: ["payments"] } })).status()).toBe(200);

      const client = await clientCtx.newPage();
      await client.goto(`/c/${link.token}`);
      await expect(client.getByRole("heading", { name: `E2E lump A ${n}` })).toBeVisible();
      await expect(client.getByTestId("portal-payments")).toHaveCount(0);
      await page.goto(`/app/jobs/${jobA}`, { waitUntil: "networkidle" });
      await expect(page.getByRole("region", { name: "Client link" })).toContainText("$5,000.00 received isn't on a job yet");

      // The same money on its lines clears the hold.
      expect((await api.post(`/api/billing/payments/${lump}/void`, { data: { reason: "e2e: put it on the lines" } })).ok()).toBeTruthy();
      await pay(300_000, 0);
      await pay(200_000, 1);
      await client.reload();
      const payments = client.getByTestId("portal-payments");
      await expect(payments.locator("div").filter({ hasText: "Paid" })).toContainText("$3,000.00");
      await expect(payments.locator("div").filter({ hasText: "Open" })).toContainText("$0.00");
    } finally {
      await clientCtx.close();
      sql(`delete from public.client_portals where job_id in ('${jobA}', '${jobB}')`);
      sql(`begin; set local session_replication_role = replica; delete from public.payment_allocations where document_id = ${statement ? `'${statement}'` : "null"}; delete from public.payments where client_id = '${clientId}'; commit;`);
      wipe(jobA, statement ? [statement] : []);
      wipe(jobB);
      sql(`delete from public.clients where id = '${clientId}'`);
    }
  });
});
