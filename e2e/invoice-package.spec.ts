// Finance's invoice package: the client's list against what's on the page, on
// the Bill screen. Local has no mail key, so the last step answers 503: past the
// package check, nothing sent. The send itself is in the route tests.

import { execSync } from "node:child_process";

import { cutoffInDays, expect, test } from "./support/env";

const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = (q: string) => execSync(`psql "${DB}" -qAtc ${JSON.stringify(q.replace(/\s+/g, " "))}`, { encoding: "utf8" }).trim();

test.describe("Finance: the invoice package", () => {
  test("a bill with no waiver can't go, the file clears it, and the task closes once it's out", async ({ owner: page }) => {
    const n = Date.now().toString().slice(-7);
    const name = `E2E Package ${n}`;
    const number = `K${n}-01`;
    const billing = JSON.stringify({ delivery: "email", cutoffDay: cutoffInDays(3), attachments: ["conditional_waiver"] });
    const client = sql(`insert into public.clients (name, billing) values ('${name}', '${billing}'::jsonb) returning id`);
    const job = sql(`insert into public.jobs (name, address, client_id) values ('${name} job', '${n} W Package Dr', '${client}') returning id`);
    const lines = JSON.stringify({ lines: [{ description: "Framing", amountCents: 120000 }] });
    const doc = sql(`insert into public.documents (kind, job_id, client_id, number, title, status, snapshot, total_cents) values ('invoice', '${job}', '${client}', '${number}', 'Framing', 'draft', '${lines}'::jsonb, 120000) returning id`);
    let group = "";
    try {
      const made = await page.request.post("/api/billing/send-groups", { data: { name: `PKG-${n}`, documents: [doc] } });
      expect(made.status()).toBe(201);
      group = (await made.json()).group.id;
      const message = { to: ["bot@saddlewoodcontracting.com"], subject: `Invoice ${number}`, body: "Attached.\n\n{links}" };
      expect((await page.request.patch(`/api/billing/send-groups/${group}`, { data: { message } })).status()).toBe(200);

      // The task opens the package waiting for this client.
      await page.goto("/app/tasks?view=all");
      const tasks = page.locator('[data-table="tasks-all"]');
      await tasks.getByRole("searchbox").fill(name);
      await expect(tasks.getByRole("row").filter({ hasText: `Invoice package for ${name}` })).toHaveCount(1);
      await page.goto("/app/accounting/billing?p=ytd");
      await page.getByRole("region", { name: "Billing calendar" }).getByRole("listitem").filter({ hasText: name }).getByRole("link", { name: "Open the package" }).click();
      await expect(page).toHaveURL(new RegExp(`/app/bill\\?group=${group}`));

      // No waiver: the screen says so, Send stays shut, and the server agrees.
      await expect(page.getByText(`Conditional waiver for ${number}`)).toBeVisible();
      const send = page.getByRole("button", { name: "Send", exact: true });
      await expect(send).toBeDisabled();
      const post = () => page.request.post(`/api/billing/send-groups/${group}/send`, { data: { ...message, confirm: true } });
      const refused = await post();
      expect(refused.status()).toBe(409);
      expect((await refused.json()).error).toBe(`Still needed before this goes: Conditional waiver for ${number}`);
      expect(sql(`select status from public.documents where id = '${doc}'`)).toBe("draft");

      // Adding the file clears it.
      await page.getByLabel(`Add the Conditional waiver for ${number}`).setInputFiles({ name: "waiver.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 e2e") });
      await expect(page.getByText("Ready")).toBeVisible();
      await expect(page.getByText(`Conditional waiver for ${number}`)).toHaveCount(0);
      await expect(send).toBeEnabled();
      expect(sql(`select label from public.document_exhibits where document_id = '${doc}' and removed_at is null`)).toBe(`Conditional waiver ${number}`);
      expect((await post()).status()).toBe(503);

      // Once the group is stamped sent, as a real send stamps it, the task is done.
      sql(`update public.send_groups set message = message || jsonb_build_object('sentAt', now()::text) where id = '${group}'`);
      await page.goto("/app/tasks?view=all");
      await tasks.getByRole("searchbox").fill(name);
      await expect(tasks.getByRole("row").filter({ hasText: `Invoice package for ${name}` })).toHaveCount(0);
      await page.goto("/app/accounting/billing?p=ytd");
      await expect(page.getByRole("region", { name: "Billing calendar" }).getByRole("listitem").filter({ hasText: name })).toContainText("Package sent");
    } finally {
      sql(`begin; set local session_replication_role = replica;
           delete from public.document_exhibits where document_id = '${doc}';
           delete from public.document_events where document_id = '${doc}';
           delete from public.documents where id = '${doc}';
           delete from public.send_groups where client_id = '${client}';
           delete from public.jobs where id = '${job}';
           delete from public.clients where id = '${client}';
           commit;`);
    }
  });
});
