// The agreement is drafted on the job (T112): price from the job's contract,
// scope from the accepted proposal, contract.py's words. Staff read the draft
// on the job before anything else; a draft has no client link, and Billing
// can't issue or send it. Seeded on the local database only, removed after.

import { execSync } from "node:child_process";

import { expect, test } from "./support/env";

const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = (q: string) => execSync(`psql "${DB}" -qAtc ${JSON.stringify(q)}`, { encoding: "utf8" }).trim();

test.describe("The agreement on the job", () => {
  test("drafts from the accepted proposal, shows before any link, and stays out of Billing", async ({ owner: page }) => {
    const n = Date.now().toString().slice(-7);
    const name = `E2E ${n} N Agreement Rd`;
    const client = sql(`insert into public.clients (name, kind) values ('E2E Agreement ${n}', 'homeowner') returning id`);
    const job = sql(`insert into public.jobs (name, address, client_id, number_prefix, contract_cents) values ('${name}', '${n} N Agreement Rd, Scottsdale AZ', '${client}', 'A${n}', 4712500) returning id`);
    const proposal = JSON.stringify({
      proposal: {
        v: 1,
        title: "Framing & Drywall",
        packages: [
          { id: "p1", name: "Standard", highlights: [], recommended: false, totalCents: 4000000 },
          { id: "p2", name: "Premium", highlights: [], recommended: true, totalCents: 4500000 },
        ],
        sections: [
          { name: "Framing", pkgs: ["p1", "p2"], lines: [] },
          { name: "Drywall, level 5", pkgs: ["p2"], lines: [] },
          { name: "Drywall, level 4", pkgs: ["p1"], lines: [] },
        ],
        exclusions: ["Permits"],
      },
    });
    const est = sql(
      `insert into public.documents (kind, job_id, client_id, number, title, status, snapshot, total_cents, token, issued_at, issued_by) values ('estimate', '${job}', '${client}', 'EST-E${n}', 'Proposal', 'issued', '${proposal}'::jsonb, 4500000, 'e2a${n}', now(), 'E2E') returning id`,
    );
    const award = JSON.stringify({ documentId: est, number: `EST-E${n}`, revision: 1, packageId: "p2", packageName: "Premium", options: ["Garage drywall"], totalCents: 4712500, acceptedAt: "2026-10-20T17:00:00.000Z", acceptedBy: "E2E", awardedAt: "2026-10-21T15:00:00.000Z", awardedBy: "E2E" });
    sql(`update public.jobs set billing = jsonb_build_object('award', '${award}'::jsonb) where id = '${job}'`);
    const api = `/api/jobs/${job}/agreement`;
    try {
      const before = await page.request.get(api);
      expect(before.status()).toBe(200);
      expect(await before.json()).toMatchObject({ ok: true, agreement: null, blocked: null });

      // Price and scope are not for the caller to set.
      expect((await page.request.post(api, { data: { amount: 1 } })).status()).toBe(400);

      await page.goto(`/app/jobs/${job}`);
      const card = page.locator("div", { has: page.getByText("Agreement", { exact: true }) }).filter({ has: page.getByRole("button", { name: "Draft the agreement" }) }).last();
      await expect(card.getByRole("button", { name: "Draft the agreement" })).toBeVisible();
      await card.getByRole("button", { name: "Draft the agreement" }).click();

      const text = page.getByTestId("agreement-text");
      await expect(text).toContainText("PRIME RESIDENTIAL CONSTRUCTION AGREEMENT");
      await expect(text).toContainText(`A${n}-AGR`);
      await expect(text).toContainText("$47,125.00");
      await expect(text).toContainText("Framing & Drywall");
      await expect(text).toContainText(`Per Proposal EST-E${n} (Premium)`);
      await expect(text).toContainText("Drywall, level 5");
      await expect(text).not.toContainText("Drywall, level 4");
      await expect(text).toContainText("Add-on: Garage drywall");
      await expect(page.getByTestId("agreement-source")).toContainText("The client has no link to a draft.");
      await expect(page.locator('a[href*="/d/"]')).toHaveCount(0);

      const row = sql(`select id || '|' || status || '|' || coalesce(token, 'none') || '|' || total_cents from public.documents where kind = 'agreement' and job_id = '${job}'`);
      const [id, status, token, total] = row.split("|");
      expect([status, token, total]).toEqual(["draft", "none", "4712500"]);

      // Billing can't edit, issue or send it.
      const issue = await page.request.post(`/api/billing/documents/${id}/issue`);
      expect(issue.status()).toBe(409);
      expect((await issue.json()).error).toBe("an agreement is drafted and issued on its job");
      expect(sql(`select status || '|' || coalesce(token, 'none') from public.documents where id = '${id}'`)).toBe("draft|none");

      // Drafting again rewrites the same draft.
      const again = await page.request.post(api, { data: { clientName: "Heather E2E" } });
      expect(again.status()).toBe(200);
      const body = await again.json();
      expect(body.agreement).toMatchObject({ id, status: "draft", revision: 1, totalCents: 4712500 });
      expect(body.agreement.text).toContain("Name: Heather E2E");
      expect(body.agreement.link).toBeNull();
      expect(sql(`select count(*) from public.documents where kind = 'agreement' and job_id = '${job}'`)).toBe("1");
    } finally {
      sql(
        `set session_replication_role = replica; ` +
          `delete from public.documents where job_id = '${job}'; delete from public.jobs where id = '${job}'; delete from public.clients where id = '${client}'`,
      );
    }
  });

  test("won't draft before the job is awarded", async ({ owner: page }) => {
    const n = Date.now().toString().slice(-7);
    const job = sql(`insert into public.jobs (name, contract_cents) values ('E2E ${n} Unawarded', 100000) returning id`);
    try {
      const res = await page.request.post(`/api/jobs/${job}/agreement`, { data: {} });
      expect(res.status()).toBe(409);
      expect((await res.json()).error).toMatch(/^Award the job first/);
      expect(sql(`select count(*) from public.documents where job_id = '${job}'`)).toBe("0");
    } finally {
      sql(`delete from public.jobs where id = '${job}'`);
    }
  });
});
