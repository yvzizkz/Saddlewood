// The client signs the job's agreement on its link (T130): staff draft and
// issue it on the job, the client opens /d/<token> (not signed in), reads it
// and signs once, the job's agreement watch closes from that signature, a
// second signature is refused, and an owner who opens the watch again keeps
// it open. Seeded on the local database only, removed after.

import { execSync } from "node:child_process";

import { expect, test } from "./support/env";

const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = (q: string) => execSync(`psql "${DB}" -qAtc ${JSON.stringify(q)}`, { encoding: "utf8" }).trim();

test.describe("Signing the agreement on the client's link", () => {
  test("issue on the job, sign at /d/, the watch closes, one signature only", async ({ owner: page, browser }) => {
    const n = Date.now().toString().slice(-7);
    const name = `E2E ${n} S Signing Way`;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Phoenix" });
    const client = sql(`insert into public.clients (name, kind) values ('E2E Signing ${n}', 'homeowner') returning id`);
    const job = sql(`insert into public.jobs (name, address, client_id, number_prefix, contract_cents) values ('${name}', '${n} S Signing Way, Scottsdale AZ', '${client}', 'S${n}', 4712500) returning id`);
    const proposal = JSON.stringify({
      proposal: { v: 1, title: "Kitchen remodel", packages: [{ id: "p1", name: "Standard", highlights: [], recommended: true, totalCents: 4712500 }], sections: [{ name: "Cabinets", pkgs: ["p1"], lines: [] }], exclusions: [] },
    });
    const est = sql(
      `insert into public.documents (kind, job_id, client_id, number, title, status, snapshot, total_cents, token, issued_at, issued_by) values ('estimate', '${job}', '${client}', 'EST-S${n}', 'Proposal', 'issued', '${proposal}'::jsonb, 4712500, 'e2s${n}', now(), 'E2E') returning id`,
    );
    const award = JSON.stringify({ documentId: est, number: `EST-S${n}`, revision: 1, packageId: "p1", packageName: "Standard", options: [], totalCents: 4712500, acceptedAt: "2026-10-20T17:00:00.000Z", acceptedBy: "E2E", awardedAt: "2026-10-21T15:00:00.000Z", awardedBy: "E2E" });
    sql(`update public.jobs set billing = jsonb_build_object('award', '${award}'::jsonb) where id = '${job}'`);
    const watch = sql(`insert into public.job_watches (job_id, kind, title, due_on, note, created_by) values ('${job}', 'agreement', 'Full agreement signed', '${today}', 'E2E', 'E2E') returning id`);
    const watchState = () => sql(`select coalesce(done_at::text, 'open') || '|' || done_by from public.job_watches where id = ${watch}`);
    const clientCtx = await browser.newContext();
    try {
      const api = `/api/jobs/${job}/agreement`;
      expect((await page.request.post(`${api}/issue`)).status()).toBe(409); // nothing to issue yet
      expect((await page.request.post(api, { data: {} })).status()).toBe(200);

      // Staff issue it from the job's Agreement card; it gets the client's link.
      page.on("dialog", (d) => void d.accept());
      await page.goto(`/app/jobs/${job}`);
      await page.getByRole("button", { name: "Issue for signing" }).click();
      const link = page.getByTestId("agreement-link");
      await expect(link).toBeVisible();
      const href = (await link.getAttribute("href"))!;
      expect(href).toMatch(/^\/d\/[0-9a-f]{32}$/);
      expect(sql(`select status from public.documents where kind = 'agreement' and job_id = '${job}'`)).toBe("issued");
      expect((await page.request.post(`${api}/issue`)).status()).toBe(409);
      expect(watchState()).toMatch(/^open\|/);

      // The client, not signed in, reads it and signs it.
      const c = await clientCtx.newPage();
      await c.goto(href);
      await expect(c.getByTestId("agreement-text")).toContainText("PRIME RESIDENTIAL CONSTRUCTION AGREEMENT");
      await expect(c.getByTestId("agreement-price")).toHaveText("$47,125.00");
      const signBox = c.getByTestId("agreement-sign");
      await signBox.getByLabel("Your full name").fill("Heather Signer");
      await signBox.getByRole("checkbox").check();
      await signBox.getByRole("button", { name: "Sign the agreement" }).click();
      await expect(c.getByTestId("agreement-signed")).toContainText("Heather Signer");
      await expect(c.getByTestId("agreement-sign")).toHaveCount(0);

      const id = sql(`select id from public.documents where kind = 'agreement' and job_id = '${job}'`);
      expect(sql(`select count(*) || '|' || max(detail->>'role') || '|' || max(detail->>'name') || '|' || (max(detail->>'snapshotSha256') ~ '^[0-9a-f]{64}$') from public.document_events where document_id = '${id}' and kind = 'signed'`)).toBe("1|client|Heather Signer|true");
      expect(watchState()).toMatch(/\|record: S\d+-AGR signed by the client$/);

      // Read-only after: reopening shows the signature, and a second signature is refused.
      await c.reload();
      await expect(c.getByTestId("agreement-signed")).toContainText("Heather Signer");
      await expect(c.getByTestId("agreement-sign")).toHaveCount(0);
      const again = await c.request.post(`${href}/sign`, { data: { name: "Someone Else", method: "type", typed: "Someone Else", font: "dancing", image: "data:image/png;base64,AAAA", agree: true } });
      expect([400, 409]).toContain(again.status());
      expect(sql(`select count(*) from public.document_events where document_id = '${id}' and kind = 'signed'`)).toBe("1");

      // The card says who signed.
      await page.reload();
      await expect(page.getByTestId("agreement-signed")).toContainText("Signed by Heather Signer");

      // An owner who opens the watch again keeps it open: the signature does not close it a second time.
      sql(`update public.job_watches set done_at = null, done_by = 'reopened by E2E' where id = ${watch}`);
      expect((await page.request.get("/api/bot/home")).status()).toBe(200);
      expect(watchState()).toBe("open|reopened by E2E");
    } finally {
      await clientCtx.close();
      sql(
        `set session_replication_role = replica; ` +
          `delete from public.job_watches where job_id = '${job}'; delete from public.document_events where document_id in (select id from public.documents where job_id = '${job}'); ` +
          `delete from public.documents where job_id = '${job}'; delete from public.jobs where id = '${job}'; delete from public.clients where id = '${client}'`,
      );
    }
  });
});
